import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentProvider } from "./asaas.server";
import { sanitizeSteps, toAsaasNotifications, type DunningPlanCode } from "./dunning-rules";

/**
 * Aplica a régua a uma cobrança recém-criada: desconta a taxa (1x por cobrança, idempotente,
 * sem saldo negativo) e configura as notificações do cliente no Asaas.
 * Nunca derruba a criação da cobrança — falhas ficam registradas no histórico.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyDunning(admin: SupabaseClient<any>, provider: PaymentProvider, opts: { tenantId: string; paymentId: string; providerCustomerId: string }) {
  const { data: result, error } = await admin.rpc("dunning_charge_fee", { _payment_id: opts.paymentId });
  if (error) { console.error("dunning_charge_fee", error.message); return; }
  const { data: cfg } = await admin.from("dunning_tenant_config").select("plan_code, steps").eq("tenant_id", opts.tenantId).maybeSingle();
  const { data: pay } = await admin.from("payments").select("charge_group_id").eq("id", opts.paymentId).maybeSingle();
  const { data: groupPlan } = pay?.charge_group_id
    ? await admin.from("dunning_charge_plans").select("plan_code").eq("tenant_id", opts.tenantId).eq("charge_group_id", pay.charge_group_id).maybeSingle()
    : { data: null };
  const planCode = (groupPlan?.plan_code ?? cfg?.plan_code) as DunningPlanCode;
  if (!cfg || !provider.listCustomerNotifications || !provider.updateNotifications) return;
  const active = result === "charged" || result === "already";
  try {
    const list = await provider.listCustomerNotifications(opts.providerCustomerId);
    const steps = active ? sanitizeSteps(cfg.steps, planCode) : null;
    await provider.updateNotifications(opts.providerCustomerId, toAsaasNotifications(list, steps));
    if (result === "charged") await admin.from("dunning_events").insert({ tenant_id: opts.tenantId, payment_id: opts.paymentId, event: "configured", detail: "Avisos configurados no provedor" });
  } catch (e) {
    await admin.from("dunning_events").insert({ tenant_id: opts.tenantId, payment_id: opts.paymentId, event: "failed", detail: e instanceof Error ? e.message.slice(0, 200) : "Falha ao configurar avisos" });
  }
}

/** Encerra a régua da cobrança (pago, cancelado, estornado, chargeback). O valor já cobrado não é devolvido. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishDunning(admin: SupabaseClient<any>, paymentId: string, reason: "paid" | "cancelled" | "refunded" | "chargeback") {
  const { data } = await admin.from("dunning_charges").update({ status: reason === "paid" ? "finished" : "cancelled" }).eq("payment_id", paymentId).eq("status", "active").select("tenant_id");
  if (data?.[0]) await admin.from("dunning_events").insert({ tenant_id: data[0].tenant_id, payment_id: paymentId, event: reason });
}
