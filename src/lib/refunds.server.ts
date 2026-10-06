import { getTenantProvider } from "./billing.server";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Envia o estorno ao processador. Nunca marca como concluído aqui: só o aviso oficial conclui. */
export async function sendRefundToProvider(admin: AdminClient, refundId: string) {
  const { data: r } = await (admin.from as any)("refunds").select("id, tenant_id, payment_id, refund_amount, status, reason").eq("id", refundId).single();
  if (!r || r.status !== "requested") return;
  const { data: p } = await admin.from("payments").select("provider_payment_id").eq("id", r.payment_id).single();
  const conn = await getTenantProvider(admin, r.tenant_id);
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
    await (admin.rpc as any)("apply_refund_event", { _refund_id: r.id, _status: "processing", _provider_status: st || "REQUESTED", _event_id: null, _message: null });
    // Pix/boleto costumam concluir na hora; a confirmação oficial ainda chega por aviso, mas se a resposta já trouxer REFUNDED, concluímos.
    if (st === "REFUNDED") {
      await (admin.rpc as any)("apply_refund_event", { _refund_id: r.id, _status: "completed", _provider_status: st, _event_id: `api-${r.id}`, _message: null });
      const { syncRefundsFromProvider } = await import("./coproduction.server");
      await syncRefundsFromProvider(admin, r.payment_id, true).catch((e) => console.error("coproduction refund sync", e instanceof Error ? e.message : "x"));
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const msg = /saldo|balance/i.test(raw)
      ? "Saldo insuficiente no processador para estornar agora. Tente novamente após novos recebimentos."
      : "O processador recusou o estorno. Nenhum valor saiu do seu saldo.";
    await fail(msg);
    await admin.from("audit_logs").insert({ tenant_id: r.tenant_id, action: "refund.provider", resource: "refund", resource_id: r.id, result: "failure", metadata: { error: raw.slice(0, 300) } as never });
  }
}

/** Retorna true quando o evento pertence a um reembolso iniciado pela WiizePay. */
export async function handleRefundWebhook(admin: AdminClient, tenantId: string | null, providerPaymentId: string, eventType: string, eventId: string) {
  let q = admin.from("payments").select("id").eq("provider_payment_id", providerPaymentId);
  if (tenantId) q = q.eq("tenant_id", tenantId);
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
