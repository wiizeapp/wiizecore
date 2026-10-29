import type { ExtCtx } from "./ext-api.server";

/**
 * Idempotência genérica para operações de escrita da API externa. Mesma chave + mesma operação/corpo devolve
 * a resposta gravada; chave em uso por outra operação → 409; chamada simultânea → 409 retry.
 * Sem cabeçalho, a operação roda normalmente (ela já é segura por estado).
 */
export async function withIdempotency(ctx: ExtCtx, request: Request, operation: string, payload: unknown, run: () => Promise<Response>, options: { retainOnFailure?: boolean } = {}): Promise<Response> {
  const key = request.headers.get("idempotency-key");
  if (!key) return run();
  const { IDEMPOTENCY_RE, canonicalJson } = await import("./ext-checkout.server");
  const { extError, extJson } = await import("./ext-api.server");
  if (!IDEMPOTENCY_RE.test(key)) return extError(ctx.requestId, "invalid_idempotency_key", 400);
  const { tokenFingerprint } = await import("./crypto.server");
  const hash = tokenFingerprint(canonicalJson({ operation, payload }));
  const { db } = ctx;
  const { data: claimed, error } = await db.from("ext_idempotency_keys")
    .insert({ tenant_id: ctx.tenantId, integration_id: ctx.integrationId, idempotency_key: key, operation, request_hash: hash })
    .select("id").maybeSingle();
  if (error || !claimed) {
    const { data: prev } = await db.from("ext_idempotency_keys").select("request_hash, state, response_status, response_body").eq("integration_id", ctx.integrationId).eq("idempotency_key", key).maybeSingle();
    if (!prev) return extError(ctx.requestId, "internal_error", 500);
    if (prev.request_hash !== hash) return extError(ctx.requestId, "idempotency_key_reused", 409);
    if (prev.state !== "completed") return extError(ctx.requestId, "idempotency_in_progress", 409);
    return extJson(ctx.requestId, { ...(prev.response_body as object), idempotent_replay: true }, prev.response_status ?? 200);
  }
  let res: Response;
  try { res = await run(); } catch {
    // Preserve uncertain work rather than permit duplicate external effects.
    return extError(ctx.requestId, "operation_requires_reconciliation", 409);
  }
  if (res.status >= 500) {
    // Falha temporária: libera a chave para nova tentativa.
    if (!options.retainOnFailure) await db.from("ext_idempotency_keys").delete().eq("id", claimed.id);
    return res;
  }
  let body: unknown = null;
  try { body = await res.clone().json(); } catch { body = null; }
  const { error: saveError } = await db.from("ext_idempotency_keys").update({ state: "completed", response_status: res.status, response_body: body as never, completed_at: new Date().toISOString() }).eq("id", claimed.id);
  if (saveError) return extError(ctx.requestId, "operation_requires_reconciliation", 409);
  return res;
}
