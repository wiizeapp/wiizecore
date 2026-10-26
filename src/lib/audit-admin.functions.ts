import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { AUDIT_EXPORT_MAX, AUDIT_PAGE_MAX, clampRange, sanitizeMetadata } from "./audit-policy";

type Ctx = { supabase: any; userId: string; claims: unknown };

/**
 * Painel "Auditoria e Segurança": só administradores da plataforma (papel em tabela separada),
 * com 2FA confirmado na sessão. Toda consulta, exportação e recusa fica registrada.
 */
async function requirePlatformAdmin(context: Ctx, action: string, limit: { max: number; window: number }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { consumeRateLimit, logAudit } = await import("./audit.server");
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!isAdmin) {
    await logAudit(supabaseAdmin, { userId: context.userId, action: "admin.audit_access_denied", result: "blocked", risk: "high" });
    throw new Error("Acesso restrito à equipe Wiize Core.");
  }
  const rl = await consumeRateLimit(supabaseAdmin, { scope: `audit_admin:${action}`, identifier: context.userId, maxAttempts: limit.max, windowSeconds: limit.window, blockSeconds: limit.window });
  if (!rl.allowed) {
    await logAudit(supabaseAdmin, { userId: context.userId, action: `admin.${action}`, result: "blocked", metadata: { reason_code: "rate_limited" } });
    throw new Error("Muitas consultas seguidas. Aguarde um pouco e tente novamente.");
  }
  return { admin: supabaseAdmin, logAudit };
}

const filtersSchema = z.object({
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  category: z.enum(["auth", "security", "financial", "tenant", "admin", "integration", "system"]).optional(),
  result: z.enum(["success", "failure", "blocked"]).optional(),
  risk: z.enum(["low", "medium", "high", "critical"]).optional(),
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  action: z.string().trim().max(80).regex(/^[a-z0-9._:-]*$/i).optional(),
  search: z.string().trim().max(80).regex(/^[A-Za-z0-9._:-]*$/).optional(),
});
type Filters = z.infer<typeof filtersSchema>;

const COLS = "id, seq, created_at, category, action, result, risk, origin, user_id, tenant_id, resource, resource_id, correlation_id, idempotency_key, external_event_id, ip_address, metadata, row_hash";

function applyFilters(q: any, f: Filters) {
  const range = clampRange(f.from, f.to);
  q = q.gte("created_at", range.from).lte("created_at", range.to);
  if (f.category) q = q.eq("category", f.category);
  if (f.result) q = q.eq("result", f.result);
  if (f.risk) q = q.eq("risk", f.risk);
  if (f.userId) q = q.eq("user_id", f.userId);
  if (f.tenantId) q = q.eq("tenant_id", f.tenantId);
  if (f.action) q = q.ilike("action", `${f.action}%`);
  if (f.search) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(f.search);
    q = isUuid ? q.or(`id.eq.${f.search},resource_id.eq.${f.search},correlation_id.eq.${f.search}`) : q.or(`correlation_id.eq.${f.search},external_event_id.eq.${f.search},idempotency_key.eq.${f.search}`);
  }
  return { q, range };
}

/** Mascara o IP (LGPD): mantém só o início. */
function maskIp(ip: string | null) {
  if (!ip) return null;
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".x.x";
  return ip.split(":").slice(0, 3).join(":") + ":…";
}

function present(r: Record<string, any>) {
  return { ...r, ip_address: maskIp(r.ip_address), metadata: sanitizeMetadata(r.metadata ?? {}) };
}

export const listAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => filtersSchema.extend({ page: z.number().int().min(0).max(500).default(0), pageSize: z.number().int().min(10).max(AUDIT_PAGE_MAX).default(50) }).parse(i))
  .handler(async ({ data, context }) => {
    const { admin, logAudit } = await requirePlatformAdmin(context as Ctx, "audit_viewed", { max: 60, window: 60 });
    const { page, pageSize, ...f } = data;
    const { q, range } = applyFilters(admin.from("audit_logs").select(COLS, { count: "estimated" }), f);
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error("Não foi possível carregar os registros.");
    await logAudit(admin, { userId: context.userId, action: "admin.audit_viewed", metadata: { filters: f, page } });
    return { rows: (rows ?? []).map(present), total: count ?? 0, range };
  });

