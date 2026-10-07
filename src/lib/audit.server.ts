import { getRequestHeader } from "@tanstack/react-start/server";

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
  },
) {
  const { ip, userAgent } = requestInfo();
  await admin.from("audit_logs").insert({
    tenant_id: entry.tenantId ?? null,
    user_id: entry.userId ?? null,
    action: entry.action,
    resource: entry.resource ?? null,
    resource_id: entry.resourceId ?? null,
    result: entry.result ?? "success",
    ip_address: ip,
    user_agent: userAgent,
    metadata: (entry.metadata ?? {}) as never,
  });
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
    metadata: (entry.metadata ?? {}) as never,
  });
  if (entry.severity && entry.severity !== "info") {
    const { alertSecurityIncident } = await import("./security-alerts.server");
    await alertSecurityIncident(admin, { eventType: entry.eventType, severity: entry.severity, ip, tenantId: entry.tenantId });
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
