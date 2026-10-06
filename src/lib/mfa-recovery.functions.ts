import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { consumeRateLimit, logAudit, logSecurityEvent } from "./audit.server";
import { assertStrongPassword } from "./password-policy";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Remove todos os autenticadores do usuário (o 2FA precisa ser cadastrado de novo). */
async function removeAllFactors(admin: Admin, userId: string) {
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  }
  await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
}

async function notifyUser(admin: Admin, userId: string, title: string, body: string) {
  const { data: m } = await admin.from("tenant_members").select("tenant_id").eq("user_id", userId).limit(1).maybeSingle();
  if (m?.tenant_id) {
    await admin.from("notifications").insert({ tenant_id: m.tenant_id, kind: "security", title, body, link: "/seguranca" });
  }
}

/** Recupera o acesso usando um código de recuperação gerado antes. */
export const recoverWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string }) => z.object({ code: z.string().trim().min(8).max(20) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifySecretValue } = await import("./crypto.server");
    const limit = await consumeRateLimit(supabaseAdmin, {
      scope: "mfa_recovery", identifier: context.userId, maxAttempts: 5, windowSeconds: 900, blockSeconds: 1800,
    });
    if (!limit.allowed) throw new Error("Muitas tentativas. Tente novamente mais tarde.");

    const { data: codes } = await supabaseAdmin
      .from("mfa_recovery_codes").select("id, code_hash").eq("user_id", context.userId).is("used_at", null);
    const code = data.code.toUpperCase();
    const match = (codes ?? []).find((c) => verifySecretValue(code, c.code_hash));
    if (!match) {
      await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "mfa.recovery_failed", severity: "warning" });
      await logAudit(supabaseAdmin, { userId: context.userId, action: "mfa.recovery", result: "failure" });
      throw new Error("Código de recuperação inválido.");
    }
    await supabaseAdmin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);
    await removeAllFactors(supabaseAdmin, context.userId);

    // Encerra as outras sessões abertas.
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const jwt = (getRequestHeader("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (jwt) await supabaseAdmin.auth.admin.signOut(jwt, "others").catch(() => null);

    await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "mfa.recovered_with_code", severity: "critical" });
    await logAudit(supabaseAdmin, { userId: context.userId, action: "mfa.recovered_with_code" });
    await notifyUser(supabaseAdmin, context.userId, "Verificação em duas etapas redefinida",
      "Seu autenticador foi removido com um código de recuperação. Cadastre um novo autenticador agora.");
    return { ok: true };
  });

/** Troca a senha com o link válido e o código reserva, preservando o 2FA ativo. */
export const resetPasswordWithRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; password: string }) => {
    const parsed = z.object({ code: z.string().trim().min(8).max(20), password: z.string().min(1).max(200) }).parse(input);
    assertStrongPassword(parsed.password, "A senha");
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifySecretValue } = await import("./crypto.server");
    const limit = await consumeRateLimit(supabaseAdmin, {
      scope: "password_recovery_code", identifier: context.userId, maxAttempts: 5, windowSeconds: 900, blockSeconds: 1800,
    });
    if (!limit.allowed) throw new Error("Muitas tentativas. Tente novamente mais tarde.");

    const { data: stored } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .select("id, code_hash")
      .eq("user_id", context.userId)
      .is("used_at", null)
      .maybeSingle();
    if (!stored || !verifySecretValue(data.code.toUpperCase(), stored.code_hash)) {
      await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "password.recovery_code_failed", severity: "warning" });
      await logAudit(supabaseAdmin, { userId: context.userId, action: "password.recovery_with_code", result: "failure" });
      throw new Error("Código reserva inválido.");
    }

    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .update({ used_at: consumedAt })
      .eq("id", stored.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) throw new Error("Este código reserva já foi utilizado.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) {
      await supabaseAdmin.from("mfa_recovery_codes").update({ used_at: null }).eq("id", stored.id).eq("used_at", consumedAt);
      throw new Error("Não foi possível alterar a senha agora.");
    }

    await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "password.recovered_with_backup_code", severity: "critical" });
    await logAudit(supabaseAdmin, { userId: context.userId, action: "password.recovered_with_backup_code" });
    return { ok: true };
  });

