import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function requireMembership(context: Ctx, roles?: string[]) {
  const { data } = await context.supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", context.userId).eq("status", "active")
    .limit(1)
    .maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "statement.view");
  if (!data || (roles && !roles.includes(data.role))) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

const FINANCE = ["owner", "admin", "finance"];

/**
 * Confere a liquidação real: para recebíveis com previsão já vencida, consulta o provedor.
 * O saldo só é liberado quando o provedor confirma o recebimento. Idempotente.
 */
export const syncBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMembership(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const { data: due } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("tenant_id", m.tenant_id)
      .eq("status", "paid")
      .is("released_at", null)
      .lte("estimated_available_at", today)
      .limit(10);
    if (due?.length) {
      const { reconcilePaymentFromProvider } = await import("./billing.server");
      for (const p of due) {
        try { await reconcilePaymentFromProvider(supabaseAdmin, m.tenant_id, p.id); } catch { /* segue; conferência sinaliza */ }
      }
    }
    const { error } = await (supabaseAdmin.rpc as any)("release_available_balances", { _tenant_id: m.tenant_id });
    if (error) throw new Error("Não foi possível atualizar o saldo.");
    return { checked: due?.length ?? 0 };
  });

const bankSchema = z.object({
  holderName: z.string().trim().min(3).max(120),
  holderDocument: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF/CNPJ inválido"),
  bankCode: z.string().regex(/^\d{3}$/, "Código do banco com 3 dígitos"),
  agency: z.string().regex(/^\d{1,6}$/),
  accountNumber: z.string().regex(/^[\dXx-]{2,20}$/),
  accountType: z.enum(["checking", "savings"]),
  pixKey: z.string().trim().min(3, "Informe a chave Pix. Saques são feitos somente via Pix.").max(140),
  financialPassword: z.string().min(1).max(200),
  confirmedOwnership: z.literal(true, { errorMap: () => ({ message: "Confirme que conferiu os dados da conta." }) }),
});

export const addBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bankSchema.parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin"]);
    const { assertTwoFactorIfEnrolled, assertFinancialPassword } = await import("./finance.server");
    await assertTwoFactorIfEnrolled(context.claims, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.financialPassword, "bank_account.add");
    // Validação interna antes de aceitar a conta para saque.
    const { validDocument, validPixKey, onlyDigits } = await import("./doc-validation");
    if (!validDocument(data.holderDocument)) throw new Error("CPF/CNPJ do titular inválido.");
    if (data.pixKey && !validPixKey(data.pixKey)) throw new Error("Chave Pix em formato inválido.");
    if (/^0+$/.test(onlyDigits(data.accountNumber)) || /^0+$/.test(data.agency)) throw new Error("Agência ou conta inválida.");
    const [{ data: act }, { data: tenant }] = await Promise.all([
      supabaseAdmin.from("payment_activations").select("status, form_data, form_enc, person_type").eq("tenant_id", m.tenant_id).maybeSingle(),
      supabaseAdmin.from("tenants").select("document").eq("id", m.tenant_id).maybeSingle(),
    ]);
    const f = (await import("./activation-form-crypto.server")).openForm(act);
    const allowed = new Set([f["cpf"], f["cnpj"], tenant?.document].filter(Boolean).map((d) => onlyDigits(d as string)));
    if (!allowed.size) throw new Error("Conclua a ativação do Wiize Core antes de cadastrar a conta de saque.");
    if (!allowed.has(data.holderDocument)) throw new Error("A conta de saque precisa estar no mesmo CPF/CNPJ do cadastro da empresa.");
    const verified = act?.status === "approved";
    await supabaseAdmin.from("bank_accounts").update({ is_default: false }).eq("tenant_id", m.tenant_id);
    const { data: row, error } = await supabaseAdmin
      .from("bank_accounts")
      .insert({
        tenant_id: m.tenant_id,
        holder_name: data.holderName,
        bank_code: data.bankCode,
        account_type: data.accountType,
        ...(await import("./bank-account-crypto.server")).sealBank({
          holder_document: data.holderDocument,
          agency: data.agency,
          account_number: data.accountNumber,
          pix_key: data.pixKey || null,
        }),
        is_default: true,
        verification_status: verified ? "verified" : "pending",
        verified_at: verified ? new Date().toISOString() : null,
        verification_notes: verified ? "Titular confere com o cadastro aprovado" : "Aguardando aprovação do cadastro Wiize Core",
      })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível salvar a conta bancária.");
    await logAudit(supabaseAdmin, {
      userId: context.userId,
      tenantId: m.tenant_id,
      action: "bank_account.add",
      resource: "bank_account",
      resourceId: row.id,
      metadata: { owner_confirmed_terms: true },
    });
    return { id: row.id, verified };
  });

const withdrawalSchema = z.object({
  bankAccountId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000).refine((n) => Math.round(n * 100) === n * 100, "Máximo de 2 casas decimais"),
  financialPassword: z.string().min(1).max(200),
  idempotencyKey: z.string().min(16).max(80),
});

