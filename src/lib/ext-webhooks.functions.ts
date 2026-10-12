import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAccess } from "./team.functions";
import { EXT_EVENTS, sanitizeEvents } from "./ext-webhooks";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function manager(userId: string, claims: unknown) {
  const a = await loadAccess(userId);
  if (a.role !== "owner" && a.role !== "admin") throw new Error("Somente o dono ou administrador pode gerenciar webhooks.");
  await (await import("./finance.server")).assertTwoFactorIfEnrolled(claims, userId);
  return a;
}

/** Bloqueia endereços internos (proteção contra uso do servidor para acessar redes privadas). */
export function isSafeWebhookUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return true;
}

async function newSecret() {
  const { randomToken, encryptSecret } = await import("./crypto.server");
  const secret = `whsec_${randomToken(32)}`;
  return { secret, enc: encryptSecret(secret) };
}

export const listExtWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ integrationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await loadAccess(context.userId);
    const d = await db();
    const { data: eps } = await d.from("ext_webhook_endpoints").select("id, url, events, status, timeout_ms, created_at").eq("tenant_id", a.tenantId).eq("integration_id", data.integrationId).order("created_at");
    const ids = (eps ?? []).map((e) => e.id);
    const { data: dels } = ids.length
      ? await d.from("ext_webhook_deliveries").select("id, endpoint_id, event_id, type, status, attempts, last_status, last_error, created_at, delivered_at").in("endpoint_id", ids).order("created_at", { ascending: false }).limit(50)
      : { data: [] };
    return { allEvents: [...EXT_EVENTS], endpoints: eps ?? [], deliveries: dels ?? [] };
  });

export const createExtWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ integrationId: z.string().uuid(), url: z.string().max(500), events: z.array(z.string()).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await manager(context.userId, context.claims);
    if (!isSafeWebhookUrl(data.url)) throw new Error("Use um endereço https público (sem IP ou rede interna).");
    const events = sanitizeEvents(data.events);
    if (!events.length) throw new Error("Escolha ao menos um evento.");
    const d = await db();
    const { data: it } = await d.from("ext_integrations").select("id").eq("id", data.integrationId).eq("tenant_id", a.tenantId).neq("status", "revoked").maybeSingle();
    if (!it) throw new Error("Integração não encontrada.");
    const s = await newSecret();
    const { error } = await d.from("ext_webhook_endpoints").insert({ tenant_id: a.tenantId, integration_id: it.id, url: data.url, events, secret_enc: s.enc, created_by: context.userId });
    if (error) throw new Error("Não foi possível salvar o endereço.");
    return { secret: s.secret };
  });

const epInput = (d: unknown) => z.object({ id: z.string().uuid() }).parse(d);
async function ownEndpoint(tenantId: string, id: string) {
  const { data } = await (await db()).from("ext_webhook_endpoints").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) throw new Error("Endereço não encontrado.");
}

export const rotateExtWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(epInput)
  .handler(async ({ data, context }) => {
    const a = await manager(context.userId, context.claims);
    await ownEndpoint(a.tenantId, data.id);
    const s = await newSecret();
    await (await db()).from("ext_webhook_endpoints").update({ secret_enc: s.enc, updated_at: new Date().toISOString() }).eq("id", data.id);
    return { secret: s.secret };
  });

export const setExtWebhookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["enable", "disable", "delete"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await manager(context.userId, context.claims);
    await ownEndpoint(a.tenantId, data.id);
    const d = await db();
    if (data.action === "delete") await d.from("ext_webhook_endpoints").delete().eq("id", data.id);
    else await d.from("ext_webhook_endpoints").update({ status: data.action === "enable" ? "active" : "disabled" }).eq("id", data.id);
    return { ok: true };
  });

/** Envia na hora um evento de teste ou reenvia uma entrega existente. */
export const sendExtWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpointId: z.string().uuid(), deliveryId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await manager(context.userId, context.claims);
    await ownEndpoint(a.tenantId, data.endpointId);
    const d = await db();
    const { deliverOne } = await import("./ext-webhooks.server");
    let row: { id: string; endpoint_id: string; body: unknown; attempts: number } | null = null;
    if (data.deliveryId) {
      row = (await d.from("ext_webhook_deliveries").select("id, endpoint_id, body, attempts").eq("id", data.deliveryId).eq("endpoint_id", data.endpointId).maybeSingle()).data;
      if (!row) throw new Error("Entrega não encontrada.");
      await d.from("ext_webhook_deliveries").update({ status: "pending", attempts: 0 }).eq("id", row.id);
      row.attempts = 0;
    } else {
      const { randomToken } = await import("./crypto.server");
      const eventId = `evt_test_${randomToken(12)}`;
      const body = { id: eventId, object: "event", type: "webhook.test", created: Math.floor(Date.now() / 1000), data: { message: "Teste da WiizePay" } };
      row = (await d.from("ext_webhook_deliveries").insert({ tenant_id: a.tenantId, endpoint_id: data.endpointId, event_id: eventId, type: "webhook.test", body: body as never }).select("id, endpoint_id, body, attempts").single()).data;
      if (!row) throw new Error("Não foi possível enviar o teste.");
    }
    return deliverOne(d, row);
  });
