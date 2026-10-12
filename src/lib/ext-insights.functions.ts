import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAccess } from "./team.functions";
import { summarize } from "./financial-summary";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Números da Integração Externa: só cobranças criadas pela API, sempre da empresa do usuário. */
export const getExtOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await loadAccess(context.userId);
    const d = await db();
    const { data: sessions } = await d.from("ext_checkout_sessions").select("charge_group_id, created_at").eq("tenant_id", a.tenantId).order("created_at", { ascending: false }).limit(1000);
    const groups = [...new Set((sessions ?? []).map((s) => s.charge_group_id))];
    const rows: { status: string; gross_amount: number | string; net_amount: number | string | null; platform_fee_amount: number | string | null; refunded_amount: number | string | null; due_on: string | null }[] = [];
    for (let i = 0; i < groups.length; i += 200) {
      const { data } = await d.from("payments").select("status, gross_amount, net_amount, platform_fee_amount, refunded_amount, due_on").eq("tenant_id", a.tenantId).in("charge_group_id", groups.slice(i, i + 200));
      rows.push(...((data ?? []) as typeof rows));
    }
    const { count: failed } = await d.from("ext_webhook_deliveries").select("id", { count: "exact", head: true }).eq("tenant_id", a.tenantId).eq("status", "failed");
    const s = summarize(rows);
    return {
      sessions: groups.length,
      installments: s.count,
      paidCount: s.paidCount,
      overdueCount: s.overdueCount,
      received: s.received,
      receivable: s.receivable,
      overdue: s.overdue,
      failedDeliveries: failed ?? 0,
      lastActivity: sessions?.[0]?.created_at ?? null,
    };
  });

/** Registros: avisos enviados ao sistema do cliente, com filtros e páginas. Corpo do aviso não é exposto aqui. */
export const listExtLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    page: z.number().int().min(0).max(500).default(0),
    status: z.enum(["all", "pending", "delivered", "failed"]).default("all"),
    type: z.string().max(60).default("all"),
    days: z.number().int().min(1).max(90).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await loadAccess(context.userId);
    const size = 25;
    let q = (await db()).from("ext_webhook_deliveries")
      .select("id, event_id, type, status, attempts, last_status, last_error, created_at, delivered_at, charge_group_id", { count: "exact" })
      .eq("tenant_id", a.tenantId)
      .gte("created_at", new Date(Date.now() - data.days * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .range(data.page * size, data.page * size + size - 1);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.type !== "all") q = q.eq("type", data.type);
    const { data: rows, count } = await q;
    return { rows: (rows ?? []).map((r) => ({ ...r, last_error: r.last_error?.slice(0, 160) ?? null })), total: count ?? 0, pageSize: size };
  });
