import { normalizePercents, splitNet, validateRules, type ParticipantRule } from "./coproduction-math";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
const db = (admin: Admin) => admin as any;

export type CoproducerInput = { name: string; email: string; type: "percent" | "fixed"; percent?: number | null | undefined; fixedAmount?: number | null | undefined; responsibility?: string | null | undefined };

/** Encontra a empresa e a carteira aprovada de quem foi convidado. Só contas WiizePay ativas podem participar. */
export async function resolveCoproducer(admin: Admin, ownerTenantId: string, email: string) {
  const clean = email.trim().toLowerCase();
  const { data: profile } = await admin.from("profiles").select("id, full_name, email").ilike("email", clean).limit(1).maybeSingle();
  if (!profile) throw new Error(`O e-mail ${clean} precisa estar associado a uma conta WiizePay para participar da coprodução.`);
  const { data: member } = await admin.from("tenant_members").select("tenant_id, role").eq("user_id", profile.id).eq("status", "active").in("role", ["owner", "admin"]).limit(1).maybeSingle();
  if (!member) throw new Error(`A conta ${clean} não administra uma empresa na WiizePay.`);
  if (member.tenant_id === ownerTenantId) throw new Error("Você não pode convidar alguém da sua própria empresa como coprodutor.");
  const { data: approved } = await admin.rpc("can_receive_payments", { _tenant_id: member.tenant_id });
  const { data: conn } = await admin.from("provider_connections").select("wallet_id").eq("tenant_id", member.tenant_id).eq("provider", "asaas").eq("status", "connected").limit(1).maybeSingle();
  if (!approved || !conn?.wallet_id) throw new Error(`A conta ${clean} ainda não tem os recebimentos aprovados. Peça para concluir a ativação antes do convite.`);
  return { userId: profile.id, tenantId: member.tenant_id as string, walletId: conn.wallet_id as string, email: clean };
}

/** Valida tudo antes de a cobrança existir, para nunca criar cobrança com convite impossível. */
export async function prepareCoproducers(admin: Admin, ownerTenantId: string, list: CoproducerInput[], estimatedNetTotal: number) {
  const rules: ParticipantRule[] = list.map((c) => ({ type: c.type, percent: c.percent ?? null, fixedAmount: c.fixedAmount ?? null }));
  const err = validateRules(rules, estimatedNetTotal);
  if (err) throw new Error(err);
  const emails = list.map((c) => c.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) throw new Error("O mesmo e-mail aparece mais de uma vez.");
  const percents = normalizePercents(rules, estimatedNetTotal);
  const out = [];
  for (const [i, c] of list.entries()) {
    const r = await resolveCoproducer(admin, ownerTenantId, c.email);
    out.push({ ...r, name: c.name.trim().slice(0, 120), type: c.type, percent: percents[i]!, fixedAmount: c.type === "fixed" ? Math.round(Number(c.fixedAmount) * 100) / 100 : null, responsibility: c.responsibility?.trim().slice(0, 300) || null });
  }
  if (new Set(out.map((o) => o.tenantId)).size !== out.length) throw new Error("Duas pessoas convidadas pertencem à mesma empresa.");
  return out;
}

export async function createCoproduction(admin: Admin, input: { tenantId: string; chargeGroupId: string; userId: string; participants: Awaited<ReturnType<typeof prepareCoproducers>> }) {
  const { data: cp, error } = await db(admin).from("payment_coproductions").insert({ tenant_id: input.tenantId, charge_group_id: input.chargeGroupId, created_by: input.userId, status: "pending" }).select("id").single();
  if (error || !cp) throw new Error("Não foi possível registrar a coprodução.");
  const rows = input.participants.map((p) => ({
    coproduction_id: cp.id, tenant_id: input.tenantId, participant_tenant_id: p.tenantId, participant_user_id: p.userId, wallet_id: p.walletId,
    email: p.email, name: p.name, participation_type: p.type, percentage: p.percent, fixed_amount: p.fixedAmount, responsibility: p.responsibility,
  }));
  const { error: pe } = await db(admin).from("payment_coproduction_participants").insert(rows);
  if (pe) throw new Error("Não foi possível registrar os coprodutores.");
  await db(admin).from("coproduction_events").insert({ coproduction_id: cp.id, tenant_id: input.tenantId, actor_user_id: input.userId, event: "created", metadata: { participants: rows.map((r) => ({ email: r.email, percentage: r.percentage })) } });
  const { notifyTenant, tenantName, brl } = await import("./notify.server");
  const owner = await tenantName(admin, input.tenantId);
  for (const p of input.participants) {
    await notifyTenant(admin, {
      tenantId: p.tenantId, kind: "coproduction.invite", dedupeKey: `coproduction.invite:${cp.id}:${p.tenantId}`, link: `/coproducoes/${cp.id}`,
      title: "Convite para coprodução", body: `${owner} convidou você para uma coprodução de ${p.percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do valor líquido recebido.`,
      email: { subject: `Convite de coprodução — ${owner}`, lines: [{ label: "Participação", value: `${p.percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` }, ...(p.fixedAmount ? [{ label: "Valor de referência", value: brl(p.fixedAmount) }] : [])] },
    });
  }
  return cp.id as string;
}

/** Coprodução que ainda impede o pagamento (aceite pendente, recusa ou divisão não registrada no Asaas). */
export async function coproductionBlocksCheckout(admin: Admin, chargeGroupId: string) {
  const { data } = await db(admin).from("payment_coproductions").select("status, split_applied_at").eq("charge_group_id", chargeGroupId).in("status", ["pending", "active", "rejected"]).maybeSingle();
  if (!data) return false;
  return data.status !== "active" || !data.split_applied_at;
}

