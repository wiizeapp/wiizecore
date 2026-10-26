import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { missingRequiredSteps, ONBOARDING_STEPS, resumeIndex, validOption, type OnboardingKey } from "./onboarding-options";

type Ctx = { supabase: any; userId: string; claims: unknown };

const COLS = "role, business_type, team_size, biggest_challenge, monthly_revenue, goal_90d, acquisition_source, payment_methods, completed_at" as const;

/** Estado do onboarding obrigatório. Só `completed_at` gravado pelo servidor libera o painel (pular não libera mais). */
export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as Ctx).supabase
      .from("user_onboarding").select(COLS).eq("user_id", context.userId).maybeSingle();
    const answers: Partial<Record<OnboardingKey, string | string[]>> = {};
    if (data) for (const s of ONBOARDING_STEPS) {
      const v = (data as Record<string, unknown>)[s.key];
      if (Array.isArray(v) ? v.length : v) answers[s.key] = v as string | string[];
    }
    return { done: Boolean(data?.completed_at), answers, resumeAt: resumeIndex(answers) };
  });

const single = (key: OnboardingKey) =>
  z.string().max(40).nullable().optional().refine((v) => !v || validOption(key, v), "Opção inválida");

export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d) => z.object({
    role: single("role"),
    business_type: single("business_type"),
    team_size: single("team_size"),
    biggest_challenge: single("biggest_challenge"),
    monthly_revenue: single("monthly_revenue"),
    goal_90d: single("goal_90d"),
    acquisition_source: single("acquisition_source"),
    payment_methods: z.array(z.string().max(40)).max(10).default([]).refine((a) => a.every((v) => validOption("payment_methods", v))),
    final: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("./audit.server");
    const { data: existing } = await supabaseAdmin.from("user_onboarding").select("completed_at").eq("user_id", context.userId).maybeSingle();
    if (existing?.completed_at) return { ok: true, done: true };
    const { final, ...answers } = data;
    if (final) {
      const missing = missingRequiredSteps(answers);
      if (missing.length) {
        await logAudit(supabaseAdmin, { userId: context.userId, action: "onboarding.complete_rejected", result: "blocked", metadata: { missing } });
        throw new Error("Responda todas as perguntas obrigatórias para continuar.");
      }
    }
    const { data: member } = await supabaseAdmin.from("tenant_members").select("tenant_id").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
    const { error } = await supabaseAdmin.from("user_onboarding").upsert({
      user_id: context.userId,
      tenant_id: member?.tenant_id ?? null,
      role: answers.role ?? null,
      business_type: answers.business_type ?? null,
      team_size: answers.team_size ?? null,
      biggest_challenge: answers.biggest_challenge ?? null,
      monthly_revenue: answers.monthly_revenue ?? null,
      goal_90d: answers.goal_90d ?? null,
      acquisition_source: answers.acquisition_source ?? null,
      payment_methods: answers.payment_methods,
      skipped: false,
      completed_at: final ? new Date().toISOString() : null,
    }, { onConflict: "user_id" });
    if (error) throw new Error("Não foi possível salvar suas respostas.");
    if (final) await logAudit(supabaseAdmin, { tenantId: member?.tenant_id ?? null, userId: context.userId, action: "onboarding.completed" });
    return { ok: true, done: final };
  });

/** Pular deixou de ser permitido: o pedido é recusado e registrado. */
export const skipOnboarding = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("./audit.server");
    await logAudit(supabaseAdmin, { userId: context.userId, action: "onboarding.skip_blocked", result: "blocked" });
    throw new Error("As etapas obrigatórias precisam ser concluídas.");
  });

/** Resultados agregados para o Admin (platform_admin + 2FA). */
export const getOnboardingInsights = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    await (await import("./admin-session.server")).assertAdminPage(context);
    const { data: isAdmin } = await (context as Ctx).supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
    if (!isAdmin) throw new Error("Acesso restrito à equipe Wiize Core.");
    const { assertTwoFactor } = await import("./finance.server");
    assertTwoFactor(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("user_onboarding")
      .select("user_id, tenant_id, role, business_type, team_size, biggest_challenge, payment_methods, monthly_revenue, goal_90d, acquisition_source, skipped, completed_at, created_at")
      .order("created_at", { ascending: false }).limit(5000);
    const list = rows ?? [];
    const tenantIds = [...new Set(list.map((r) => r.tenant_id).filter(Boolean))] as string[];
    const { data: tenants } = tenantIds.length ? await supabaseAdmin.from("tenants").select("id, name").in("id", tenantIds) : { data: [] };
    const names = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const completed = list.filter((r) => r.completed_at);
    const breakdown = Object.fromEntries(ONBOARDING_STEPS.map((s) => {
      const counts: Record<string, number> = {};
      for (const r of completed) {
        const v = (r as Record<string, unknown>)[s.key];
        for (const id of Array.isArray(v) ? v : v ? [v] : []) counts[id as string] = (counts[id as string] ?? 0) + 1;
      }
      return [s.key, counts];
    }));
    return {
      total: list.length,
      completed: completed.length,
      skipped: list.filter((r) => r.skipped).length,
      breakdown,
      recent: completed.slice(0, 50).map((r) => ({ ...r, company: r.tenant_id ? names.get(r.tenant_id) ?? null : null })),
    };
  });
