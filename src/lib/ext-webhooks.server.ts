import { createHash } from "node:crypto";
import { eventForTrigger, MAX_ATTEMPTS, nextBackoffMs, signExtWebhook, type ExtEvent } from "./ext-webhooks";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Dados públicos da cobrança para o SaaS: sem CPF, sem dados de cartão. */
async function chargePayload(db: Db, tenantId: string, chargeGroupId: string) {
  const { data: session } = await db.from("ext_checkout_sessions").select("id, integration_id, service_id, external_customer_id, external_subscription_id").eq("charge_group_id", chargeGroupId).eq("tenant_id", tenantId).maybeSingle();
  if (!session) return null;
  const { data: pays } = await db.from("payments").select("id, status, gross_amount, due_on, paid_at, installment_number, installment_count, method").eq("charge_group_id", chargeGroupId).eq("tenant_id", tenantId).order("due_on", { ascending: true });
  const { data: svc } = await db.from("services").select("type").eq("id", session.service_id).maybeSingle();
  const kind = (svc?.type ?? "one_time") as "one_time" | "installment" | "recurring";
  const list = pays ?? [];
  return {
    session, kind, paidCount: list.filter((p) => p.status === "paid").length,
    data: {
      charge_id: chargeGroupId, checkout_session_id: session.id, service_id: session.service_id, charge_type: kind,
      external_customer_id: session.external_customer_id, external_subscription_id: session.external_subscription_id,
      payments: list.map((p) => ({ id: p.id, status: p.status, amount: Number(p.gross_amount).toFixed(2), due_on: p.due_on, paid_at: p.paid_at, installment_number: p.installment_number, installment_count: p.installment_count, method: p.method })),
    },
  };
}

export async function fanOut(db: Db, tenantId: string, integrationId: string, chargeGroupId: string | null, type: ExtEvent, data: unknown): Promise<string | null> {
  const { data: integ } = await db.from("ext_integrations").select("environment").eq("id", integrationId).maybeSingle();
  const livemode = integ?.environment === "live";
  const { data: eps } = await db.from("ext_webhook_endpoints").select("id, events").eq("integration_id", integrationId).eq("tenant_id", tenantId).eq("status", "active");
  const targets = (eps ?? []).filter((e) => e.events.includes(type));
  if (!targets.length) return null;
  // Mesmo estado = mesmo evento: reprocessamentos não duplicam.
  const eventId = `evt_${createHash("sha256").update(`${integrationId}:${type}:${JSON.stringify(data)}`).digest("hex").slice(0, 32)}`;
  const body = { id: eventId, object: "event", type, livemode, created: Math.floor(Date.now() / 1000), data };
  await db.from("ext_webhook_deliveries").upsert(
    targets.map((t) => ({ tenant_id: tenantId, endpoint_id: t.id, event_id: eventId, type, charge_group_id: chargeGroupId, body: body as never })),
    { onConflict: "endpoint_id,event_id", ignoreDuplicates: true },
  );
  return eventId;
}

/** Enfileira o aviso para o SaaS. Nunca lança erro: não pode afetar a operação financeira. */
export async function enqueueExtChargeEvent(db: Db, tenantId: string, chargeGroupId: string, trigger: string) {
  try {
    const p = await chargePayload(db, tenantId, chargeGroupId);
    if (!p) return;
    await fanOut(db, tenantId, p.session.integration_id, chargeGroupId, eventForTrigger(trigger, p.kind, p.paidCount), p.data);
  } catch (e) {
    console.error("ext enqueue", e instanceof Error ? e.message : "x");
  }
}

export async function enqueueExtSessionCreated(db: Db, tenantId: string, chargeGroupId: string) {
  try {
    const p = await chargePayload(db, tenantId, chargeGroupId);
    if (p) await fanOut(db, tenantId, p.session.integration_id, chargeGroupId, "checkout.session.created", p.data);
  } catch (e) {
    console.error("ext enqueue", e instanceof Error ? e.message : "x");
  }
}

/** Envia uma entrega. Usado pela fila e pelo botão de reenvio/teste. */
export async function deliverOne(db: Db, d: { id: string; endpoint_id: string; body: unknown; attempts: number }) {
  const { data: ep } = await db.from("ext_webhook_endpoints").select("url, secret_enc, status, timeout_ms").eq("id", d.endpoint_id).maybeSingle();
  if (!ep || ep.status !== "active") {
    await db.from("ext_webhook_deliveries").update({ status: "failed", last_error: "endpoint_disabled" }).eq("id", d.id);
    return { ok: false, status: 0 };
  }
  const { decryptSecret } = await import("./crypto.server");
  const body = JSON.stringify(d.body);
  const ts = Math.floor(Date.now() / 1000);
  let status = 0;
  let err: string | null = null;
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "WiizePay-Webhooks/1", "WiizePay-Signature": signExtWebhook(decryptSecret(ep.secret_enc), ts, body) },
      body, redirect: "manual", signal: AbortSignal.timeout(ep.timeout_ms),
    });
    status = res.status;
    if (status < 200 || status >= 300) err = `http_${status}`;
  } catch (e) {
    err = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network_error";
  }
  const attempts = d.attempts + 1;
  if (!err) {
    await db.from("ext_webhook_deliveries").update({ status: "delivered", attempts, last_status: status, last_error: null, delivered_at: new Date().toISOString() }).eq("id", d.id);
    return { ok: true, status };
  }
  await db.from("ext_webhook_deliveries").update({
    status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, last_status: status || null, last_error: err,
    next_attempt_at: new Date(Date.now() + nextBackoffMs(attempts)).toISOString(),
  }).eq("id", d.id);
  return { ok: false, status };
}
