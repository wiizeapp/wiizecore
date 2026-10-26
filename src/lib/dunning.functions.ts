import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit } from "./audit.server";
import { DEFAULT_STEPS, PLAN_CHANNELS, balanceLevel, planCost, sanitizeSteps, type DunningPlanCode } from "./dunning-rules";

type Ctx = { supabase: any; userId: string; claims: unknown };
const MANAGERS = ["owner", "admin", "finance"];

async function membership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "dunning.view");
  if (!data) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe Wiize Core.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadCommon(admin: any, tenantId: string) {
  const [{ data: plans }, { data: s }, { data: w }, { data: cfg }] = await Promise.all([
    admin.from("dunning_plans").select("code, price, channels, version").eq("active", true).order("price"),
    admin.from("dunning_settings").select("recommended_balance, alert_balance, critical_balance").maybeSingle(),
    admin.from("wallets").select("available_balance").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("dunning_tenant_config").select("enabled, paused, plan_code, steps").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return { plans: plans ?? [], s, balance: Number(w?.available_balance ?? 0), cfg };
}

export const getDunning = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { plans, s, balance, cfg } = await loadCommon(admin, m.tenant_id);
    const plan = (cfg?.plan_code ?? "essential") as DunningPlanCode;
    const price = Number(plans.find((p: any) => p.code === plan)?.price ?? 0);
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const [{ data: charges }, { data: events }, { data: overrides }] = await Promise.all([
      admin.from("dunning_charges").select("id, payment_id, plan_code, price, status, created_at, payments(description, due_on, gross_amount, status, installment_number, installment_count, subscription_id, customers(name), contracts(title))").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(50),
      admin.from("dunning_events").select("id, payment_id, event, channel, detail, created_at").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(100),
      admin.from("dunning_overrides").select("id, customer_id, contract_id, customers(name), contracts(title)").eq("tenant_id", m.tenant_id),
    ]);
    const month = (charges ?? []).filter((c: any) => new Date(c.created_at) >= since && c.status !== "insufficient_balance");
    return {
      canManage: MANAGERS.includes(m.role),
      config: { enabled: !!cfg?.enabled, paused: !!cfg?.paused, plan, steps: sanitizeSteps(cfg?.steps ?? DEFAULT_STEPS, plan) },
      plans: plans.map((p: any) => ({ code: p.code as DunningPlanCode, price: Number(p.price), channels: p.channels as string[] })),
      balance,
      thresholds: { recommended: Number(s?.recommended_balance ?? 0), alert: Number(s?.alert_balance ?? 0), critical: Number(s?.critical_balance ?? 0) },
      level: balanceLevel(balance, { alert: Number(s?.alert_balance ?? 0), critical: Number(s?.critical_balance ?? 0) }, price),
      stats: {
        monthCharges: month.length,
        monthSpent: month.reduce((a: number, c: any) => a + Math.round(Number(c.price) * 100), 0) / 100,
        active: (charges ?? []).filter((c: any) => c.status === "active").length,
        blocked: (charges ?? []).filter((c: any) => c.status === "insufficient_balance").length,
      },
      charges: (charges ?? []).map((c: any) => ({ id: c.id, paymentId: c.payment_id, plan: c.plan_code, price: Number(c.price), status: c.status, createdAt: c.created_at, description: c.payments?.description ?? "", dueOn: c.payments?.due_on ?? null, amount: Number(c.payments?.gross_amount ?? 0), customer: c.payments?.customers?.name ?? "—", contract: c.payments?.contracts?.title ?? null, installmentNumber: c.payments?.installment_number ?? null, installmentCount: c.payments?.installment_count ?? null, recurring: Boolean(c.payments?.subscription_id) })),
      events: events ?? [],
      overrides: (overrides ?? []).map((o: any) => ({ id: o.id, customerId: o.customer_id, contractId: o.contract_id, label: o.customers?.name ?? o.contracts?.title ?? "—", kind: o.customer_id ? "customer" : "contract" })),
    };
  });

