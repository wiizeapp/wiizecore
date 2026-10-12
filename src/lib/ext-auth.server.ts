import { parseSecretKey, type ExtScope } from "./ext-keys";

/**
 * Autentica uma chamada externa pela chave secreta (Authorization: Bearer sk_...).
 * Retorna a empresa e permissões da integração, ou null. Nunca registra a chave.
 */
export async function authenticateExtRequest(request: Request, scope: ExtScope) {
  const parsed = parseSecretKey(request.headers.get("authorization"));
  if (!parsed) return { ok: false as const, status: 401, error: "invalid_api_key" };
  const { tokenFingerprint } = await import("./crypto.server");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: key } = await db
    .from("ext_api_keys")
    .select("id, tenant_id, integration_id, status, ext_integrations(status, environment, scopes)")
    .eq("secret_hash", tokenFingerprint(parsed.key))
    .maybeSingle();
  const it = key?.ext_integrations as { status: string; environment: string; scopes: string[] } | null | undefined;
  if (!key || key.status !== "active" || !it || it.status !== "active" || it.environment !== parsed.env) {
    return { ok: false as const, status: 401, error: "invalid_api_key" };
  }
  if (!it.scopes.includes(scope)) return { ok: false as const, status: 403, error: "insufficient_scope" };
  const now = new Date().toISOString();
  await Promise.all([
    db.from("ext_api_keys").update({ last_used_at: now }).eq("id", key.id),
    db.from("ext_integrations").update({ last_used_at: now }).eq("id", key.integration_id),
  ]);
  return { ok: true as const, tenantId: key.tenant_id, integrationId: key.integration_id, environment: parsed.env };
}