const withdrawalErrors: Record<string, string> = {
  insufficient_balance: "Saldo disponível insuficiente.",
  below_minimum: "Valor abaixo do mínimo permitido para saque.",
  invalid_bank_account: "Conta de saque inválida ou sem chave Pix.",
  invalid_amount: "Valor inválido.",
  daily_limit: "Esse valor passa do seu limite diário de saque Pix. Veja em Limites da conta.",
  monthly_limit: "Você já usou todos os saques do mês. Veja em Limites da conta.",
};

/** Limites de saque da empresa: limite diário Pix, quanto já foi usado hoje e quanto resta. */
export const getAccountLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMembership(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("platform_settings")
      .select("key, value")
      .in("key", ["pix_daily_limit", "minimum_withdrawal_amount", "withdrawal_fee_amount"]);
    const get = (k: string, d: number) => Number(settings?.find((s) => s.key === k)?.value ?? d);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const start = new Date(`${today}T00:00:00-03:00`).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("withdrawals")
      .select("amount")
      .eq("tenant_id", m.tenant_id)
      .not("status", "in", "(cancelled,failed)")
      .gte("requested_at", start);
    const used = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const daily = get("pix_daily_limit", 5000);
    return {
      dailyLimit: daily,
      usedToday: Math.round(used * 100) / 100,
      remainingToday: Math.max(0, Math.round((daily - used) * 100) / 100),
      minimum: get("minimum_withdrawal_amount", 50),
      fee: get("withdrawal_fee_amount", 5),
    };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => withdrawalSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Saque é permissão crítica: só Proprietário e Admin (nunca colaborador financeiro).
    const m = await requireMembership(context, ["owner", "admin"]);
    const { assertFinancialPassword, assertTwoFactorIfEnrolled } = await import("./finance.server");
    await assertTwoFactorIfEnrolled(context.claims, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit } = await import("./audit.server");
    const rl = await consumeRateLimit(supabaseAdmin, {
      scope: "withdrawal",
      identifier: context.userId,
      maxAttempts: 10,
      windowSeconds: 3600,
      blockSeconds: 3600,
    });
    if (!rl.allowed) throw new Error("Muitas tentativas de saque. Tente novamente mais tarde.");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.financialPassword, "withdrawal.request");
    // 2FA extra no saque é escolha do usuário; quando ligado, o servidor exige sessão confirmada (aal2).
    const { data: sec } = await supabaseAdmin.from("user_security_settings").select("withdrawal_2fa_required").eq("user_id", context.userId).maybeSingle();
    if (sec?.withdrawal_2fa_required && (context.claims as { aal?: string } | null)?.aal !== "aal2") {
      await logAudit(supabaseAdmin, { userId: context.userId, tenantId: m.tenant_id, action: "withdrawal.request", result: "failure", metadata: { reason: "2fa_required" } });
      throw new Error("Confirme o código da verificação em duas etapas para sacar.");
    }
    const { data: id, error } = await (supabaseAdmin.rpc as any)("request_withdrawal", {
      _tenant_id: m.tenant_id,
      _user_id: context.userId,
      _bank_account_id: data.bankAccountId,
      _amount: data.amount,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) {
      const code = Object.keys(withdrawalErrors).find((k) => error.message?.includes(k));
      await logAudit(supabaseAdmin, {
        userId: context.userId,
        tenantId: m.tenant_id,
        action: "withdrawal.request",
        result: "failure",
        metadata: { reason: code ?? "error", amount: data.amount },
      });
      throw new Error(code ? withdrawalErrors[code] : "Não foi possível solicitar o saque.");
    }
    await logAudit(supabaseAdmin, {
      userId: context.userId,
      tenantId: m.tenant_id,
      action: "withdrawal.request",
      resource: "withdrawal",
      resourceId: id,
      metadata: { amount: data.amount },
    });
    {
      const { notifyTenant, notifyPlatform, brl } = await import("./notify.server");
      await notifyTenant(supabaseAdmin, {
        tenantId: m.tenant_id, kind: "withdrawal.requested", dedupeKey: `withdrawal.requested:${id}`, link: "/financeiro",
        title: "Saque solicitado", body: `Recebemos sua solicitação de saque de ${brl(data.amount)}. Ela está em análise.`,
        email: { subject: "Solicitação de saque recebida", lines: [{ label: "Valor", value: brl(data.amount) }], footnote: "Se você não fez esta solicitação, troque sua senha e a senha financeira imediatamente e fale com o suporte." },
      });
      await notifyPlatform(supabaseAdmin, { tenantId: m.tenant_id, kind: "withdrawal.requested", title: "Novo saque para aprovar", body: `Saque de ${brl(data.amount)} aguardando análise.`, link: "/nimda", email: { subject: "Saque aguardando sua autorização", lines: [{ label: "Valor", value: brl(data.amount) }], dedupeKey: `withdrawal.admin:${id}` } });
    }
    return { id: id as string };
  });

export const cancelWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ withdrawalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, FINANCE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.rpc as any)("cancel_withdrawal", {
      _tenant_id: m.tenant_id,
      _withdrawal_id: data.withdrawalId,
      _reason: "Cancelado pelo usuário",
    });
    if (error) throw new Error("Este saque não pode mais ser cancelado.");
    await logAudit(supabaseAdmin, {
      userId: context.userId,
      tenantId: m.tenant_id,
      action: "withdrawal.cancel",
      resource: "withdrawal",
      resourceId: data.withdrawalId,
    });
    return { ok: true };
  });