export const saveDunning = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({
    enabled: z.boolean(),
    paused: z.boolean(),
    plan: z.enum(["essential", "smart", "intensive"]),
    steps: z.record(z.string(), z.unknown()),
    financialPassword: z.string().max(200).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    if (!MANAGERS.includes(m.role)) throw new Error("Você não tem permissão para alterar a régua.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await admin.from("dunning_tenant_config").select("plan_code").eq("tenant_id", m.tenant_id).maybeSingle();
    if ((current?.plan_code ?? "essential") !== data.plan) {
      const { assertFinancialPassword } = await import("./finance.server");
      await assertFinancialPassword(admin, context.userId, data.financialPassword ?? "", "dunning.plan_change");
    }
    const { plans, s, balance } = await loadCommon(admin, m.tenant_id);
    const price = Number(plans.find((p: any) => p.code === data.plan)?.price ?? 0);
    if (data.enabled && !data.paused) {
      const minimum = Math.max(price, Number(s?.critical_balance ?? 0));
      if (balance < minimum) throw new Error("Para usar os Lembretes de cobrança, mantenha saldo disponível para cobrir o plano escolhido.");
    }
    const steps = sanitizeSteps(data.steps, data.plan);
    const { error } = await admin.from("dunning_tenant_config").upsert({ tenant_id: m.tenant_id, enabled: data.enabled, paused: data.paused, plan_code: data.plan, steps });
    if (error) throw new Error("Não foi possível salvar a régua.");
    await logAudit(admin, { userId: context.userId, tenantId: m.tenant_id, action: "dunning.config", resource: "dunning_tenant_config", metadata: { enabled: data.enabled, paused: data.paused, plan: data.plan } });
    return { ok: true };
  });

export const setDunningOverride = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({
    customerId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    excluded: z.boolean(),
  }).refine((v) => !!v.customerId !== !!v.contractId).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    if (!MANAGERS.includes(m.role)) throw new Error("Você não tem permissão para alterar a régua.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const col = data.customerId ? "customer_id" : "contract_id";
    const id = (data.customerId ?? data.contractId)!;
    const table = data.customerId ? "customers" : "contracts";
    const { data: own } = await admin.from(table).select("id").eq("id", id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!own) throw new Error("Registro não encontrado.");
    if (data.excluded) {
      const { data: ex } = await admin.from("dunning_overrides").select("id").eq("tenant_id", m.tenant_id).eq(col, id).maybeSingle();
      if (!ex) await admin.from("dunning_overrides").insert({ tenant_id: m.tenant_id, [col]: id, disabled: true } as any);
    } else {
      await admin.from("dunning_overrides").delete().eq("tenant_id", m.tenant_id).eq(col, id);
    }
    await logAudit(admin, { userId: context.userId, tenantId: m.tenant_id, action: "dunning.override", resource: table, resourceId: id, metadata: { excluded: data.excluded } });
    return { ok: true };
  });

export const listDunningTargets = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const [{ data: customers }, { data: contracts }] = await Promise.all([
      context.supabase.from("customers").select("id, name").eq("tenant_id", m.tenant_id).order("name").limit(500),
      context.supabase.from("contracts").select("id, title").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(200),
    ]);
    return { customers: customers ?? [], contracts: contracts ?? [] };
  });

/* ---------------- Admin ---------------- */

export const getDunningAdmin = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const [{ data: s }, { data: plans }, { data: charges }, { data: tenants }] = await Promise.all([
      admin.from("dunning_settings").select("*").maybeSingle(),
      admin.from("dunning_plans").select("id, code, price, channels, version, active").order("price"),
      admin.from("dunning_charges").select("tenant_id, plan_code, price, status, estimated_cost").neq("status", "insufficient_balance").limit(10000),
      admin.from("tenants").select("id, name"),
    ]);
    const costs = { whatsapp: s?.cost_whatsapp, sms: s?.cost_sms, email: s?.cost_email, voice: s?.cost_voice };
    const byPlan = (["essential", "smart", "intensive"] as DunningPlanCode[]).map((code) => {
      const rows = (charges ?? []).filter((c: any) => c.plan_code === code);
      const revenue = rows.reduce((a: number, c: any) => a + Number(c.price), 0);
      const known = rows.filter((c: any) => c.estimated_cost != null);
      const cost = known.reduce((a: number, c: any) => a + Number(c.estimated_cost), 0);
      const unit = planCost(code, costs as any);
      const price = Number((plans ?? []).find((p: any) => p.code === code && p.active)?.price ?? 0);
      return { code, count: rows.length, revenue, cost, uncosted: rows.length - known.length, margin: revenue - cost, unitCost: unit, unitMarginPct: unit == null || !price ? null : ((price - unit) / price) * 100 };
    });
    const names = new Map((tenants ?? []).map((t: any) => [t.id, t.name]));
    const byTenant = new Map<string, { revenue: number; count: number }>();
    for (const c of charges ?? []) { const e = byTenant.get(c.tenant_id) ?? { revenue: 0, count: 0 }; e.revenue += Number(c.price); e.count++; byTenant.set(c.tenant_id, e); }
    return {
      settings: s ? { recommended: Number(s.recommended_balance), alert: Number(s.alert_balance), critical: Number(s.critical_balance), minMarginPct: Number(s.min_margin_pct), costs: { whatsapp: s.cost_whatsapp == null ? null : Number(s.cost_whatsapp), sms: s.cost_sms == null ? null : Number(s.cost_sms), email: s.cost_email == null ? null : Number(s.cost_email), voice: s.cost_voice == null ? null : Number(s.cost_voice) } } : null,
      plans: (plans ?? []).filter((p: any) => p.active).map((p: any) => ({ code: p.code, price: Number(p.price), version: p.version, channels: PLAN_CHANNELS[p.code as DunningPlanCode] })),
      byPlan,
      tenants: [...byTenant].map(([id, v]) => ({ id, name: names.get(id) ?? "—", ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    };
  });

const money = z.number().min(0).max(100000);
const cost = z.number().min(0).max(1000).nullable();
export const saveDunningAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({
    recommended: money, alert: money, critical: money, minMarginPct: z.number().min(0).max(100),
    costs: z.object({ whatsapp: cost, sms: cost, email: cost, voice: cost }),
    prices: z.object({ essential: money, smart: money, intensive: money }).optional(),
  }).refine((v) => v.critical <= v.alert && v.alert <= v.recommended, "O saldo crítico deve ser menor que o de alerta, e este menor que o recomendado.").parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { error } = await admin.from("dunning_settings").update({
      recommended_balance: data.recommended, alert_balance: data.alert, critical_balance: data.critical, min_margin_pct: data.minMarginPct,
      cost_whatsapp: data.costs.whatsapp, cost_sms: data.costs.sms, cost_email: data.costs.email, cost_voice: data.costs.voice,
      updated_at: new Date().toISOString(), updated_by: context.userId,
    }).eq("id", true);
    if (error) throw new Error("Não foi possível salvar.");
    if (data.prices) {
      const { data: current } = await admin.from("dunning_plans").select("id, code, price, version, channels").eq("active", true);
      for (const p of current ?? []) {
        const next = data.prices[p.code as DunningPlanCode];
        if (next == null || Number(p.price) === next) continue;
        // Nova versão: cobranças antigas mantêm o preço da versão usada.
        await admin.from("dunning_plans").update({ active: false }).eq("id", p.id);
        await admin.from("dunning_plans").insert({ code: p.code, price: next, channels: p.channels, version: p.version + 1 });
      }
    }
    await logAudit(admin, { userId: context.userId, action: "dunning.admin_settings", resource: "dunning_settings", metadata: data });
    return { ok: true };
  });

