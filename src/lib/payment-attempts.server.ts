import { computeLateCharges, todaySaoPaulo } from "./late-charges";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Actor = "customer" | "provider" | "system";
export type SwitchMethod = "pix" | "boleto" | "credit_card";

const OPEN = ["created", "awaiting_payment", "overdue"];
const BILLING: Record<SwitchMethod, string> = { pix: "PIX", boleto: "BOLETO", credit_card: "CREDIT_CARD" };
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function logChargeEvent(
  admin: Admin,
  e: { tenantId: string; paymentId: string; type: string; actor?: Actor; userId?: string | null; metadata?: Record<string, unknown> },
) {
  await admin.from("charge_events").insert({
    tenant_id: e.tenantId,
    payment_id: e.paymentId,
    event_type: e.type,
    actor: e.actor ?? "system",
    actor_user_id: e.userId ?? null,
    metadata: (e.metadata ?? {}) as never,
  });
}

async function latestAppearanceId(admin: Admin, tenantId: string) {
  const { data } = await admin.from("checkout_appearance_versions").select("id").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Registra a tentativa original de cada cobrança recém-criada. Idempotente. */
export async function recordOriginalAttempts(admin: Admin, tenantId: string, chargeGroupId: string, userId: string | null) {
  const appearanceId = await latestAppearanceId(admin, tenantId);
  const { data: rows } = await admin
    .from("payments")
    .select("id, method, provider_payment_id, gross_amount, due_on, invoice_url, bank_slip_url, current_attempt_id")
    .eq("tenant_id", tenantId)
    .eq("charge_group_id", chargeGroupId);
  for (const p of rows ?? []) {
    if (p.current_attempt_id) continue;
    let attemptId: string | null = null;
    if (p.provider_payment_id) {
      const { data: a } = await admin
        .from("payment_attempts")
        .upsert({
          tenant_id: tenantId, payment_id: p.id, attempt_number: 1, method: p.method, provider_payment_id: p.provider_payment_id,
          status: "active", reason: "original", amount: p.gross_amount, due_on: p.due_on, invoice_url: p.invoice_url,
          bank_slip_url: p.bank_slip_url, actor: "provider", actor_user_id: userId, idempotency_key: "original",
        }, { onConflict: "payment_id,idempotency_key" })
        .select("id")
        .single();
      attemptId = a?.id ?? null;
    }
    await admin.from("payments").update({
      current_attempt_id: attemptId,
      original_amount: p.gross_amount,
      original_due_on: p.due_on,
      checkout_appearance_version_id: appearanceId,
    }).eq("id", p.id).eq("tenant_id", tenantId);
    await logChargeEvent(admin, { tenantId, paymentId: p.id, type: "created", actor: "provider", userId, metadata: { method: p.method } });
  }
}

type PaymentRow = {
  id: string; tenant_id: string; status: string; method: string | null; gross_amount: number; due_on: string;
  original_amount: number | null; original_due_on: string | null; fine_percent: number | null; interest_percent: number | null;
  provider_payment_id: string | null; provider_installment_id: string | null; subscription_id: string | null;
  customer_id: string | null; service_id: string | null; charge_group_id: string; description: string | null; current_attempt_id: string | null;
};

const PAYMENT_COLS =
  "id, tenant_id, status, method, gross_amount, due_on, original_amount, original_due_on, fine_percent, interest_percent, provider_payment_id, provider_installment_id, subscription_id, customer_id, service_id, charge_group_id, description, current_attempt_id";

export async function loadPayment(admin: Admin, tenantId: string, paymentId: string) {
  const { data } = await admin.from("payments").select(PAYMENT_COLS).eq("id", paymentId).eq("tenant_id", tenantId).maybeSingle();
  return data as PaymentRow | null;
}

/** Parcelas e recorrências pertencem a um plano do provedor e não podem ser recriadas isoladamente. */
export function canSwitch(p: Pick<PaymentRow, "status" | "provider_installment_id" | "subscription_id" | "provider_payment_id">) {
  return OPEN.includes(p.status) && !p.provider_installment_id && !p.subscription_id && Boolean(p.provider_payment_id);
}

/** Valor atualizado calculado só no servidor, a partir das regras gravadas na cobrança. */
export function quote(p: Pick<PaymentRow, "gross_amount" | "original_amount" | "due_on" | "original_due_on" | "fine_percent" | "interest_percent">) {
  return computeLateCharges({
    amount: Number(p.original_amount ?? p.gross_amount),
    finePercent: Number(p.fine_percent ?? 0),
    interestPercentMonthly: Number(p.interest_percent ?? 0),
    dueOn: p.original_due_on ?? p.due_on,
    today: todaySaoPaulo(),
  });
}

export async function allowedMethods(admin: Admin, p: PaymentRow): Promise<SwitchMethod[]> {
  const all: SwitchMethod[] = ["pix", "boleto", "credit_card"];
  if (!p.service_id) return all;
  const { data } = await admin.from("services").select("accepted_methods").eq("id", p.service_id).maybeSingle();
  const accepted = (data?.accepted_methods as string[] | null) ?? [];
  const filtered = all.filter((m) => accepted.includes(m));
  return filtered.length ? filtered : all;
}

/**
 * Cria uma nova tentativa no provedor para a MESMA cobrança (troca de forma ou regularização).
 * Ordem segura: confere a tentativa atual → cria a nova → cancela a anterior → ativa a nova.
 */
/** Desconto de cupom reservado ou usado nesta cobrança (definido só no servidor). */
export async function activeCouponDiscount(admin: Admin, paymentId: string) {
  const { data } = await admin.from("coupon_redemptions").select("id, discount_amount, coupon_id").eq("payment_id", paymentId).in("status", ["reserved", "redeemed"]).maybeSingle();
  return data ? { id: data.id, couponId: data.coupon_id, discount: Number(data.discount_amount) } : null;
}

export async function switchPaymentAttempt(
  admin: Admin,
  input: { tenantId: string; paymentId: string; method: SwitchMethod; reason: "method_change" | "regularization" | "coupon" | "reactivation"; actor: Actor; userId?: string | null; idempotencyKey: string; keySuffix?: string; reactivateDueOn?: string },
) {
  let p = await loadPayment(admin, input.tenantId, input.paymentId);
  if (!p) throw new Error("Cobrança não encontrada.");

  // Chave derivada do estado atual: duplo clique, duas abas ou nova tentativa após demora
  // para a mesma troca reaproveitam a mesma operação em vez de criar outra.
  const { data: latest } = await admin.from("payment_attempts").select("attempt_number").eq("payment_id", p.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  input = { ...input, idempotencyKey: `s${latest?.attempt_number ?? 0}_${input.method}${input.keySuffix ? `_${input.keySuffix}` : ""}` };
  const { data: same } = await admin.from("payment_attempts").select("id, status").eq("payment_id", p.id).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (same && same.status !== "failed") return { attemptId: same.id, reused: true };

  const reactivating = input.reason === "reactivation";
  if (reactivating) {
    if (p.status !== "cancelled" || p.provider_installment_id || p.subscription_id || !p.provider_payment_id || !input.reactivateDueOn) throw new Error("Esta cobrança não pode ser ativada novamente.");
    if (input.reactivateDueOn < todaySaoPaulo()) throw new Error("Escolha uma data de hoje em diante.");
    p = { ...p, original_due_on: input.reactivateDueOn, due_on: input.reactivateDueOn };
  } else if (!canSwitch(p)) throw new Error("Esta cobrança não permite trocar a forma de pagamento.");
  if (!(await allowedMethods(admin, p)).includes(input.method)) throw new Error("Forma de pagamento indisponível para esta cobrança.");
  const raw = quote(p);
  const coupon = await activeCouponDiscount(admin, p.id);
  const { applyDiscount } = await import("./coupon-math");
  const q = coupon ? { ...raw, total: applyDiscount(raw.total, coupon.discount) } : raw;
  if (input.reason === "method_change" && p.method === input.method && q.days === 0) throw new Error("Essa já é a forma de pagamento atual.");

  const { data: last } = await admin.from("payment_attempts").select("attempt_number").eq("payment_id", p.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  const number = (last?.attempt_number ?? 0) + 1;
  const reason = reactivating ? "retry" : input.reason === "coupon" ? "coupon" : q.days > 0 ? "regularization" : (input.reason as "method_change" | "regularization");
  const today = todaySaoPaulo();
  const dueOn = (p.original_due_on ?? p.due_on) < today ? today : p.original_due_on ?? p.due_on;

  const { data: pending, error: lockError } = await admin
    .from("payment_attempts")
    .insert({
      tenant_id: p.tenant_id, payment_id: p.id, attempt_number: number, method: input.method, status: "pending", reason,
      amount: q.total, fine_amount: q.fine, interest_amount: q.interest, due_on: dueOn, actor: input.actor,
      actor_user_id: input.userId ?? null, idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (lockError || !pending) throw new Error("Já existe uma alteração em andamento para esta cobrança. Aguarde alguns segundos.");

  const fail = async (message: string) => {
    await admin.from("payment_attempts").update({ status: "failed", error_message: message.slice(0, 300) }).eq("id", pending.id);
    throw new Error(message);
  };

  const { getTenantProvider, computePlatformFeeDetails } = await import("./billing.server");
  const conn = await getTenantProvider(admin, p.tenant_id);
  const masterWalletId = process.env["ASAAS_MASTER_WALLET_ID"];
  if (!conn || !masterWalletId) return fail("Pagamento temporariamente indisponível.");
  const { data: customer } = await admin.from("customers").select("provider_customer_id").eq("id", p.customer_id ?? "").eq("tenant_id", p.tenant_id).maybeSingle();
  if (!customer?.provider_customer_id) return fail("Cadastro do cliente incompleto para esta operação.");

  // Nunca substitui uma tentativa que o provedor já confirmou.
  try {
    const current = await conn.provider.getPayment(p.provider_payment_id!);
    const st = String((current as { status?: string }).status ?? "");
    if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(st)) return fail("O pagamento desta cobrança já foi confirmado.");
  } catch (e) {
    if (e instanceof Error && e.message.includes("confirmado")) throw e;
  }

  const singleCash = !p.provider_installment_id && !p.subscription_id;
  const fee = await computePlatformFeeDetails(admin, q.total, input.method, 1, false, singleCash ? p.tenant_id : undefined);
  const extras: Record<string, unknown> = {};
  if (Number(p.fine_percent) > 0) extras["fine"] = { value: Number(p.fine_percent), type: "PERCENTAGE" };
  if (Number(p.interest_percent) > 0) extras["interest"] = { value: Number(p.interest_percent) };

  let coverCents = 0;
  let created: { id: string; invoiceUrl?: string | null; bankSlipUrl?: string | null };
  try {
    created = await conn.provider.createPayment({
      customer: customer.provider_customer_id,
      billingType: BILLING[input.method],
      value: q.total,
      dueDate: dueOn,
      description: p.description ?? "Cobrança",
      externalReference: p.id,
      ...(await (async () => {
        const { splitFor } = await import("./coproduction.server");
        const split = await splitFor(admin, p.charge_group_id, q.total, fee.totalFeeCents / 100);
        if (!split.length && fee.totalFeeCents > 0) {
          // À vista sem coprodução: o Asaas retém o custo dele e a Wiize Core recebe só a diferença.
          if (singleCash && conn.provider.getMyFees) {
            try {
              const { estimateProviderFeeCents, coveredProviderFeeCents } = await import("./provider-fee-quote");
              coverCents = coveredProviderFeeCents(fee.totalFeeCents, estimateProviderFeeCents(await conn.provider.getMyFees() as never, input.method, Math.round(q.total * 100)));
            } catch { coverCents = 0; }
          }
          const wiize = fee.totalFeeCents - coverCents;
          return wiize > 0 ? { split: [{ walletId: masterWalletId, fixedValue: wiize / 100 }] } : {};
        }
        return split.length ? { split } : {};
      })()),
      ...extras,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "O provedor recusou a nova forma de pagamento.");
  }

  try {
    // Na reativação a tentativa anterior já foi cancelada no provedor.
    if (reactivating) await conn.provider.cancelPayment(p.provider_payment_id!).catch(() => undefined);
    else await conn.provider.cancelPayment(p.provider_payment_id!);
  } catch {
    await conn.provider.cancelPayment(created.id).catch(() => undefined);
    return fail("Não foi possível substituir a forma de pagamento agora. Tente novamente.");
  }

  if (p.current_attempt_id) await admin.from("payment_attempts").update({ status: "superseded" }).eq("id", p.current_attempt_id).eq("status", "active");
  else await admin.from("payment_attempts").update({ status: "superseded" }).eq("payment_id", p.id).eq("status", "active");
  await admin.from("payment_attempts").update({
    status: "active", provider_payment_id: created.id, invoice_url: created.invoiceUrl ?? null, bank_slip_url: created.bankSlipUrl ?? null,
  }).eq("id", pending.id);

  await admin.from("payments").update({
    provider_payment_id: created.id,
    method: input.method,
    status: "awaiting_payment",
    gross_amount: q.total,
    due_on: dueOn,
    platform_fee_amount: fee.totalFee,
    provider_fee_covered_amount: coverCents / 100,
    fee_configuration_id: fee.feeConfigurationId,
    fee_fixed_amount: fee.fixedFee,
    fee_percentage: fee.percentageFee,
    fee_percentage_amount: fee.percentageFeeAmount,
    fee_calculated_at: fee.calculationTimestamp,
    net_amount: r2(q.total - fee.totalFee),
    invoice_url: created.invoiceUrl ?? null,
    bank_slip_url: created.bankSlipUrl ?? null,
    current_attempt_id: pending.id,
    original_amount: p.original_amount ?? p.gross_amount,
    original_due_on: p.original_due_on ?? p.due_on,
    ...(reactivating ? { original_amount: q.base } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", p.id).eq("tenant_id", p.tenant_id);

  // O link continua o mesmo; se tinha expirado, ganha 3 dias para concluir o pagamento.
  const soon = new Date(Math.max(Date.now(), Date.parse(`${dueOn}T23:59:59-03:00`)) + 3 * 86_400_000).toISOString();
  await admin.from("payment_links").update({ expires_at: soon }).eq("tenant_id", p.tenant_id).eq("charge_group_id", p.charge_group_id).lt("expires_at", soon).is("revoked_at", null);

  await logChargeEvent(admin, {
    tenantId: p.tenant_id, paymentId: p.id, type: reactivating ? "reactivated" : reason === "regularization" ? "regularized" : reason === "coupon" ? "coupon_updated" : "method_changed",
    actor: input.actor, userId: input.userId ?? null,
    metadata: { from: p.method, to: input.method, attempt: number, total: q.total, fine: q.fine, interest: q.interest, days: q.days, discount: coupon?.discount ?? 0 },
  });
  const { logAudit } = await import("./audit.server");
  await logAudit(admin, {
    tenantId: p.tenant_id, userId: input.userId ?? undefined, action: `charge.${reason}`, resource: "payments", resourceId: p.id,
    metadata: { from: p.method, to: input.method, actor: input.actor, attempt: number },
  } as never);
  return { attemptId: pending.id, reused: false };
}

/** Eventos do provedor sobre tentativas já substituídas não alteram a cobrança. */
export async function isSupersededProviderPayment(admin: Admin, providerPaymentId: string) {
  const { data } = await admin.from("payment_attempts").select("status, tenant_id").eq("provider_payment_id", providerPaymentId).maybeSingle();
  return data && ["superseded", "failed", "cancelled"].includes(data.status) ? data : null;
}

/**
 * Cobrança vencida: antes de mostrar Pix/boleto ou cobrar no cartão, garante que o valor
 * no provedor é o total atualizado do dia (multa + juros pelas regras gravadas na cobrança).
 * Uma nova tentativa por dia no máximo; parcelados/recorrentes seguem o cálculo do provedor.
 */
export async function ensureLateValueToday(admin: Admin, tenantId: string, paymentId: string, method: SwitchMethod) {
  const p = await loadPayment(admin, tenantId, paymentId);
  if (!p || !canSwitch(p)) return false;
  const raw = quote(p);
  if (raw.days <= 0) return false;
  const coupon = await activeCouponDiscount(admin, p.id);
  const { applyDiscount } = await import("./coupon-math");
  const total = coupon ? applyDiscount(raw.total, coupon.discount) : raw.total;
  if (Math.abs(Number(p.gross_amount) - total) < 0.005 && p.due_on >= todaySaoPaulo()) return false;
  await switchPaymentAttempt(admin, {
    tenantId, paymentId, method, reason: "regularization", actor: "customer",
    idempotencyKey: "late", keySuffix: `late${todaySaoPaulo().replace(/-/g, "")}`,
  });
  return true;
}
