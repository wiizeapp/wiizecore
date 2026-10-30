import type { ExtScope } from "./ext-keys";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
export type ExtCtx = { db: Db; tenantId: string; integrationId: string; environment: "test" | "live"; requestId: string; createdBy: string | null; scopes: string[] };

const baseHeaders = (requestId: string) => ({ "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId });

/** Erro padronizado. `error` (texto) é mantido por compatibilidade; detalhes vão em `error_detail`. */
export function extError(requestId: string, code: string, status: number, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: code, error_detail: { code, request_id: requestId }, request_id: requestId, ...extra }), { status, headers: baseHeaders(requestId) });
}
export function extJson(requestId: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders(requestId) });
}

/**
 * Envelope comum: id da requisição, chave + escopos, limite de uso e registro seguro
 * (sem corpo, sem chave, sem dados pessoais).
 */
export async function withExtApi(request: Request, path: string, scopes: ExtScope[], fn: (ctx: ExtCtx) => Promise<Response>, limit = 120): Promise<Response> {
  const started = Date.now();
  const { randomToken, tokenFingerprint } = await import("./crypto.server");
  const requestId = `req_${randomToken(12)}`;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { consumeRateLimit, requestInfo } = await import("./audit.server");
  const firstScope = scopes[0];
  let tenantId: string | null = null;
  let integrationId: string | null = null;
  let environment: string | null = null;
  let authResult = "ok";
  let res: Response;
  try {
    const execute = async (): Promise<Response> => {
    const ip = requestInfo().ip;
    if (!ip) { authResult = "client_ip_unavailable"; return extError(requestId, "temporarily_unavailable", 503); }
    const preAuth = await consumeRateLimit(db, { scope: "ext_api_pre_auth", identifier: tokenFingerprint(ip), maxAttempts: 240, windowSeconds: 60, blockSeconds: 60 });
    if (!preAuth.allowed) { authResult = "rate_limited"; return extError(requestId, "rate_limited", 429); }
    if (!firstScope) { authResult = "insufficient_scope"; return extError(requestId, "insufficient_scope", 403); }
    const { authenticateExtRequest } = await import("./ext-auth.server");
    const auth = await authenticateExtRequest(request, firstScope);
    if (!auth.ok) {
      authResult = auth.error;
      return extError(requestId, auth.error, auth.status);
    } else {
      tenantId = auth.tenantId; integrationId = auth.integrationId; environment = auth.environment;
      const { data: it } = await db.from("ext_integrations").select("scopes, created_by").eq("id", auth.integrationId).single();
      const owned = it?.scopes ?? [];
      if (!scopes.every((s) => owned.includes(s))) {
        authResult = "insufficient_scope";
        return extError(requestId, "insufficient_scope", 403);
      } else {
        const rl = await consumeRateLimit(db, { scope: "ext_api", identifier: auth.integrationId, maxAttempts: limit, windowSeconds: 60, blockSeconds: 60 });
        const tenantLimit = rl.allowed ? await consumeRateLimit(db, { scope: "ext_api_tenant", identifier: auth.tenantId, maxAttempts: limit, windowSeconds: 60, blockSeconds: 60 }) : { allowed: false };
        if (!rl.allowed || !tenantLimit.allowed) { authResult = "rate_limited"; return extError(requestId, "rate_limited", 429); }
        return fn({ db, tenantId: auth.tenantId, integrationId: auth.integrationId, environment: auth.environment, requestId, createdBy: it?.created_by ?? null, scopes: owned });
      }
    }
    };
    res = await execute();
  } catch (e) {
    authResult = "internal_error";
    console.error("ext api failed", path, e instanceof Error ? e.name : "x");
    res = extError(requestId, "internal_error", 500);
  }
  let errorCode: string | null = null;
  if (res.status >= 400) {
    try { errorCode = ((await res.clone().json()) as { error?: string }).error?.slice(0, 60) ?? null; } catch { errorCode = null; }
  }
  try {
    await db.from("ext_request_logs").insert({ tenant_id: tenantId, integration_id: integrationId, environment, request_id: requestId, method: request.method, path: path.slice(0, 200), status: res.status, duration_ms: Date.now() - started, auth_result: authResult, error_code: errorCode });
  } catch { /* registro nunca derruba a resposta */ }
  return res;
}