/** Plano de lembretes de uma cobrança específica (ou o padrão da empresa). */
export const getChargeDunningPlan = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const [{ data: own }, { data: cfg }] = await Promise.all([
      admin.from("dunning_charge_plans").select("plan_code").eq("tenant_id", m.tenant_id).eq("charge_group_id", data.chargeGroupId).maybeSingle(),
      admin.from("dunning_tenant_config").select("plan_code, enabled").eq("tenant_id", m.tenant_id).maybeSingle(),
    ]);
    return { plan: (own?.plan_code ?? cfg?.plan_code ?? "essential") as DunningPlanCode, custom: !!own, enabled: !!cfg?.enabled };
  });

/** Troca o plano de uma cobrança já criada. Exige senha financeira; diferença cai no financeiro. */
export const changeChargeDunningPlan = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: unknown) => z.object({
    chargeGroupId: z.string().uuid(),
    plan: z.enum(["essential", "smart", "intensive"]),
    financialPassword: z.string().min(1).max(200),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    if (!MANAGERS.includes(m.role)) throw new Error("Você não tem permissão para esta operação.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { assertFinancialPassword } = await import("./finance.server");
    await assertFinancialPassword(admin, context.userId, data.financialPassword, "dunning.charge_plan_change");
    const { data: diff, error } = await admin.rpc("dunning_change_group_plan", { _tenant_id: m.tenant_id, _charge_group_id: data.chargeGroupId, _plan_code: data.plan, _user_id: context.userId });
    if (error) throw new Error(error.message.includes("Saldo") ? "Saldo insuficiente para trocar o plano desta cobrança." : "Não foi possível trocar o plano.");
    // Reaplica os avisos no provedor com os canais do novo plano.
    const { data: pay } = await admin.from("payments").select("id, customers(provider_customer_id)").eq("tenant_id", m.tenant_id).eq("charge_group_id", data.chargeGroupId).not("status", "in", "(paid,cancelled,refunded)").limit(1).maybeSingle();
    const providerCustomerId = (pay?.customers as { provider_customer_id?: string | null } | null)?.provider_customer_id;
    if (pay && providerCustomerId) {
      const { getTenantProvider } = await import("./billing.server");
      const conn = await getTenantProvider(admin, m.tenant_id);
      if (conn) { const { applyDunning } = await import("./dunning.server"); await applyDunning(admin, conn.provider, { tenantId: m.tenant_id, paymentId: pay.id, providerCustomerId }).catch(() => undefined); }
    }
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "dunning.charge_plan_change", resource: "payments", result: "success", metadata: { chargeGroupId: data.chargeGroupId, plan: data.plan, diff: Number(diff ?? 0) } });
    return { diff: Number(diff ?? 0) };
  });