async function activeParticipants(admin: Admin, chargeGroupId: string) {
  const { data: cp } = await db(admin).from("payment_coproductions").select("id, status").eq("charge_group_id", chargeGroupId).eq("status", "active").maybeSingle();
  if (!cp) return null;
  const { data: parts } = await db(admin).from("payment_coproduction_participants").select("id, wallet_id, percentage, name").eq("coproduction_id", cp.id).eq("status", "accepted");
  return { id: cp.id as string, parts: (parts ?? []) as { id: string; wallet_id: string; percentage: number; name: string }[] };
}

/** Divisão completa de uma parcela para o Asaas: taxa WiizePay + parte de cada coprodutor, calculada pelo líquido daquela parcela. */
export async function splitFor(admin: Admin, chargeGroupId: string, gross: number, platformFee: number) {
  const master = process.env["ASAAS_MASTER_WALLET_ID"];
  const split: { walletId: string; fixedValue: number }[] = [];
  if (master && platformFee > 0) split.push({ walletId: master, fixedValue: Math.round(platformFee * 100) / 100 });
  const cp = await activeParticipants(admin, chargeGroupId);
  if (cp) {
    const r = splitNet(gross - platformFee, cp.parts.map((p) => Number(p.percentage)));
    cp.parts.forEach((p, i) => { if (r.participants[i]! > 0) split.push({ walletId: p.wallet_id, fixedValue: r.participants[i]! }); });
  }
  return split;
}

/** Depois que todos aceitam: registra a divisão no Asaas em cada parcela ainda em aberto. */
export async function applySplitToOpenPayments(admin: Admin, coproductionId: string) {
  const { data: cp } = await db(admin).from("payment_coproductions").select("id, tenant_id, charge_group_id, status").eq("id", coproductionId).single();
  if (!cp || cp.status !== "active") return;
  const { getTenantProvider } = await import("./billing.server");
  const conn = await getTenantProvider(admin, cp.tenant_id);
  if (!conn) throw new Error("Conta de pagamentos não ativada.");
  const { data: rows } = await admin.from("payments").select("id, provider_payment_id, gross_amount, platform_fee_amount, status").eq("tenant_id", cp.tenant_id).eq("charge_group_id", cp.charge_group_id).in("status", ["created", "awaiting_payment", "overdue"]).not("provider_payment_id", "is", null);
  const errors: string[] = [];
  for (const r of rows ?? []) {
    try {
      const split = await splitFor(admin, cp.charge_group_id, Number(r.gross_amount), Number(r.platform_fee_amount ?? 0));
      await conn.provider.updatePayment(r.provider_payment_id!, { split });
    } catch (e) {
      errors.push(e instanceof Error ? e.message.slice(0, 200) : "erro");
    }
  }
  await db(admin).from("payment_coproductions").update(errors.length ? { split_error: errors[0], updated_at: new Date().toISOString() } : { split_applied_at: new Date().toISOString(), split_error: null, updated_at: new Date().toISOString() }).eq("id", cp.id);
  await db(admin).from("coproduction_events").insert({ coproduction_id: cp.id, tenant_id: cp.tenant_id, event: errors.length ? "split.failed" : "split.applied", metadata: { payments: rows?.length ?? 0, errors: errors.slice(0, 3) } });
  if (errors.length) throw new Error("O Asaas não aceitou a divisão em uma das parcelas. Tente novamente em instantes.");
}

/**
 * Após confirmação do Asaas: lê a divisão que o próprio Asaas aplicou nesta parcela
 * e registra o valor real de cada coprodutor. Sem divisão no Asaas, nada é creditado.
 */
export async function recordSplitFromProvider(admin: Admin, paymentId: string, remote: Record<string, unknown> | null, eventId: string | null) {
  const { data: p } = await admin.from("payments").select("id, tenant_id, charge_group_id, provider_payment_id, status").eq("id", paymentId).maybeSingle();
  if (!p || p.status !== "paid") return;
  const cp = await activeParticipants(admin, p.charge_group_id);
  if (!cp || !cp.parts.length) return;
  let split = (remote?.["split"] as { walletId?: string; totalValue?: number; fixedValue?: number; status?: string }[] | undefined) ?? null;
  if (!split?.length && p.provider_payment_id) {
    const { getTenantProvider } = await import("./billing.server");
    const conn = await getTenantProvider(admin, p.tenant_id);
    const fresh = conn ? ((await conn.provider.getPayment(p.provider_payment_id)) as unknown as Record<string, unknown>) : null;
    split = (fresh?.["split"] as typeof split) ?? null;
  }
  const items = cp.parts.map((part) => {
    const s = split?.find((x) => x.walletId === part.wallet_id && !["CANCELLED", "REFUSED", "BLOCKED_BY_VALUE_DIVERGENCE"].includes(String(x.status ?? "")));
    return { participant_id: part.id, amount: Number(s?.totalValue ?? s?.fixedValue ?? 0) };
  }).filter((i) => i.amount > 0);
  if (!items.length) {
    await (admin as any).from("reconciliation_issues").upsert({ tenant_id: p.tenant_id, payment_id: p.id, kind: "coproduction_split_missing", details: { coproduction_id: cp.id } }, { onConflict: "payment_id,kind" });
    return;
  }
  const { error } = await (admin.rpc as any)("apply_coproduction_split", { _payment_id: p.id, _items: items, _event_id: eventId });
  if (error) throw new Error(error.message);
}
