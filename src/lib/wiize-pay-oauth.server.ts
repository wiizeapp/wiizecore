import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DEPLOY_CONFIG } from "./deploy-config";
import { hashSecretValue, verifySecretValue } from "./crypto.server";

/** Servidor de autorização Wiize Recebe para o cliente Wiize (CRM). Tudo aqui roda só no servidor. */
export const WIIZE_CLIENT_NAME = "Wiize";
export const WIIZE_REDIRECT_URIS: string[] = [...DEPLOY_CONFIG.wiizeRedirectUris];
export const WIIZE_ALLOWED_SCOPES = ["crm.read", "contacts.read", "companies.read", "deals.read", "sales.read", "products.read", "charges.write", "customers.write"];
export const CODE_TTL_S = 60;
export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 86400;
export const CHECKOUT_TTL_MIN = 15;
export const SECRET_GRACE_MS = 24 * 3600 * 1000;
export const WIIZE_WEBHOOK_URL = DEPLOY_CONFIG.wiizeWebhookUrl;
export const RETRY_DELAYS_S = [60, 300, 1800, 7200, 43200];

export const sha256hex = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
export const randomSecret = (bytes = 36) => randomBytes(bytes).toString("base64url");
export const newCode = () => randomSecret(32);
export const hashClientSecret = hashSecretValue;

export async function getAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
type Db = Awaited<ReturnType<typeof getAdmin>>;

export function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AuthorizeParams = {
  response_type?: string | undefined; client_id?: string | undefined; redirect_uri?: string | undefined; scope?: string | undefined;
  state?: string | undefined; code_challenge?: string | undefined; code_challenge_method?: string | undefined;
};

/** Valida o pedido de autorização. Erros NUNCA redirecionam: são mostrados na tela. */
export async function validateAuthorize(db: Db, p: AuthorizeParams) {
  if (p.response_type !== "code") return { error: "Tipo de resposta inválido." } as const;
  if (!p.client_id || p.client_id.length > 200) return { error: "Aplicativo inválido." } as const;
  const { data: client } = await db.from("oauth_clients").select("client_id, name, redirect_uris, allowed_scopes, active").eq("client_id", p.client_id).maybeSingle();
  if (!client || !client.active) return { error: "Aplicativo não autorizado ou desativado." } as const;
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) return { error: "Endereço de retorno não permitido." } as const;
  if (p.code_challenge_method !== "S256" || !p.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge)) return { error: "Verificação PKCE inválida (use S256)." } as const;
  if (!p.state || p.state.length > 500) return { error: "Parâmetro state ausente ou inválido." } as const;
  const scopes = [...new Set((p.scope ?? "").split(" ").filter(Boolean))];
  if (!scopes.length || scopes.length > 20 || scopes.some((s) => !client.allowed_scopes.includes(s))) return { error: "Permissão solicitada não é permitida." } as const;
  return { client, scopes, redirectUri: p.redirect_uri, state: p.state, challenge: p.code_challenge } as const;
}

/** Confere client_id + client_secret em tempo constante (aceita o segredo anterior por 24 h após rotação). */
export async function authenticateClient(db: Db, clientId: string | null, secret: string | null) {
  if (!clientId || !secret || clientId.length > 200 || secret.length > 500) return null;
  const { data: c } = await db.from("oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
  if (!c || !c.active) {
    verifySecretValue(secret, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(88)); // tempo equivalente
    return null;
  }
  if (verifySecretValue(secret, c.client_secret_hash)) return c;
  if (c.previous_secret_hash && c.previous_secret_expires_at && new Date(c.previous_secret_expires_at).getTime() > Date.now() && verifySecretValue(secret, c.previous_secret_hash)) return c;
  return null;
}

export async function issueTokens(db: Db, input: { clientId: string; userId: string; tenantId: string; scopes: string[]; familyId?: string; rotatedFrom?: string | null; codeId?: string | null }) {
  const access = `wpat_${randomSecret(36)}`;
  const refresh = `wprt_${randomSecret(36)}`;
  const now = Date.now();
  const { error } = await db.from("oauth_tokens").insert({
    access_token_hash: sha256hex(access), refresh_token_hash: sha256hex(refresh),
    client_id: input.clientId, user_id: input.userId, tenant_id: input.tenantId, scopes: input.scopes,
    access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString(),
    family_id: input.familyId ?? crypto.randomUUID(), rotated_from: input.rotatedFrom ?? null, code_id: input.codeId ?? null,
  });
  if (error) throw new Error("token_insert");
  const { data: t } = await db.from("tenants").select("name").eq("id", input.tenantId).maybeSingle();
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: ACCESS_TTL_S, scope: input.scopes.join(" "), account_name: t?.name ?? null };
}

