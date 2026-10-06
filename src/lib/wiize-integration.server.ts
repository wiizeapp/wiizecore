import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto.server";

/** Endereços e credenciais do Wiize. Lidos só no servidor, nunca enviados à tela. */
export function wiizeConfig() {
  const baseUrl = process.env["WIIZE_BASE_URL"];
  const clientId = process.env["WIIZE_CLIENT_ID"];
  const clientSecret = process.env["WIIZE_CLIENT_SECRET"];
  const webhookSecret = process.env["WIIZE_WEBHOOK_SECRET"];
  const configured = Boolean(baseUrl && clientId && clientSecret);
  if (baseUrl && !baseUrl.startsWith("https://")) throw new Error("WIIZE_BASE_URL deve usar HTTPS");
  return { configured, baseUrl: baseUrl?.replace(/\/$/, ""), clientId, clientSecret, webhookSecret };
}

export const WIIZE_SCOPES = ["customers:read", "contracts:write", "charges:write", "events:receive"] as const;
export const STATE_TTL_MS = 10 * 60 * 1000;
export const SIGNATURE_WINDOW_S = 300;

export const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
export const b64url = (b: Buffer) => b.toString("base64url");

export function createPkce() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
export const newState = () => b64url(randomBytes(32));
export const sealToken = encryptSecret;
export const openToken = decryptSecret;

export function maskEmail(email: string | null | undefined) {
  if (!email || !email.includes("@")) return null;
  const [u, d] = email.split("@");
  return `${u!.slice(0, 2)}${"*".repeat(Math.max(1, u!.length - 2))}@${d}`;
}

/** Assinatura HMAC-SHA256 sobre `timestamp.corpo`. */
export function signPayload(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function validateTimestamp(ts: string | null, nowS = Math.floor(Date.now() / 1000)) {
  if (!ts || !/^\d{10}$/.test(ts)) return false;
  return Math.abs(nowS - Number(ts)) <= SIGNATURE_WINDOW_S;
}

export function validateSignature(secret: string, ts: string, body: string, sig: string | null) {
  if (!sig || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const a = Buffer.from(signPayload(secret, ts, body));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Db = Awaited<ReturnType<typeof getAdmin>>;
export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Limite simples por chave (usuário/empresa/IP/endpoint) usando a tabela rate_limits existente. */
export async function rateLimit(db: Db, key: string, max: number, windowS: number) {
  const since = new Date(Date.now() - windowS * 1000).toISOString();
  const table = db.from("integration_audit_log");
  const { count } = await table.select("id", { count: "exact", head: true }).eq("action", `rl:${key}`).gte("created_at", since);
  if ((count ?? 0) >= max) return false;
  await db.from("integration_audit_log").insert({ action: `rl:${key}`, outcome: "counted" });
  return true;
}

/** Auditoria — nunca recebe senhas, códigos 2FA ou tokens. */
export async function audit(db: Db, entry: { tenantId?: string | null; userId?: string | null; action: string; outcome?: string; details?: Record<string, unknown>; ip?: string | null }) {
  await db.from("integration_audit_log").insert({
    tenant_id: entry.tenantId ?? null,
    user_id: entry.userId ?? null,
    action: entry.action,
    outcome: entry.outcome ?? "success",
    details: (entry.details ?? {}) as never,
    ip: entry.ip ?? null,
  });
}

/** Chamada autenticada à API do Wiize para uma empresa conectada. */
export async function wiizeApi(db: Db, tenantId: string, path: string, init?: RequestInit) {
  const cfg = wiizeConfig();
  if (!cfg.configured) throw new Error("Integração com o Wiize ainda não configurada.");
  const { data: conn } = await db.from("wiize_connections").select("id, status").eq("tenant_id", tenantId).maybeSingle();
  if (!conn || conn.status !== "connected") throw new Error("Wiize não conectado.");
  const { data: tok } = await db.from("wiize_tokens").select("access_token_enc").eq("connection_id", conn.id).maybeSingle();
  if (!tok) throw new Error("Wiize não conectado.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${openToken(tok.access_token_enc)}`, Accept: "application/json" },
    redirect: "error",
  });
  if (!res.ok) throw new Error(`Wiize respondeu ${res.status}`);
  return res.json() as Promise<unknown>;
}

/** Coloca um aviso na fila de envio para o Wiize (somente se a empresa estiver conectada). */
export async function enqueueWiizeEvent(db: Db, tenantId: string, eventType: string, resourceType: string, resourceId: string, data: Record<string, unknown>) {
  const { data: conn } = await db.from("wiize_connections").select("status").eq("tenant_id", tenantId).maybeSingle();
  if (conn?.status !== "connected") return;
  await db.from("wiize_outbound_events").insert({ tenant_id: tenantId, event_type: eventType, resource_type: resourceType, resource_id: resourceId, payload: data as never });
}
