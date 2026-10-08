import { createHash, randomBytes } from "node:crypto";

/**
 * Janelas da WiizePay dentro do Wiize CRM.
 * Passe: uso único, 2 min, emitido servidor-a-servidor com o token OAuth.
 * Sessão: 30 min, guardada só na memória da janela (não usa cookie de terceiros).
 * Só os hashes ficam no banco.
 */
export const TICKET_TTL_MS = 2 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 60 * 1000;
export type EmbedKind = "contract" | "service" | "charge";
export const KIND_PERM: Record<EmbedKind, string> = { contract: "contracts.create", service: "services.create", charge: "charges.create" };

const hash = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function issueTicket(input: { tenantId: string; userId: string; clientId: string; kind: EmbedKind; customerId: string | null; theme: "light" | "dark" }) {
  const db = await admin();
  const t = token("wpet");
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();
  const { error } = await db.from("embed_tickets").insert({
    ticket_hash: hash(t), tenant_id: input.tenantId, user_id: input.userId, client_id: input.clientId,
    kind: input.kind, customer_id: input.customerId, theme: input.theme, expires_at: expiresAt,
  });
  if (error) throw new Error("Não foi possível criar o acesso.");
  return { ticket: t, expiresAt };
}

/** Troca o passe (uma única vez) por uma sessão curta. */
export async function exchangeTicket(ticket: string) {
  if (!/^wpet_[A-Za-z0-9_-]{40,60}$/.test(ticket)) return null;
  const db = await admin();
  const now = new Date().toISOString();
  // Marca como usado de forma atômica: só um pedido consegue.
  const { data: t } = await db.from("embed_tickets").update({ used_at: now })
    .eq("ticket_hash", hash(ticket)).is("used_at", null).gt("expires_at", now)
    .select("id, tenant_id, user_id, kind, customer_id, theme").maybeSingle();
  if (!t) return null;
  const s = token("wpes");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await db.from("embed_sessions").insert({
    session_hash: hash(s), ticket_id: t.id, tenant_id: t.tenant_id, user_id: t.user_id,
    kind: t.kind, customer_id: t.customer_id, expires_at: expiresAt,
  });
  if (error) return null;
  return { session: s, expiresAt, kind: t.kind as EmbedKind, theme: t.theme as "light" | "dark", tenantId: t.tenant_id, userId: t.user_id, customerId: t.customer_id };
}

/** Valida a sessão e confere, no servidor, membro ativo e permissão do tipo da janela. */
export async function requireEmbedSession(session: string) {
  if (!/^wpes_[A-Za-z0-9_-]{40,60}$/.test(session)) throw new Error("Acesso expirado. Abra a janela novamente.");
  const db = await admin();
  const { data: s } = await db.from("embed_sessions").select("tenant_id, user_id, kind, customer_id, expires_at, revoked_at")
    .eq("session_hash", hash(session)).maybeSingle();
  if (!s || s.revoked_at || new Date(s.expires_at).getTime() < Date.now()) throw new Error("Acesso expirado. Abra a janela novamente.");
  const { requireModulePerm } = await import("./member-access.server");
  const access = await requireModulePerm(s.user_id, KIND_PERM[s.kind as EmbedKind]);
  if (access.tenantId !== s.tenant_id) throw new Error("Você não tem permissão para esta operação.");
  return { db, tenantId: s.tenant_id, userId: s.user_id, kind: s.kind as EmbedKind, customerId: s.customer_id };
}
