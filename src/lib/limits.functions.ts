import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: any; userId: string; claims: unknown };

async function membership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "statement.view");
  if (!data) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

async function requireAdmin(context: Ctx) {
  await (await import("./admin-session.server")).assertAdminPage(context);
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe WiizePay.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function tenantLimits(admin: any, tenantId: string) {
  const [{ data: settings }, { data: ts }] = await Promise.all([
    admin.from("platform_settings").select("key, value").in("key", ["pix_daily_limit", "monthly_withdrawal_count", "minimum_withdrawal_amount", "withdrawal_fee_amount"]),
    admin.from("tenant_settings").select("pix_daily_limit, monthly_withdrawal_count").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const get = (k: string, d: number) => Number(settings?.find((s: any) => s.key === k)?.value ?? d);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const dayStart = new Date(`${today}T00:00:00-03:00`).toISOString();
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00-03:00`).toISOString();
  const { data: rows } = await admin.from("withdrawals").select("amount, requested_at").eq("tenant_id", tenantId)
    .not("status", "in", "(cancelled,failed)").gte("requested_at", monthStart);
  const list = (rows ?? []) as { amount: number; requested_at: string }[];
  const usedToday = list.filter((r) => r.requested_at >= dayStart).reduce((s, r) => s + Number(r.amount), 0);
  const daily = ts?.pix_daily_limit != null ? Number(ts.pix_daily_limit) : get("pix_daily_limit", 5000);
  const monthly = ts?.monthly_withdrawal_count != null ? Number(ts.monthly_withdrawal_count) : get("monthly_withdrawal_count", 50);
  return {
    dailyLimit: daily,
    usedToday: Math.round(usedToday * 100) / 100,
    remainingToday: Math.max(0, Math.round((daily - usedToday) * 100) / 100),
    monthlyCount: monthly,
    usedMonth: list.length,
    remainingMonth: Math.max(0, monthly - list.length),
    personalized: ts?.pix_daily_limit != null || ts?.monthly_withdrawal_count != null,
    minimum: get("minimum_withdrawal_amount", 50),
    fee: get("withdrawal_fee_amount", 5),
  };
}

export const getMyLimits = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limits = await tenantLimits(supabaseAdmin, m.tenant_id);
    const { data: requests } = await supabaseAdmin.from("limit_increase_requests")
      .select("id, requested_daily_limit, requested_monthly_count, reason, status, expected_response_on, review_message, created_at")
      .eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(10);
    return { ...limits, requests: requests ?? [], canRequest: ["owner", "admin", "finance"].includes(m.role) };
  });

export const requestLimitIncrease = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({
    dailyLimit: z.number().positive().max(10_000_000),
    monthlyCount: z.number().int().min(1).max(1000).optional(),
    reason: z.string().trim().min(10, "Explique o motivo com pelo menos 10 caracteres.").max(1000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    if (!["owner", "admin", "finance"].includes(m.role)) throw new Error("Você não tem permissão para pedir aumento.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: open } = await supabaseAdmin.from("limit_increase_requests").select("id").eq("tenant_id", m.tenant_id).in("status", ["pending", "in_review"]).limit(1);
    if (open?.length) throw new Error("Você já tem um pedido de aumento em análise.");
    const current = await tenantLimits(supabaseAdmin, m.tenant_id);
    if (data.dailyLimit <= current.dailyLimit && (!data.monthlyCount || data.monthlyCount <= current.monthlyCount)) {
      throw new Error("O novo limite precisa ser maior que o atual.");
    }
    const { data: row, error } = await supabaseAdmin.from("limit_increase_requests").insert({
      tenant_id: m.tenant_id, requested_by: context.userId, current_daily_limit: current.dailyLimit,
      requested_daily_limit: data.dailyLimit, requested_monthly_count: data.monthlyCount ?? null, reason: data.reason,
    }).select("id").single();
    if (error) throw new Error("Não foi possível enviar o pedido.");
    await supabaseAdmin.from("platform_notifications").insert({
      kind: "limit.requested", title: "Pedido de aumento de limite", body: `Novo limite diário pedido: R$ ${data.dailyLimit}`, link: "/nimda", tenant_id: m.tenant_id,
    });
    await logAudit(supabaseAdmin, { userId: context.userId, tenantId: m.tenant_id, action: "limit.request", resource: "limit_increase_request", resourceId: row.id });
    return { id: row.id };
  });

export const listLimitRequests = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
    const accounts = await Promise.all((tenants ?? []).map(async (t: any) => ({ tenantId: t.id, tenantName: t.name, ...(await tenantLimits(admin, t.id)) })));
    const { data: requests } = await admin.from("limit_increase_requests").select("*").order("created_at", { ascending: false }).limit(100);
    const names = new Map((tenants ?? []).map((t: any) => [t.id, t.name]));
    return { accounts, requests: (requests ?? []).map((r: any) => ({ ...r, tenantName: names.get(r.tenant_id) ?? "—" })) };
  });

export const reviewLimitRequest = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["in_review", "approved", "rejected"]),
    expectedResponseOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dailyLimit: z.number().positive().max(10_000_000).optional(),
    monthlyCount: z.number().int().min(1).max(1000).optional(),
    message: z.string().trim().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data: req } = await admin.from("limit_increase_requests").select("*").eq("id", data.id).maybeSingle();
    if (!req || !["pending", "in_review"].includes(req.status)) throw new Error("Pedido não encontrado ou já finalizado.");
    if (req.requested_by === context.userId) throw new Error("Você não pode analisar o próprio pedido.");
    const upd: any = { status: data.action, review_message: data.message ?? null };
    let title = "", body = "";
    if (data.action === "in_review") {
      if (!data.expectedResponseOn) throw new Error("Informe o prazo de retorno do provedor.");
      upd.expected_response_on = data.expectedResponseOn;
      title = "Pedido de limite em análise";
      body = `Previsão de retorno: ${data.expectedResponseOn.split("-").reverse().join("/")}`;
    } else {
      upd.reviewed_by = context.userId;
      upd.reviewed_at = new Date().toISOString();
      if (data.action === "approved") {
        const daily = data.dailyLimit ?? Number(req.requested_daily_limit);
        const monthly = data.monthlyCount ?? req.requested_monthly_count ?? null;
        const { data: existing } = await admin.from("tenant_settings").select("tenant_id").eq("tenant_id", req.tenant_id).maybeSingle();
        const patch: any = { pix_daily_limit: daily, ...(monthly ? { monthly_withdrawal_count: monthly } : {}) };
        const { error } = existing
          ? await admin.from("tenant_settings").update(patch).eq("tenant_id", req.tenant_id)
          : await admin.from("tenant_settings").insert({ tenant_id: req.tenant_id, ...patch });
        if (error) throw new Error("Não foi possível atualizar o limite.");
        title = "Aumento de limite aprovado";
        body = `Seu novo limite diário de saque Pix é R$ ${daily}${monthly ? ` e ${monthly} saques por mês` : ""}.`;
      } else {
        title = "Pedido de aumento de limite recusado";
        body = data.message || "O provedor não aprovou o aumento neste momento.";
      }
    }
    await admin.from("limit_increase_requests").update(upd).eq("id", data.id);
    await admin.from("notifications").insert({ tenant_id: req.tenant_id, kind: `limit.${data.action}`, title, body, link: "/limites" });
    await logAudit(admin, { userId: context.userId, tenantId: req.tenant_id, action: `limit.${data.action}`, resource: "limit_increase_request", resourceId: data.id });
    return { ok: true };
  });
