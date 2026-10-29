import { getRequestHeader } from "@tanstack/react-start/server";
import { categoryFor, cleanText, riskFor, safeId, sanitizeMetadata, type AuditCategory, type AuditOrigin, type AuditRisk } from "./audit-policy";

import { parseTrustedHeaders, resolveClientIp, type ClientIpResult } from "./client-ip";

/** IP confiável do cliente (ver client-ip.ts). Ordem de cabeçalhos em TRUSTED_CLIENT_IP_HEADERS. */
export function trustedClientIp(getHeader: (name: string) => string | null | undefined): ClientIpResult {
  return resolveClientIp(getHeader, parseTrustedHeaders(process.env["TRUSTED_CLIENT_IP_HEADERS"]));
}
export function clientIpFromRequest(request: Request): string | null {
  return trustedClientIp((n) => request.headers.get(n)).ip;
}

export type RequestContextInfo = { ip: string | null; userAgent: string | null };

/** Metadados da requisição para auditoria. Nunca guarda segredos. */
export function requestInfo(): RequestContextInfo {
  try {
    const ip = trustedClientIp((n) => getRequestHeader(n)).ip;
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
  // Contagem atômica no banco (trava de linha): tentativas simultâneas, mesmo em
  // instâncias diferentes, nunca são contadas como uma só.
  const { data, error } = await admin.rpc("consume_rate_limit", {
    _scope: options.scope,
    _identifier: options.identifier,
    _max_attempts: options.maxAttempts,
    _window_seconds: options.windowSeconds,
    _block_seconds: options.blockSeconds,
  });
  const row = Array.isArray(data) ? data[0] : data;
  // Falha segura: se o contador não responder, a ação não segue.
  if (error || !row) return { allowed: false, retryAfterSeconds: 60 };
  if (!row.allowed && row.retry_after_seconds === options.blockSeconds) {
    const { alertSecurityIncident } = await import("./security-alerts.server");
    await alertSecurityIncident(admin, { eventType: "rate_limit_blocked", severity: "warning", ip: requestInfo().ip, scope: options.scope });
  }
  return { allowed: !!row.allowed, retryAfterSeconds: row.retry_after_seconds ?? 0 };
}

/**
 * Marca irreversível do cartão (HMAC com chave só do servidor), usada apenas para contar
 * quantos cartões diferentes o mesmo visitante tenta. Nunca é guardada junto com o cartão
 * nem exibida; sem a chave configurada, retorna null e a contagem por cartão é pulada.
 */
export async function cardFingerprint(cardNumber: string): Promise<string | null> {
  const key = process.env["CARD_FINGERPRINT_KEY"];
  if (!key || key.length < 32) return null;
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(`card:${cardNumber.replace(/\D/g, "")}`).digest("hex");
}

export async function resetRateLimit(admin: AdminClient, scope: string, identifier: string) {
  await admin
    .from("rate_limits")
    .update({ attempts: 0, blocked_until: null, window_started_at: new Date().toISOString() })
    .eq("scope", scope)
    .eq("identifier", identifier);
}
