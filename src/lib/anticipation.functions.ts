import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: { from: (t: string) => any }; userId: string; claims: unknown };
const FINANCE = ["owner", "admin", "finance"];

async function membership(context: Ctx, roles?: string[]) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "anticipation.view");
  if (!data || (roles && !roles.includes(data.role))) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

/** Lista recebíveis pagos com elegibilidade local + histórico. */
export const listReceivables = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { localEligibility } = await import("./anticipation.server");
    const [{ data: pays }, { data: hist }] = await Promise.all([
      admin.from("payments")
        .select("id, description, method, status, gross_amount, net_amount, released_at, available_on, provider_payment_id, anticipation_status, installment_number, installment_count, customers(name)")
        .eq("tenant_id", m.tenant_id).in("status", ["paid", "awaiting_payment", "overdue", "in_analysis"]).is("released_at", null)
        .in("method", ["credit_card", "boleto"]).order("due_on", { ascending: false }).limit(100),
      admin.from("anticipation_requests")
        .select("id, created_at, status, gross_amount, provider_fee_amount, provider_fee_is_estimated, wiize_fee_amount, net_amount, provider_anticipation_id, provider_status, payments(id, description, method, provider_payment_id, customers(name))")
        .eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(100),
    ]);
    const receivables = (pays ?? []).map((p: any) => {
      const e = localEligibility(p);
      return {
        id: p.id, description: p.description, method: p.method, status: p.status, grossAmount: Number(p.gross_amount), netAmount: Number(p.net_amount ?? p.gross_amount),
        availableOn: p.available_on, customer: p.customers?.name ?? "—",
        installment: p.installment_count > 1 ? `${p.installment_number}/${p.installment_count}` : null,
        canCheck: !e, reason: e?.reason ?? null,
      };
    });
    return {
      receivables,
      candidateTotal: receivables.filter((r) => r.canCheck).reduce((s, r) => s + r.netAmount, 0),
      history: (hist ?? []).map((h: any) => ({
        id: h.id, createdAt: h.created_at, status: h.status, grossAmount: Number(h.gross_amount),
        providerFee: Number(h.provider_fee_amount), providerFeeEstimated: h.provider_fee_is_estimated,
        wiizeFee: Number(h.wiize_fee_amount), netAmount: Number(h.net_amount),
        anticipationId: h.provider_anticipation_id, providerStatus: h.provider_status,
        receivable: h.payments?.description ?? "Recebível", providerPaymentId: h.payments?.provider_payment_id ?? null,
        method: h.payments?.method ?? null, customer: h.payments?.customers?.name ?? "—",
      })),
    };
  });

/** Consulta elegibilidade no Asaas e simula (não executa nada). */
export const simulateReceivable = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx, FINANCE);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { simulateAnticipationFor } = await import("./anticipation.server");
    const r = await simulateAnticipationFor(admin, m.tenant_id, data.paymentId);
    if (!r.simulation) return { eligible: false as const, reason: r.eligibility.reason };
    const s = r.simulation;
    return { eligible: true as const, grossAmount: s.grossAmount, fee: s.wiizeFee, netAmount: s.netAmount, days: s.anticipationDays };
  });

/** requestAnticipation — revalida tudo no servidor, idempotente, exige 2FA + senha financeira. */
export const requestAnticipation = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) =>
    z.object({
      paymentId: z.string().uuid(),
      expectedNet: z.number().nonnegative(),
      financialPassword: z.string().min(1).max(200),
      idempotencyKey: z.string().min(8).max(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx, FINANCE);
    const { assertTwoFactor, assertFinancialPassword } = await import("./finance.server");
    assertTwoFactor(context.claims);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertFinancialPassword(admin, context.userId, data.financialPassword, "anticipation.request");
    await (await import("./activation.server")).assertCanReceivePayments(admin, m.tenant_id);

    const key = `${m.tenant_id}:${data.paymentId}:${data.idempotencyKey}`;
    const { data: existing } = await admin.from("anticipation_requests").select("id, status").eq("tenant_id", m.tenant_id).eq("idempotency_key", key).maybeSingle();
    if (existing) return { id: existing.id, status: existing.status };

    const { simulateAnticipationFor } = await import("./anticipation.server");
    const r = await simulateAnticipationFor(admin, m.tenant_id, data.paymentId);
    if (!r.simulation) throw new Error(r.eligibility.reason ?? "Este recebível ainda não está disponível para antecipação.");
    const s = r.simulation;
    if (Math.abs(s.netAmount - data.expectedNet) > 0.009) throw new Error("Os valores mudaram desde a simulação. Simule novamente antes de confirmar.");

    const { data: row, error } = await admin.from("anticipation_requests").insert({
      tenant_id: m.tenant_id, requested_by: context.userId, payment_id: s.paymentId, status: "pending", provider: "asaas",
      gross_amount: s.grossAmount, anticipation_fee_amount: s.wiizeFee, net_amount: s.netAmount,
      provider_fee_amount: s.providerFee, provider_fee_is_estimated: true, wiize_fee_amount: s.wiizeFee, wiize_margin_amount: s.margin,
      commercial_monthly_rate: s.monthlyRate, anticipation_days: s.anticipationDays, provider_net_amount: s.providerNetAmount,
      weighted_average_days: s.anticipationDays, receivable_count: 1, idempotency_key: key,
    }).select("id").single();
    if (error) throw new Error("Já existe uma antecipação em andamento para este recebível.");
    await admin.from("payments").update({ anticipation_status: "pending" }).eq("id", s.paymentId);

    const { getPaymentProvider } = await import("./financial-origin.server");
    const prov = await getPaymentProvider(admin, m.tenant_id, s.paymentId);
    const { data: pay } = await admin.from("payments").select("provider_payment_id").eq("id", s.paymentId).eq("tenant_id", m.tenant_id).single();
    try {
      if (!prov || !pay?.provider_payment_id) throw new Error("Pagamento temporariamente indisponível.");
      const ant = await prov.provider.createAnticipation({ payment: pay.provider_payment_id });
      await admin.from("anticipation_requests").update({
        provider_anticipation_id: ant.id, provider_status: ant.status ?? "PENDING", status: "processing", processed_at: new Date().toISOString(),
        ...(typeof ant.fee === "number" ? { provider_fee_amount: ant.fee, wiize_margin_amount: Math.round((s.wiizeFee - ant.fee) * 100) / 100 } : {}),
      }).eq("id", row.id);
      await admin.from("payments").update({ anticipation_status: "processing" }).eq("id", s.paymentId);
    } catch (e) {
      await admin.from("anticipation_requests").update({ status: "failed", failure_reason: e instanceof Error ? e.message.slice(0, 300) : "erro" }).eq("id", row.id);
      await admin.from("payments").update({ anticipation_status: "failed" }).eq("id", s.paymentId);
      await logAudit(admin, { userId: context.userId, tenantId: m.tenant_id, action: "anticipation.request", resource: "anticipation_requests", resourceId: row.id, result: "failure" } as never);
      throw new Error(e instanceof Error ? e.message : "O provedor recusou a antecipação.");
    }
    await logAudit(admin, { userId: context.userId, tenantId: m.tenant_id, action: "anticipation.request", resource: "anticipation_requests", resourceId: row.id });
    return { id: row.id, status: "processing" };
  });
