import { getRequestHeader } from "@tanstack/react-start/server";
import { categoryFor, cleanText, riskFor, safeId, sanitizeMetadata, type AuditCategory, type AuditOrigin, type AuditRisk } from "./audit-policy";

export type RequestContextInfo = { ip: string | null; userAgent: string | null };

/** Metadados da requisição para auditoria. Nunca guarda segredos. */
export function requestInfo(): RequestContextInfo {
  try {
    const forwarded = getRequestHeader("x-forwarded-for");
    const ip = forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : (getRequestHeader("cf-connecting-ip") ?? null);
    return { ip, userAgent: getRequestHeader("user-agent") ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/**
 * Grava um evento de auditoria (somente servidor). Os metadados são limpos antes de gravar.
 * Nunca lança erro: uma falha de registro não pode interromper nem repetir uma operação financeira.
 * A falha vira um evento de segurança para investigação.
 */
export async function logAudit(
  admin: AdminClient,
  entry: {
    tenantId?: string | null;
    userId?: string | null;
    action: string;
    resource?: string | null;
    resourceId?: string | null;
    result?: "success" | "failure" | "blocked";
    metadata?: Record<string, unknown>;
    category?: AuditCategory;
    origin?: AuditOrigin;
    risk?: AuditRisk;
    correlationId?: string | null;
    idempotencyKey?: string | null;
    externalEventId?: string | null;
  },
) {
  const { ip, userAgent } = requestInfo();
  const result = entry.result ?? "success";
  const action = cleanText(entry.action, 80);
  let correlation = safeId(entry.correlationId, 80);
  if (!correlation) {
    try { correlation = safeId(getRequestHeader("x-request-id"), 80) ?? safeId(getRequestHeader("cf-ray"), 80); } catch { correlation = null; }
  }
  try {
    const { error } = await admin.from("audit_logs").insert({
      tenant_id: entry.tenantId ?? null,
      user_id: entry.userId ?? null,
      action,
      resource: entry.resource ? cleanText(entry.resource, 80) : null,
      resource_id: entry.resourceId ? cleanText(entry.resourceId, 120) : null,
      result,
      ip_address: ip ? cleanText(ip, 64) : null,
      user_agent: userAgent ? cleanText(userAgent, 300) : null,
      metadata: (sanitizeMetadata(entry.metadata ?? {}) ?? {}) as never,
      category: entry.category ?? categoryFor(action),
      origin: entry.origin ?? "backend",
      risk: entry.risk ?? riskFor(action, result),
      correlation_id: correlation,
      idempotency_key: safeId(entry.idempotencyKey),
      external_event_id: safeId(entry.externalEventId),
    });
    if (error) throw error;
  } catch (e) {
    console.error("[audit] falha ao registrar evento", action, (e as { code?: string })?.code ?? "");
    try {
      await admin.from("security_events").insert({
        event_type: "audit.write_failed", severity: "warning", user_id: entry.userId ?? null, tenant_id: entry.tenantId ?? null,
        metadata: { action } as never,
      });
    } catch {
      // Sem segundo destino disponível: segue sem interromper a operação.
    }
  }
}

export async function logSecurityEvent(
  admin: AdminClient,
  entry: {
    userId?: string | null;
    tenantId?: string | null;
    eventType: string;
    severity?: "info" | "warning" | "critical";
    metadata?: Record<string, unknown>;
  },
) {
  const { ip, userAgent } = requestInfo();
  await admin.from("security_events").insert({
    user_id: entry.userId ?? null,
    tenant_id: entry.tenantId ?? null,
    event_type: entry.eventType,
    severity: entry.severity ?? "info",
    ip_address: ip,
    user_agent: userAgent,
    metadata: (sanitizeMetadata(entry.metadata ?? {}) ?? {}) as never,
  });
  if (entry.severity && entry.severity !== "info") {
    const { alertSecurityIncident } = await import("./security-alerts.server");
    await alertSecurityIncident(admin, { eventType: entry.eventType, severity: entry.severity, ip, tenantId: entry.tenantId ?? null });
  }
}

/**
 * Limite de tentativas por escopo + identificador, com bloqueio temporário.
 * Retorna se a ação pode seguir e quantos segundos faltam para liberar.
 */
export async function consumeRateLimit(
  admin: AdminClient,
  options: { scope: string; identifier: string; maxAttempts: number; windowSeconds: number; blockSeconds: number },
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const { data: existing } = await admin
    .from("rate_limits")
    .select("id, attempts, window_started_at, blocked_until")
    .eq("scope", options.scope)
    .eq("identifier", options.identifier)
    .maybeSingle();

  if (existing?.blocked_until && new Date(existing.blocked_until) > now) {
    const retry = Math.ceil((new Date(existing.blocked_until).getTime() - now.getTime()) / 1000);
    return { allowed: false, retryAfterSeconds: retry };
  }

  if (!existing) {
    await admin.from("rate_limits").insert({
      scope: options.scope,
      identifier: options.identifier,
      attempts: 1,
      window_started_at: now.toISOString(),
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const windowStart = new Date(existing.window_started_at);
  const windowExpired = now.getTime() - windowStart.getTime() > options.windowSeconds * 1000;
  const attempts = windowExpired ? 1 : existing.attempts + 1;
  const shouldBlock = attempts > options.maxAttempts;

  await admin
    .from("rate_limits")
    .update({
      attempts: shouldBlock ? 0 : attempts,
      window_started_at: windowExpired || shouldBlock ? now.toISOString() : existing.window_started_at,
      blocked_until: shouldBlock ? new Date(now.getTime() + options.blockSeconds * 1000).toISOString() : null,
    })
    .eq("id", existing.id);

  if (shouldBlock) {
    const { alertSecurityIncident } = await import("./security-alerts.server");
    await alertSecurityIncident(admin, { eventType: "rate_limit_blocked", severity: "warning", ip: requestInfo().ip, scope: options.scope });
    return { allowed: false, retryAfterSeconds: options.blockSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function resetRateLimit(admin: AdminClient, scope: string, identifier: string) {
  await admin
    .from("rate_limits")
    .update({ attempts: 0, blocked_until: null, window_started_at: new Date().toISOString() })
    .eq("scope", scope)
    .eq("identifier", identifier);
}