export async function revokeFamily(db: Db, where: { familyId?: string; codeId?: string; tenantId?: string; clientId?: string }) {
  let q = db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
  if (where.familyId) q = q.eq("family_id", where.familyId);
  if (where.codeId) q = q.eq("code_id", where.codeId);
  if (where.tenantId) q = q.eq("tenant_id", where.tenantId);
  if (where.clientId) q = q.eq("client_id", where.clientId);
  await q;
}

export const oauthJson = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...extra } });

export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function audit(db: Db, e: { tenantId?: string | null; userId?: string | null; action: string; outcome?: string; details?: Record<string, unknown>; ip?: string | null }) {
  await db.from("integration_audit_log").insert({ tenant_id: e.tenantId ?? null, user_id: e.userId ?? null, action: e.action, outcome: e.outcome ?? "success", details: (e.details ?? {}) as never, ip: e.ip ?? null });
}

export async function limit(db: Db, scope: string, id: string, max: number) {
  const { consumeRateLimit } = await import("./audit.server");
  const r = await consumeRateLimit(db, { scope, identifier: id, maxAttempts: max, windowSeconds: 60, blockSeconds: 60 });
  return r.allowed;
}

/** Valida o Bearer da API: hash, validade, revogação e escopo. A empresa vem SEMPRE do token. */
export async function authenticateBearer(db: Db, request: Request, scope: string) {
  const m = /^Bearer (wpat_[A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const { data: t } = await db.from("oauth_tokens").select("id, tenant_id, user_id, client_id, scopes, access_expires_at, revoked_at").eq("access_token_hash", sha256hex(m[1]!)).maybeSingle();
  if (!t || t.revoked_at || new Date(t.access_expires_at).getTime() < Date.now() || !t.scopes.includes(scope)) return null;
  return t;
}

export function signWebhook(secret: string, ts: string, nonce: string, body: string) {
  return "sha256=" + createHmac("sha256", secret).update(`${ts}.${nonce}.${body}`).digest("hex");
}

const STATUS_MAP: Record<string, string> = { paid: "paid", overdue: "overdue", cancelled: "cancelled", failed: "failed", refunded: "refunded", awaiting_payment: "pending" };

/** Chamado depois que o provedor confirma um evento: enfileira o aviso para o Wiize, se a cobrança veio de lá. */
export async function enqueueWiizeChargeEvent(db: Db, paymentId: string, paymentStatus: string) {
  const type = STATUS_MAP[paymentStatus];
  if (!type) return;
  const { data: p } = await db.from("payments").select("charge_group_id, gross_amount, paid_at").eq("id", paymentId).maybeSingle();
  if (!p?.charge_group_id) return;
  const { data: c } = await db.from("wiize_charges").select("id, public_id, tenant_id, external_reference, status").eq("charge_group_id", p.charge_group_id).maybeSingle();
  if (!c) return;
  const chargeStatus = type === "refunded" ? "cancelled" : type;
  if (["pending", "paid", "overdue", "cancelled", "failed"].includes(chargeStatus)) await db.from("wiize_charges").update({ status: chargeStatus }).eq("id", c.id);
  const eventId = `evt_${sha256hex(`${paymentId}:${type}`).slice(0, 32)}`;
  const body = {
    event_id: eventId, type: `charge.${type}`,
    data: { charge_id: c.public_id, external_reference: c.external_reference, amount_cents: Math.round(Number(p.gross_amount) * 100), ...(type === "paid" && p.paid_at ? { paid_at: p.paid_at } : {}) },
  };
  await db.from("wiize_pay_webhooks").upsert({ event_id: eventId, tenant_id: c.tenant_id, charge_id: c.id, type: body.type, body: body as never }, { onConflict: "event_id", ignoreDuplicates: true });
}
