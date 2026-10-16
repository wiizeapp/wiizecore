import type { ExtCtx } from "./ext-api.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

/** Base pública usada nos links devolvidos pela API. */
async function base() {
  return (await import("./billing.server")).publicBaseUrl(null);
}

/**
 * Cobrança vista pela API: só cobranças criadas por ESTA integração, na empresa da chave.
 * Sem CPF, sem cartão e sem números internos de taxa.
 */
export async function liveChargeView(ctx: ExtCtx, chargeGroupId: string) {
  const { db, tenantId } = ctx;
  const { data: s } = await db.from("ext_checkout_sessions").select("id, customer_id, service_id, payment_link_id, external_customer_id, external_subscription_id, created_at").eq("tenant_id", tenantId).eq("integration_id", ctx.integrationId).eq("charge_group_id", chargeGroupId).maybeSingle();
  if (!s) return null;
  const { data: pays } = await db.from("payments").select("id, status, gross_amount, due_on, paid_at, installment_number, installment_count, method, invoice_url, subscription_id, updated_at").eq("tenant_id", tenantId).eq("charge_group_id", chargeGroupId).order("due_on", { ascending: true });
  const { data: svc } = await db.from("services").select("type").eq("id", s.service_id).eq("tenant_id", tenantId).maybeSingle();
  const { data: link } = s.payment_link_id ? await db.from("payment_links").select("token_ciphertext, revoked_at").eq("id", s.payment_link_id).maybeSingle() : { data: null };
  const { decryptSecret } = await import("./crypto.server");
  const b = await base();
  const token = link?.token_ciphertext && !link.revoked_at ? decryptSecret(link.token_ciphertext) : null;
  const list = pays ?? [];
  const first = list.find((p) => !["paid", "cancelled", "refunded"].includes(p.status)) ?? list[list.length - 1];
  const total = list.reduce((a, p) => a + Math.round(Number(p.gross_amount) * 100), 0);
  return {
    id: chargeGroupId, object: "charge", livemode: ctx.environment === "live", sandbox: false,
    status: first?.status ?? "created", charge_type: svc?.type ?? "one_time",
    amount: (total / 100).toFixed(2), currency: "BRL", payment_method: first?.method ?? null,
    service_id: s.service_id, checkout_session_id: s.id, customer_id: s.customer_id,
    external_customer_id: s.external_customer_id, external_subscription_id: s.external_subscription_id,
    subscription_id: list.find((p) => p.subscription_id)?.subscription_id ?? null,
    checkout_url: token && b ? `${b}/pagar/${token}` : null,
    portal_url: b ? `${b}/portal/${tenantId}` : null,
    receipt_url: list.find((p) => p.status === "paid" && p.invoice_url)?.invoice_url ?? null,
    payments: list.map((p) => ({ id: p.id, status: p.status, amount: Number(p.gross_amount).toFixed(2), due_on: p.due_on, paid_at: p.paid_at, installment_number: p.installment_number, installment_count: p.installment_count, method: p.method })),
    created_at: s.created_at,
  };
}

/** Assinatura vinculada a uma cobrança desta integração. */
export async function liveSubscriptionView(ctx: ExtCtx, subscriptionId: string) {
  const { db, tenantId } = ctx;
  const { data: sub } = await db.from("subscriptions").select("id, active, amount, frequency, method, starts_on, ends_on, next_charge_on, cycles, cycles_done, service_id, customer_id, provider_subscription_id, created_at, updated_at").eq("id", subscriptionId).eq("tenant_id", tenantId).maybeSingle();
  if (!sub) return null;
  const { data: pays } = await db.from("payments").select("id, charge_group_id, status, gross_amount, due_on, paid_at").eq("tenant_id", tenantId).eq("subscription_id", sub.id).order("due_on", { ascending: true });
  const groups = [...new Set((pays ?? []).map((p) => p.charge_group_id))];
  if (!groups.length) return null;
  const { data: s } = await db.from("ext_checkout_sessions").select("id, charge_group_id, external_customer_id, external_subscription_id").eq("tenant_id", tenantId).eq("integration_id", ctx.integrationId).in("charge_group_id", groups).limit(1).maybeSingle();
  if (!s) return null;
  const list = pays ?? [];
  const overdue = list.some((p) => p.status === "overdue");
  return {
    id: sub.id, object: "subscription", livemode: ctx.environment === "live", sandbox: false,
    status: !sub.active ? "cancelled" : overdue ? "overdue" : list.some((p) => p.status === "paid") ? "active" : "pending",
    amount: Number(sub.amount).toFixed(2), currency: "BRL", frequency: sub.frequency, payment_method: sub.method,
    service_id: sub.service_id, customer_id: sub.customer_id, charge_id: s.charge_group_id, checkout_session_id: s.id,
    external_customer_id: s.external_customer_id, external_subscription_id: s.external_subscription_id,
    starts_on: sub.starts_on, ends_on: sub.ends_on, next_charge_on: sub.active ? sub.next_charge_on : null,
    cycles: sub.cycles, cycles_paid: list.filter((p) => p.status === "paid").length,
    cycles_history: list.map((p) => ({ payment_id: p.id, status: p.status, amount: Number(p.gross_amount).toFixed(2), due_on: p.due_on, paid_at: p.paid_at })),
    provider_managed: Boolean(sub.provider_subscription_id),
    created_at: sub.created_at, updated_at: sub.updated_at,
  };
}

export function sandboxSubscriptionView(r: { id: string; amount: number; frequency: string | null; payment_method: string | null; service_id: string; external_customer_id: string | null; external_subscription_id: string | null; subscription_status: string | null; cycles_paid: number; created_at: string; updated_at: string; status: string }) {
  return {
    id: r.id, object: "subscription", livemode: false, sandbox: true, status: r.subscription_status ?? "pending",
    amount: Number(r.amount).toFixed(2), currency: "BRL", frequency: r.frequency, payment_method: r.payment_method,
    service_id: r.service_id, customer_id: null, charge_id: r.id, checkout_session_id: r.id,
    external_customer_id: r.external_customer_id, external_subscription_id: r.external_subscription_id,
    cycles_paid: r.cycles_paid, current_cycle_status: r.status, provider_managed: false,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}