export const getAuditOverview = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({ days: z.number().int().min(1).max(90).default(7) }).parse(i))
  .handler(async ({ data, context }) => {
    const { admin } = await requirePlatformAdmin(context as Ctx, "audit_overview", { max: 30, window: 60 });
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const cats = ["auth", "security", "financial", "tenant", "admin", "integration", "system"] as const;
    const head = (b: any) => b.gte("created_at", since);
    const count = async (mod: (q: any) => any) => {
      const { count: c } = await mod(head(admin.from("audit_logs").select("id", { count: "exact", head: true })));
      return c ?? 0;
    };
    const [byCategory, failedLogins, blocked, permissionChanges, highRisk, alerts] = await Promise.all([
      Promise.all(cats.map(async (c) => [c, await count((q) => q.eq("category", c))] as const)),
      count((q) => q.in("action", ["auth.login_failed", "mfa.verify_failed", "mfa.setup_failed", "mfa.recovery"]).neq("result", "success")),
      count((q) => q.eq("result", "blocked")),
      count((q) => q.or("action.ilike.team.%,action.ilike.member.%,action.ilike.role.%,action.ilike.permission.%")),
      count((q) => q.in("risk", ["high", "critical"])),
      admin.from("security_events").select("id, event_type, severity, created_at").gte("created_at", since).neq("severity", "info").order("created_at", { ascending: false }).limit(20),
    ]);
    return { days: data.days, byCategory: Object.fromEntries(byCategory), failedLogins, blocked, permissionChanges, highRisk, alerts: alerts.data ?? [] };
  });

export const exportAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => filtersSchema.extend({ format: z.enum(["csv", "json"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { admin, logAudit } = await requirePlatformAdmin(context as Ctx, "audit_exported", { max: 5, window: 3600 });
    const { format, ...f } = data;
    const { q, range } = applyFilters(admin.from("audit_logs").select(COLS), f);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(AUDIT_EXPORT_MAX);
    if (error) throw new Error("Não foi possível exportar os registros.");
    const list = (rows ?? []).map(present);
    await logAudit(admin, { userId: context.userId, action: "admin.audit_exported", risk: "high", metadata: { filters: f, format, rows: list.length } });
    if (format === "json") return { filename: `auditoria-${range.from.slice(0, 10)}.json`, content: JSON.stringify(list, null, 2) };
    const headers = ["id", "seq", "created_at", "category", "action", "result", "risk", "origin", "user_id", "tenant_id", "resource", "resource_id", "correlation_id", "external_event_id", "ip_address"];
    const esc = (v: unknown) => {
      let s = v === null || v === undefined ? "" : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita fórmulas em planilhas
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [headers.join(","), ...list.map((r: Record<string, unknown>) => headers.map((h) => esc(r[h])).join(","))].join("\n");
    return { filename: `auditoria-${range.from.slice(0, 10)}.csv`, content: csv };
  });

export const verifyAuditIntegrity = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { admin, logAudit } = await requirePlatformAdmin(context as Ctx, "audit_integrity_checked", { max: 5, window: 600 });
    const { data, error } = await admin.rpc("audit_verify_chain", { _limit: 200000 });
    if (error) throw new Error("Não foi possível verificar a integridade agora.");
    const row = (Array.isArray(data) ? data[0] : data) as { checked: number; legacy: number; broken_seq: number | null } | undefined;
    const ok = row ? row.broken_seq === null : false;
    await logAudit(admin, { userId: context.userId, action: "admin.audit_integrity_checked", result: ok ? "success" : "failure", risk: ok ? "low" : "critical", metadata: { checked: row?.checked ?? 0, broken_seq: row?.broken_seq ?? null } });
    if (!ok) {
      const { logSecurityEvent } = await import("./audit.server");
      await logSecurityEvent(admin, { userId: context.userId, eventType: "audit.integrity_broken", severity: "critical", metadata: { broken_seq: row?.broken_seq ?? null } });
    }
    return { ok, checked: Number(row?.checked ?? 0), legacy: Number(row?.legacy ?? 0), brokenSeq: row?.broken_seq ?? null };
  });