/** Desativa o 2FA após validar e consumir o código reserva único. */
export const disableMfaWithRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().trim().min(8).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifySecretValue } = await import("./crypto.server");
    const limit = await consumeRateLimit(supabaseAdmin, {
      scope: "mfa_disable_code", identifier: context.userId, maxAttempts: 5, windowSeconds: 900, blockSeconds: 1800,
    });
    if (!limit.allowed) throw new Error("Muitas tentativas. Tente novamente mais tarde.");
    const { data: stored } = await supabaseAdmin.from("mfa_recovery_codes")
      .select("id, code_hash").eq("user_id", context.userId).is("used_at", null).maybeSingle();
    if (!stored || !verifySecretValue(data.code.toUpperCase(), stored.code_hash)) {
      await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "mfa.disable_code_failed", severity: "warning" });
      throw new Error("Código reserva inválido.");
    }
    const { data: consumed } = await supabaseAdmin.from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() }).eq("id", stored.id).is("used_at", null).select("id").maybeSingle();
    if (!consumed) throw new Error("Este código reserva já foi utilizado.");
    await removeAllFactors(supabaseAdmin, context.userId);
    await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "mfa.disabled_with_backup_code", severity: "critical" });
    await logAudit(supabaseAdmin, { userId: context.userId, action: "mfa.disabled_with_backup_code" });
    await notifyUser(supabaseAdmin, context.userId, "Verificação em duas etapas desativada", "O 2FA foi desativado com seu código reserva.");
    return { ok: true };
  });

/** Sem código de recuperação: envia pedido para análise da equipe WiizePay. */
export const requestAdminRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reason: string }) => z.object({ reason: z.string().trim().min(10).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: open } = await supabaseAdmin
      .from("mfa_recovery_requests").select("id").eq("user_id", context.userId).eq("status", "pending").maybeSingle();
    if (open) throw new Error("Você já tem um pedido em análise.");
    await supabaseAdmin.from("mfa_recovery_requests").insert({ user_id: context.userId, reason: data.reason });
    await supabaseAdmin.from("platform_notifications").insert({
      kind: "mfa_recovery", title: "Pedido de recuperação de 2FA", body: "Um usuário pediu recuperação do autenticador.", link: "/nimda",
    } as never);
    await logAudit(supabaseAdmin, { userId: context.userId, action: "mfa.recovery_requested", metadata: { reason: data.reason } });
    return { ok: true };
  });

export const getMyRecoveryRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("mfa_recovery_requests").select("status, created_at, review_note")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ?? null;
  });

/* ---------------- Admin ---------------- */

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe WiizePay.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function emailMap(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return new Map((data?.users ?? []).map((u) => [u.id, u]));
}

export const listRecoveryRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data } = await admin.from("mfa_recovery_requests").select("*").order("created_at", { ascending: false }).limit(100);
    const users = await emailMap(admin);
    return (data ?? []).map((r) => ({ ...r, email: users.get(r.user_id)?.email ?? "—" }));
  });

export const reviewRecoveryRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; approve: boolean; note: string }) =>
    z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().trim().min(5).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data: req } = await admin.from("mfa_recovery_requests").select("*").eq("id", data.id).maybeSingle();
    if (!req || req.status !== "pending") throw new Error("Pedido não está pendente.");
    if (req.user_id === context.userId) throw new Error("Você não pode aprovar o próprio pedido.");
    if (data.approve) await removeAllFactors(admin, req.user_id);
    await admin.from("mfa_recovery_requests").update({
      status: data.approve ? "approved" : "rejected", reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(), review_note: data.note,
    }).eq("id", data.id);
    await logAudit(admin, {
      userId: context.userId, action: data.approve ? "admin.mfa_reset" : "admin.mfa_reset_rejected",
      resource: "user", resourceId: req.user_id, metadata: { note: data.note },
    });
    if (data.approve) await logSecurityEvent(admin, { userId: req.user_id, eventType: "mfa.reset_by_admin", severity: "critical" });
    await notifyUser(admin, req.user_id,
      data.approve ? "Recuperação aprovada" : "Recuperação recusada",
      data.approve ? "Seu autenticador foi removido. Cadastre um novo na página Segurança." : `Motivo: ${data.note}`);
    return { ok: true };
  });

