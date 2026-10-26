/**
 * Serviço de antecipação WiizePay.
 * Regra: só recebíveis JÁ PAGOS/CONFIRMADOS e marcados como antecipáveis pelo Asaas.
 * O cálculo definitivo e a execução são do Asaas; a WiizePay apresenta, confirma,
 * registra a taxa comercial separada do custo do provedor e concilia via webhook.
 */
import { anticipationEventToStatus } from "./asaas.server";
import { getTenantProvider } from "./billing.server";
import { getPaymentProvider } from "./financial-origin.server";
import { calculateAnticipationFromConfig, decimalToCents } from "./fee-engine.server";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type Eligibility = {
  eligible: boolean;
  reason: string | null;
  gross_amount: number;
  available_amount: number;
  provider_status: string | null;
  provider_anticipation_id: string | null;
};

const ACTIVE = ["pending", "processing", "completed"] as const;
const BLOCKED_PROVIDER_STATUSES = ["CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL", "REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "DELETED", "PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"];

function commercialMethod(p: { method: string | null; installment_count: number | null }) {
  if (p.method === "boleto") return "boleto";
  if (p.method === "pix") return "pix";
  if (p.method === "credit_card") return (p.installment_count ?? 1) > 1 ? "credit_card_installment" : "credit_card_single";
  return null;
}

const no = (reason: string, gross = 0, providerStatus: string | null = null): Eligibility => ({
  eligible: false, reason, gross_amount: gross, available_amount: 0, provider_status: providerStatus, provider_anticipation_id: null,
});

/** Validação local (barata) — não consulta o provedor. */
export function localEligibility(p: {
  status: string; method: string | null; released_at: string | null; provider_payment_id: string | null;
  gross_amount: number | string; anticipation_status: string | null;
}): Eligibility | null {
  const gross = Number(p.gross_amount);
  if (p.anticipation_status && (ACTIVE as readonly string[]).includes(p.anticipation_status)) return no("Este recebível já possui uma antecipação.", gross);
  if (p.status !== "paid") return no("Este recebível ainda não foi confirmado pelo provedor.", gross);
  if (p.released_at) return no("Este pagamento já está disponível no saldo e não precisa ser antecipado.", gross);
  if (p.method !== "credit_card" && p.method !== "boleto" && p.method !== "pix") return no("Este método não permite antecipação.", gross);
  if (!p.provider_payment_id) return no("Este recebível ainda não está disponível para antecipação.", gross);
  return null;
}

/** checkAnticipationEligibility — consulta o estado real no Asaas. Em dúvida, não antecipa. */
export async function checkAnticipationEligibility(admin: AdminClient, tenantId: string, paymentId: string) {
  const { data: p } = await admin
    .from("payments")
    .select("id, tenant_id, status, method, released_at, provider_payment_id, gross_amount, anticipation_status, installment_count, due_on, available_on, description, customer_id")
    .eq("id", paymentId).eq("tenant_id", tenantId).maybeSingle();
  if (!p) return { eligibility: no("Recebível não encontrado."), payment: null, prov: null };
  const local = localEligibility(p);
  if (local) return { eligibility: local, payment: p, prov: null };
  const prov = await getPaymentProvider(admin, tenantId, paymentId);
  if (!prov) return { eligibility: no("Conta de pagamentos não conectada."), payment: p, prov: null };
  let remote;
  try {
    if (!p.provider_payment_id) return { eligibility: no("Recebível não encontrado."), payment: p, prov };
    remote = await prov.provider.getPayment(p.provider_payment_id);
    if (remote.id !== p.provider_payment_id) throw new Error("provider_payment_mismatch");
  } catch {
    return { eligibility: no("Não foi possível confirmar a elegibilidade agora. Tente novamente."), payment: p, prov };
  }
  const st = remote.status ?? null;
  if (st && BLOCKED_PROVIDER_STATUSES.includes(st)) return { eligibility: no("Este recebível ainda não está disponível para antecipação.", Number(p.gross_amount), st), payment: p, prov };
  if (st !== "CONFIRMED" && st !== "RECEIVED") return { eligibility: no("Este recebível ainda não foi confirmado pelo provedor.", Number(p.gross_amount), st), payment: p, prov };
  if (remote.anticipated) return { eligibility: no("Este recebível já foi antecipado no provedor.", Number(p.gross_amount), st), payment: p, prov };
  // O campo "anticipable" do Asaas costuma vir vazio em subcontas; a simulação oficial decide.
  const gross = Number(p.gross_amount);
  return {
    eligibility: { eligible: true, reason: null, gross_amount: gross, available_amount: gross, provider_status: st, provider_anticipation_id: null },
    payment: p,
    prov,
  };
}

/** simulateAnticipation — usa o cálculo oficial do Asaas e separa a taxa comercial WiizePay. */
export async function simulateAnticipationFor(admin: AdminClient, tenantId: string, paymentId: string) {
  const { eligibility, payment, prov } = await checkAnticipationEligibility(admin, tenantId, paymentId);
  if (!eligibility.eligible || !payment || !prov) return { eligibility, simulation: null };
  let sim;
  try {
    sim = await prov.provider.simulateAnticipation({ payment: payment.provider_payment_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { eligibility: no(msg && msg.length < 200 ? `O Asaas não permitiu antecipar: ${msg}` : "O Asaas ainda não permite antecipar este recebível. Tente novamente mais tarde.", Number(payment.gross_amount)), simulation: null };
  }
  const gross = Number(sim.value ?? sim.totalValue ?? payment.gross_amount);
  const providerFee = Number(sim.fee ?? 0);
  const days = Number(sim.anticipationDays ?? 0);
  const method = commercialMethod(payment);
  const { data: cfg } = await admin
    .from("anticipation_fee_settings").select("id, monthly_percentage_fee")
    .eq("payment_method", method ?? "").eq("active", true)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (!cfg) return { eligibility: no("A antecipação ainda não está disponível para este método."), simulation: null };
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const commercial = calculateAnticipationFromConfig({ grossAmount: gross.toFixed(2), originalDueDate: due, anticipationDate: today, monthlyRate: cfg.monthly_percentage_fee });
  // O cliente nunca paga menos que o custo real do provedor.
  const wiizeFeeCents = Math.max(decimalToCents(commercial.anticipationFee.toFixed(2)), Math.round(providerFee * 100));
  const grossCents = decimalToCents(gross.toFixed(2));
  return {
    eligibility,
    simulation: {
      paymentId: payment.id,
      grossAmount: gross,
      providerFee,
      providerNetAmount: Number(sim.netValue ?? gross - providerFee),
      wiizeFee: wiizeFeeCents / 100,
      margin: (wiizeFeeCents - Math.round(providerFee * 100)) / 100,
      netAmount: (grossCents - wiizeFeeCents) / 100,
      anticipationDays: days,
      monthlyRate: Number(cfg.monthly_percentage_fee),
      feeConfigurationId: cfg.id,
    },
  };
}

/** Webhook RECEIVABLE_ANTICIPATION_* — idempotente por id do evento. */
export async function processAnticipationWebhook(
  admin: AdminClient,
  event: { id: string; tenant_id: string; provider_connection_id: string; event_type: string; external_event_id: string; payload: Record<string, any> },
) {
  const done = async (status: "processed" | "discarded", msg: string | null = null) =>
    admin.from("webhook_events").update({ processing_status: status, error_message: msg, processed_at: new Date().toISOString() }).eq("id", event.id).then(() => undefined);
  const ant = event.payload?.["anticipation"] as { id?: string; status?: string; fee?: number; netValue?: number } | undefined;
  if (!ant?.id) { await done("discarded", "Evento sem antecipação"); return; }
  const { data: req } = await admin
    .from("anticipation_requests").select("id, tenant_id, wiize_fee_amount, payment_id")
    .eq("provider", "asaas").eq("provider_connection_id", event.provider_connection_id).eq("provider_anticipation_id", ant.id).eq("tenant_id", event.tenant_id).maybeSingle();
  if (!req) { await done("discarded", "Antecipação desconhecida"); return; }
  if (typeof ant.fee === "number") {
    await admin.from("anticipation_requests").update({
      provider_fee_amount: ant.fee,
      provider_fee_is_estimated: false,
      wiize_margin_amount: Math.round((Number(req.wiize_fee_amount) - ant.fee) * 100) / 100,
      ...(typeof ant.netValue === "number" ? { provider_net_amount: ant.netValue } : {}),
    }).eq("id", req.id);
  }
  const status = anticipationEventToStatus(event.event_type);
  if (status) {
    const { error } = await (admin.rpc as any)("apply_anticipation_event", {
      _request_id: req.id, _status: status, _provider_status: ant.status ?? event.event_type, _event_id: event.external_event_id,
    });
    if (error) throw new Error(error.message);
    if (status === "completed") await collectMargin(admin, req.id);
  } else {
    // DEBITED / OVERDUE: impacto posterior. Registra e notifica; responsabilidade segue o contrato e o Asaas.
    await admin.from("anticipation_requests").update({ provider_status: ant.status ?? event.event_type, last_provider_event_id: event.external_event_id }).eq("id", req.id);
    await admin.from("notifications").insert({
      tenant_id: req.tenant_id, kind: "anticipation.impact", title: "Atualização em antecipação",
      body: "O provedor registrou um evento posterior nesta antecipação. Veja o histórico.", link: "/antecipacao",
    });
  }
  await admin.from("audit_logs").insert({
    tenant_id: req.tenant_id, action: `anticipation.${event.event_type.toLowerCase()}`, resource: "anticipation_requests",
    resource_id: req.id, result: "success", metadata: { source: "webhook" } as never,
  });
  await done("processed");
}

/** Chargeback/estorno em recebível antecipado: registra e avisa; sem absorção automática. */
export async function flagAnticipationImpact(admin: AdminClient, paymentId: string, eventType: string) {
  const { data: req } = await admin
    .from("anticipation_requests").select("id, tenant_id").eq("payment_id", paymentId).in("status", [...ACTIVE]).maybeSingle();
  if (!req) return;
  await admin.from("anticipation_requests").update({ provider_status: eventType }).eq("id", req.id);
  await admin.from("notifications").insert({
    tenant_id: req.tenant_id, kind: "anticipation.impact", title: "Recebível antecipado com contestação",
    body: "Um recebível antecipado recebeu estorno ou contestação. A conciliação seguirá o retorno do provedor.", link: "/antecipacao",
  });
  await admin.from("audit_logs").insert({
    tenant_id: req.tenant_id, action: "anticipation.impact", resource: "anticipation_requests", resource_id: req.id,
    result: "success", metadata: { event: eventType } as never,
  });
}

/** Transfere a margem WiizePay da subconta para a conta principal (uma vez). */
async function collectMargin(admin: AdminClient, requestId: string) {
  const { data: r } = await admin.from("anticipation_requests").select("tenant_id, payment_id, wiize_margin_amount, margin_transfer_id").eq("id", requestId).single();
  const margin = Number(r?.wiize_margin_amount ?? 0);
  const walletId = process.env["ASAAS_MASTER_WALLET_ID"];
  if (!r || r.margin_transfer_id || margin <= 0 || !walletId) return;
  if (!r.payment_id) return;
  const prov = await getPaymentProvider(admin, r.tenant_id, r.payment_id);
  if (!prov) return;
  try {
    const t = await prov.provider.createTransfer({ value: margin, walletId, description: "Margem WiizePay — antecipação" });
    await admin.from("anticipation_requests").update({ margin_transfer_id: t.id, margin_collected_at: new Date().toISOString() }).eq("id", requestId);
  } catch (e) {
    await admin.from("audit_logs").insert({
      tenant_id: r.tenant_id, action: "anticipation.margin_transfer", resource: "anticipation_requests", resource_id: requestId,
      result: "failure", metadata: { error: e instanceof Error ? e.message : "erro" } as never,
    });
  }
}
