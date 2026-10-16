import { applySandboxAction, type SandboxAction, type SandboxKind } from "./ext-sandbox";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
export type SandboxRow = Awaited<ReturnType<typeof loadSandbox>>;

async function loadSandbox(db: Db, tenantId: string, id: string) {
  const { data } = await db.from("ext_sandbox_charges").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return data;
}

/** Corpo dos avisos de teste: mesmo formato das cobranças reais, sem documento completo. */
export function sandboxPayload(r: NonNullable<SandboxRow>) {
  return {
    charge_id: r.id, checkout_session_id: r.id, service_id: r.service_id, charge_type: r.charge_type,
    external_customer_id: r.external_customer_id, external_subscription_id: r.external_subscription_id,
    subscription_id: r.charge_type === "recurring" ? r.id : null, subscription_status: r.subscription_status,
    sandbox: true,
    payments: [{ id: r.id, status: r.status, amount: Number(r.amount).toFixed(2), due_on: null, paid_at: r.status === "paid" ? r.updated_at : null, installment_number: null, installment_count: null, method: r.payment_method }],
  };
}

export function sandboxChargeView(r: NonNullable<SandboxRow>, base: string | null) {
  return {
    id: r.id, object: "charge", livemode: false, sandbox: true, status: r.status, charge_type: r.charge_type,
    amount: Number(r.amount).toFixed(2), currency: "BRL", payment_method: r.payment_method,
    service_id: r.service_id, checkout_session_id: r.id, customer_id: null,
    external_customer_id: r.external_customer_id, external_subscription_id: r.external_subscription_id,
    subscription_id: r.charge_type === "recurring" ? r.id : null,
    checkout_url: base ? `${base}/teste-checkout/${r.public_token}` : null, portal_url: null, receipt_url: null,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

/** Envia na hora os avisos de teste recém-criados; a fila cuida das novas tentativas. */
async function deliverNow(db: Db, eventId: string | null) {
  if (!eventId) return;
  const { deliverOne } = await import("./ext-webhooks.server");
  const { data: rows } = await db.from("ext_webhook_deliveries").select("id, endpoint_id, body, attempts").eq("event_id", eventId).eq("status", "pending");
  for (const r of rows ?? []) await deliverOne(db, r);
}

export async function emitSandbox(db: Db, r: NonNullable<SandboxRow>, type: Parameters<typeof import("./ext-webhooks.server")["fanOut"]>[4]) {
  const { fanOut } = await import("./ext-webhooks.server");
  // O estado entra no id do evento: a mesma transição nunca gera dois eventos.
  const eventId = await fanOut(db, r.tenant_id, r.integration_id, null, type, { ...sandboxPayload(r), history_size: (r.history as unknown[]).length });
  await deliverNow(db, eventId);
}

/**
 * Aplica uma simulação. Atualização condicionada ao status anterior: duas chamadas
 * simultâneas não aprovam duas vezes.
 */
export async function simulateSandbox(db: Db, tenantId: string, id: string, action: SandboxAction, actor: string) {
  const row = await loadSandbox(db, tenantId, id);
  if (!row) return { ok: false as const, error: "not_found" };
  const res = applySandboxAction({ status: row.status, kind: row.charge_type as SandboxKind, cyclesPaid: row.cycles_paid, subscriptionStatus: row.subscription_status }, action);
  if (!res.ok) return { ok: false as const, error: res.error };
  const history = [...((row.history as unknown[]) ?? []), { at: new Date().toISOString(), action, label: res.label, event: res.event, by: actor }].slice(-100);
  const { data: updated } = await db.from("ext_sandbox_charges")
    .update({ status: res.next.status, cycles_paid: res.next.cyclesPaid, subscription_status: res.next.subscriptionStatus, history: history as never, updated_at: new Date().toISOString() })
    .eq("id", id).eq("tenant_id", tenantId).eq("status", row.status).eq("cycles_paid", row.cycles_paid)
    .select("*").maybeSingle();
  if (!updated) return { ok: false as const, error: "conflict" };
  await emitSandbox(db, updated, res.event);
  return { ok: true as const, row: updated, label: res.label, event: res.event };
}