/** Painel do Admin: volume dos clientes separado da receita WiizePay. */
export const getAdminConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { days: number }) => z.object({ days: z.number().int().min(1).max(365) }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const [pays, wds, invs, tenants, pendW, pendA, pendR] = await Promise.all([
      admin.from("payments").select("tenant_id, method, gross_amount, platform_fee_amount, provider_fee_amount, paid_at").not("paid_at", "is", null).gte("paid_at", since).limit(10000),
      admin.from("withdrawals").select("fee_amount").eq("status", "completed").gte("completed_at", since),
      admin.from("invoices").select("wiize_fee_amount, provider_fee_amount").not("fee_charged_at", "is", null).gte("fee_charged_at", since),
      admin.from("tenants").select("id, name"),
      admin.from("withdrawals").select("id", { count: "exact", head: true }).in("status", ["requested", "in_analysis"]),
      admin.from("payment_activations").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
      admin.from("mfa_recovery_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const n = (v: unknown) => Number(v ?? 0);
    const names = new Map((tenants.data ?? []).map((t) => [t.id, t.name]));
    let volume = 0, feeCharges = 0, providerCost = 0;
    const byMethod: Record<string, number> = {};
    const byDay: Record<string, { volume: number; receita: number }> = {};
    const byTenant = new Map<string, { volume: number; receita: number; count: number }>();
    for (const p of pays.data ?? []) {
      const g = n(p.gross_amount), f = n(p.platform_fee_amount), c = n(p.provider_fee_amount);
      volume += g; feeCharges += f; providerCost += c;
      const mk = p.method ?? "outro";
      byMethod[mk] = (byMethod[mk] ?? 0) + (f - c);
      const d = String(p.paid_at).slice(0, 10);
      byDay[d] ??= { volume: 0, receita: 0 }; byDay[d].volume += g; byDay[d].receita += f - c;
      const t = byTenant.get(p.tenant_id) ?? { volume: 0, receita: 0, count: 0 };
      t.volume += g; t.receita += f - c; t.count += 1; byTenant.set(p.tenant_id, t);
    }
    const withdrawalFees = (wds.data ?? []).reduce((s, w) => s + n(w.fee_amount), 0);
    const invoiceFees = (invs.data ?? []).reduce((s, i) => s + n(i.wiize_fee_amount), 0);
    const tenantList = [...byTenant.entries()].map(([id, v]) => ({ id, name: names.get(id) ?? "—", ...v }));
    return {
      volume, paymentsCount: pays.data?.length ?? 0,
      chargeMargin: feeCharges - providerCost, providerCost, withdrawalFees, invoiceFees,
      revenue: feeCharges - providerCost + withdrawalFees + invoiceFees,
      byMethod, series: Object.entries(byDay).sort().map(([date, v]) => ({ date, ...v })),
      topVolume: [...tenantList].sort((a, b) => b.volume - a.volume).slice(0, 5),
      topRevenue: [...tenantList].sort((a, b) => b.receita - a.receita).slice(0, 5),
      pending: { withdrawals: pendW.count ?? 0, activations: pendA.count ?? 0, recoveries: pendR.count ?? 0 },
      companies: tenants.data?.length ?? 0,
    };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const users = await emailMap(admin);
    const [{ data: members }, { data: tenants }, { data: acts }] = await Promise.all([
      admin.from("tenant_members").select("user_id, tenant_id, role"),
      admin.from("tenants").select("id, name"),
      admin.from("payment_activations").select("tenant_id, status"),
    ]);
    const tName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const tAct = new Map((acts ?? []).map((a) => [a.tenant_id, a.status]));
    const mem = new Map((members ?? []).map((m) => [m.user_id, m]));
    return [...users.values()].map((u) => {
      const m = mem.get(u.id);
      return {
        id: u.id, email: u.email ?? "—", name: (u.user_metadata?.["full_name"] as string) ?? null,
        createdAt: u.created_at, lastSignInAt: u.last_sign_in_at ?? null,
        has2fa: (u.factors ?? []).some((f) => f.status === "verified"),
        company: m ? tName.get(m.tenant_id) ?? "—" : null, role: m?.role ?? null,
        activation: m ? tAct.get(m.tenant_id) ?? "not_started" : null,
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { q?: string }) => z.object({ q: z.string().max(80).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    let q = admin.from("audit_logs").select("id, user_id, action, resource, resource_id, result, ip_address, created_at, metadata").order("created_at", { ascending: false }).limit(200);
    if (data.q) q = q.ilike("action", `%${data.q}%`);
    const { data: rows } = await q;
    const users = await emailMap(admin);
    return (rows ?? []).map((r) => ({ ...r, email: r.user_id ? users.get(r.user_id)?.email ?? "—" : "sistema" }));
  });
