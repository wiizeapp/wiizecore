import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina diária: lembra cobranças em atraso (1, 3 e 7 dias) e contratos com link perto de vencer.
 * Protegida pela senha das tarefas automáticas; cada aviso é enviado uma única vez.
 */
async function run(request: Request) {
  const { authenticateWiizePayCron } = await import("@/lib/cron-auth.server");
  const denied = authenticateWiizePayCron(request);
  if (denied) return denied;
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { notifyTenant, brl } = await import("@/lib/notify.server");
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  let sent = 0;

  for (const d of [1, 3, 7]) {
    const { data: rows } = await admin.from("payments")
      .select("id, tenant_id, gross_amount, due_on, invoice_url, customers(name, email)")
      .eq("status", "overdue").eq("due_on", day(d)).limit(500);
    for (const p of rows ?? []) {
      const c = p.customers as { name?: string | null; email?: string | null } | null;
      if (d === 1) await notifyTenant(admin, {
        tenantId: p.tenant_id, kind: "payment.overdue", dedupeKey: `payment.overdue:${p.id}`, link: "/cobrancas",
        title: "Cobrança em atraso", body: `A cobrança de ${c?.name ?? "cliente"} (${brl(p.gross_amount)}) está em atraso.`,
        email: { subject: `Cobrança em atraso — ${c?.name ?? "cliente"}` },
      });
      // Cliente final não recebe lembretes da Wiize Core: só os do Asaas, quando a empresa contrata o plano de lembretes.
    }
  }

  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  const { data: links } = await admin.from("contract_links")
    .select("id, tenant_id, contract_id, expires_at, contracts(title, status)")
    .is("revoked_at", null).gt("expires_at", new Date().toISOString()).lt("expires_at", soon).limit(500);
  for (const l of links ?? []) {
    const c = l.contracts as { title?: string; status?: string } | null;
    if (!c || ["signed", "cancelled", "expired"].includes(c.status ?? "")) continue;
    await notifyTenant(admin, {
      tenantId: l.tenant_id, kind: "contract.expiring", dedupeKey: `contract.expiring:${l.id}`, link: `/contratos/${l.contract_id}`,
      title: "Link de assinatura perto de vencer", body: `O link do contrato “${c.title ?? "Contrato"}” vence em até 2 dias e ainda faltam assinaturas.`,
      email: { subject: "Contrato aguardando assinatura" },
    });
  }
  // Lembretes de assinatura pela vigência: 1 dia antes (só se houve prazo) e no dia do início.
  {
    const { issueContractLink } = await import("@/lib/contract-links.functions");
    const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // horário de Brasília
    const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
    for (const [stage, date] of [["day_before", tomorrow], ["start_day", today]] as const) {
      const { data: rows } = await admin.from("contracts")
        .select("id, tenant_id, created_at, customer_id")
        .eq("status", "awaiting_customer").eq("starts_on", date).is("archived_at", null)
        .not("customer_id", "is", null).limit(500);
      for (const c of rows ?? []) {
        // Criado no próprio dia anterior ou depois: não há prazo para o aviso de véspera.
        if (stage === "day_before" && String(c.created_at).slice(0, 10) >= tomorrow) continue;
        const { data: dup } = await admin.from("email_outbox" as never).select("id")
          .eq("dedupe_key", `contract.reminder_${stage}:${c.id}`).maybeSingle();
        if (dup) continue;
        try { await issueContractLink(admin, c.tenant_id, c.id, null, stage); sent++; } catch { /* ignora contrato não pronto */ }
      }
    }
  }
  // Lembrete diário enquanto a ativação tiver pendência há mais de 24 horas.
  const dayKey = new Date().toISOString().slice(0, 10);
  const { data: pendingActs } = await admin.from("payment_activations").select("tenant_id, review_message")
    .eq("status", "action_required").lt("updated_at", new Date(Date.now() - 86400000).toISOString()).limit(500);
  for (const a of pendingActs ?? []) {
    await notifyTenant(admin, {
      tenantId: a.tenant_id, kind: "activation.reminder", dedupeKey: `activation.reminder:${a.tenant_id}:${dayKey}`, link: "/ativacao",
      title: "Sua ativação ainda tem pendências", body: a.review_message ? String(a.review_message).slice(0, 200) : "Abra Ative seus pagamentos para concluir o que falta.",
      email: { subject: "Wiize Core — Conclua a ativação de pagamentos" },
    });
    sent++;
  }
  // Nova tentativa das devoluções da taxa do Asaas que falharam (cada uma continua travada contra duplicidade).
  const { reimburseProviderFee } = await import("@/lib/billing.server");
  const { data: pendingFees } = await admin.from("payments").select("id")
    .eq("status", "paid").is("provider_fee_reimbursement_id", null).gt("provider_fee_amount", 0).limit(200);
  let retried = 0;
  for (const p of pendingFees ?? []) { await reimburseProviderFee(admin, p.id); retried++; }
  // Primeira cobrança do cliente com 30 dias de atraso: cancelada automaticamente (contrato segue valendo).
  let autoCancelled = 0;
  {
    const { shouldAutoCancelFirstCharge, todaySaoPaulo, FIRST_CHARGE_AUTO_CANCEL_DAYS } = await import("@/lib/late-charges");
    const { logChargeEvent } = await import("@/lib/payment-attempts.server");
    const { getTenantProvider } = await import("@/lib/billing.server");
    const today = todaySaoPaulo();
    const limitDay = new Date(Date.parse(`${today}T00:00:00Z`) - FIRST_CHARGE_AUTO_CANCEL_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: stale } = await admin.from("payments")
      .select("id, tenant_id, customer_id, charge_group_id, provider_payment_id, gross_amount, due_on, original_due_on, created_at, customers(name)")
      .in("status", ["overdue", "awaiting_payment"]).is("provider_installment_id", null).is("subscription_id", null)
      .lte("due_on", limitDay).limit(200);
    for (const p of stale ?? []) {
      if (!p.customer_id) continue;
      const dueOn = (p.original_due_on as string | null) ?? p.due_on;
      const { count: paidCount } = await admin.from("payments").select("id", { count: "exact", head: true })
        .eq("tenant_id", p.tenant_id).eq("customer_id", p.customer_id).in("status", ["paid", "refunded"]);
      const { count: olderCount } = await admin.from("payments").select("id", { count: "exact", head: true })
        .eq("tenant_id", p.tenant_id).eq("customer_id", p.customer_id).lt("created_at", p.created_at).neq("id", p.id);
      if (!shouldAutoCancelFirstCharge(dueOn, today, (paidCount ?? 0) === 0 && (olderCount ?? 0) === 0)) continue;
      try {
        const conn = await getTenantProvider(admin, p.tenant_id);
        if (conn && p.provider_payment_id) await conn.provider.cancelPayment(p.provider_payment_id);
      } catch {
        continue; // tenta de novo amanhã; nunca marca cancelada sem cancelar no provedor
      }
      const { data: upd } = await admin.from("payments").update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", p.id).eq("tenant_id", p.tenant_id).in("status", ["overdue", "awaiting_payment"]).select("id");
      if (!upd?.length) continue;
      autoCancelled++;
      await logChargeEvent(admin, { tenantId: p.tenant_id, paymentId: p.id, type: "auto_cancelled", actor: "system", metadata: { days: FIRST_CHARGE_AUTO_CANCEL_DAYS, dueOn } });
      const c = p.customers as { name?: string | null } | null;
      await notifyTenant(admin, {
        tenantId: p.tenant_id, kind: "payment.auto_cancelled", dedupeKey: `payment.auto_cancelled:${p.id}:${dueOn}`, link: "/cobrancas",
        title: "Cobrança cancelada por falta de pagamento",
        body: `A primeira cobrança de ${c?.name ?? "cliente"} (${brl(p.gross_amount)}) ficou 30 dias sem pagamento e foi cancelada. O contrato continua valendo. Para cobrar de novo, use "Ativar novamente" na cobrança.`,
        email: { subject: `Cobrança cancelada — ${c?.name ?? "cliente"}` },
      });
    }
  }

  return Response.json({ ok: true, reminders: sent, feeRetries: retried, autoCancelled });
}

export const Route = createFileRoute("/api/public/cron/notifications")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
