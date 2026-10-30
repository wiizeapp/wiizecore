import { getPaymentProvider } from "./financial-origin.server";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Envia o estorno ao processador. Nunca marca como concluído aqui: só o aviso oficial conclui. */
export async function sendRefundToProvider(admin: AdminClient, refundId: string) {
  const { data: r } = await (admin.from as any)("refunds").select("id, tenant_id, payment_id, refund_amount, status, reason").eq("id", refundId).single();
  if (!r || r.status !== "requested") return;
  const { data: p } = await admin.from("payments").select("provider_payment_id").eq("id", r.payment_id).eq("tenant_id", r.tenant_id).single();
  const conn = await getPaymentProvider(admin, r.tenant_id, r.payment_id);
  const fail = async (msg: string) => {
    await (admin.rpc as any)("apply_refund_event", { _refund_id: r.id, _status: "failed", _provider_status: "ERROR", _event_id: null, _message: msg });
  };
  if (!conn || !p?.provider_payment_id) return fail("Conta de pagamentos indisponível. Nenhum valor saiu do seu saldo.");
  try {
    // Coprodução: cada coprodutor devolve sua parte proporcional; sem isso o Asaas tiraria tudo do principal.
    const { refundSharesFor } = await import("./coproduction.server");
    const remote = (await conn.provider.getPayment(p.provider_payment_id).catch(() => null)) as unknown as Record<string, unknown> | null;
    const splitRefunds = await refundSharesFor(admin, r.payment_id, Number(r.refund_amount), remote);
    const res = await conn.provider.refundPayment(p.provider_payment_id, { value: Number(r.refund_amount), description: String(r.reason).slice(0, 200), ...(splitRefunds.length ? { splitRefunds } : {}) });
    const st = String((res as Record<string, unknown>)["status"] ?? "");
    const { error } = await (admin.rpc as any)("apply_refund_event", { _refund_id: r.id, _status: "processing", _provider_status: st || "REQUESTED", _event_id: null, _message: null });
    if (error) throw new Error("refund_outcome_requires_reconciliation");
    // Even REFUNDED in a synchronous reply is not the authenticated event path.
    // Only handleRefundWebhook finalizes the refund and its split reconciliation.
  } catch {
    // A timeout/transport or persistence error is not evidence of rejection.
    // Keep the current operation/reservation; never issue an automatic retry.
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { tenantId: r.tenant_id, action: "refund.provider", resource: "refund", resourceId: r.id, result: "failure", metadata: { code: "provider_outcome_unknown" } });
  }
}

/** Retorna true quando o evento pertence a um reembolso iniciado pela WiizePay. */
export async function handleRefundWebhook(admin: AdminClient, tenantId: string, providerPaymentId: string, eventType: string, eventId: string, connectionId: string) {
  const q = admin.from("payments").select("id").eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("provider", "asaas").eq("provider_payment_id", providerPaymentId);
  const { data: pay } = await q.limit(1).maybeSingle();
  if (!pay) return false;
  const { data: r } = await (admin.from as any)("refunds").select("id").eq("payment_id", pay.id).in("status", ["requested", "processing"]).limit(1).maybeSingle();
  if (!r) {
    // Aviso repetido de um reembolso já concluído: só confere a divisão (cumulativa, nunca estorna duas vezes).
    const { data: done } = await (admin.from as any)("refunds").select("id").eq("payment_id", pay.id).eq("status", "completed").limit(1).maybeSingle();
    if (!done || eventType === "PAYMENT_REFUND_IN_PROGRESS" || eventType === "PAYMENT_REFUND_DENIED") return false;
    const { syncRefundsFromProvider } = await import("./coproduction.server");
    await syncRefundsFromProvider(admin, pay.id, true);
    return eventType === "PAYMENT_PARTIALLY_REFUNDED";
  }
  const status = eventType === "PAYMENT_REFUND_IN_PROGRESS" ? "processing" : eventType === "PAYMENT_REFUND_DENIED" ? "failed" : "completed";
  const { error } = await (admin.rpc as any)("apply_refund_event", {
    _refund_id: r.id, _status: status, _provider_status: eventType, _event_id: eventId,
    _message: status === "failed" ? "O processador negou o estorno. Nenhum valor saiu do seu saldo." : null,
  });
  if (error) throw new Error(error.message);
  if (status === "completed") {
    const { syncRefundsFromProvider } = await import("./coproduction.server");
    await syncRefundsFromProvider(admin, pay.id, true);
  }
  return true;
}
