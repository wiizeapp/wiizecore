import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

async function isPlatformAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  return Boolean(data);
}

/** Admin Wiize Core: papel platform_admin + sessão com 2FA (aal2). */
async function requireAdmin(context: Ctx) {
  await (await import("./admin-session.server")).assertAdminPage(context);
  if (!(await isPlatformAdmin(context))) throw new Error("Acesso restrito à equipe Wiize Core.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => ({ isAdmin: await isPlatformAdmin(context as Ctx) }));

const num = (v: unknown) => Number(v ?? 0);


export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const [{ data: tenants }, { data: wallets }, { data: fees }, { data: txs }, { data: settings }, { data: pendingW }, { data: payFees }, { data: antFees }] =
      await Promise.all([
        admin.from("tenants").select("id, name, document, created_at"),
        admin.from("wallets").select("*"),
        admin.from("transactions").select("amount, occurred_at").eq("kind", "platform_fee"),
        admin
          .from("transactions")
          .select("id, tenant_id, kind, description, amount, occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(150),
        admin.from("platform_settings").select("key, value, description").in("key", [...EDITABLE]).order("key"),
        admin.from("withdrawals").select("amount").in("status", ["requested", "in_analysis", "processing"]),
        admin.from("payment_fee_settings").select("payment_method, installment_min, installment_max, fixed_fee, percentage_fee").eq("active", true).order("payment_method").order("installment_min"),
        admin.from("anticipation_fee_settings").select("payment_method, monthly_percentage_fee").eq("active", true).order("payment_method"),
      ]);
    const names = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const revenueTotal = (fees ?? []).reduce((s, f) => s - num(f.amount), 0);
    const revenueMonth = (fees ?? [])
      .filter((f) => new Date(f.occurred_at) >= monthStart)
      .reduce((s, f) => s - num(f.amount), 0);
    const w = wallets ?? [];
    return {
      totals: {
        tenants: tenants?.length ?? 0,
        grossVolume: w.reduce((s, x) => s + num(x.total_received), 0),
        revenueTotal,
        revenueMonth,
        pendingBalances: w.reduce((s, x) => s + num(x.pending_balance), 0),
        availableBalances: w.reduce((s, x) => s + num(x.available_balance), 0),
        withdrawalsQueue: (pendingW ?? []).reduce((s, x) => s + num(x.amount), 0),
        withdrawalsQueueCount: pendingW?.length ?? 0,
      },
      tenants: (tenants ?? []).map((t) => {
        const wl = w.find((x) => x.tenant_id === t.id);
        return {
          id: t.id,
          name: t.name,
          document: t.document,
          createdAt: t.created_at,
          received: num(wl?.total_received),
          fees: num(wl?.total_fees),
          pending: num(wl?.pending_balance),
          available: num(wl?.available_balance),
          blocked: num(wl?.blocked_balance),
          withdrawn: num(wl?.total_withdrawn),
        };
      }),
      transactions: (txs ?? []).map((t) => ({ ...t, amount: num(t.amount), tenantName: names.get(t.tenant_id) ?? "—" })),
      settings: (settings ?? []).map((s) => ({ key: s.key, value: num(s.value), description: s.description })),
      paymentFees: (payFees ?? []).map((f) => ({ method: f.payment_method, min: f.installment_min, max: f.installment_max, fixed: num(f.fixed_fee), pct: num(f.percentage_fee) })),
      anticipationFees: (antFees ?? []).map((f) => ({ method: f.payment_method, pct: num(f.monthly_percentage_fee) })),
    };
  });

export const listAdminWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { sealLegacyBankAccounts, openBank } = await import("./bank-account-crypto.server");
    await sealLegacyBankAccounts(admin);
    const { data } = await admin
      .from("withdrawals")
      .select(
        "id, tenant_id, amount, fee_amount, net_amount, status, requested_at, reviewed_at, transfer_reference, failure_reason, bank_accounts(holder_name, holder_document, bank_code, agency, account_number, account_type, pix_key, sensitive_enc), tenants(name)",
      )
      .order("requested_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((w: any) => ({
      id: w.id as string,
      tenantName: w.tenants?.name ?? "—",
      amount: num(w.amount),
      fee: num(w.fee_amount),
      net: num(w.net_amount),
      status: w.status as string,
      requestedAt: w.requested_at as string,
      reviewedAt: w.reviewed_at as string | null,
      reference: w.transfer_reference as string | null,
      reason: w.failure_reason as string | null,
      bank: (w.bank_accounts ? (({ sensitive_enc: _e, ...b }) => b)(openBank(w.bank_accounts)) : null) as null | {
        holder_name: string;
        holder_document: string;
        bank_code: string;
        agency: string;
        account_number: string;
        account_type: string;
        pix_key: string | null;
      },
    }));
  });

const reviewSchema = z.object({
  withdrawalId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional().default(""),
  financialPassword: z.string().min(1).max(200),
});

export const reviewWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { assertFinancialPassword } = await import("./finance.server");
    await assertFinancialPassword(admin, context.userId, data.financialPassword, `admin.withdrawal.${data.decision}`);
    const { data: wd } = await admin
      .from("withdrawals")
      .select("id, tenant_id, provider_connection_id, requested_by, amount, fee_amount, net_amount, status, bank_accounts(holder_name, holder_document, bank_code, agency, account_number, account_type, pix_key, sensitive_enc)")
      .eq("id", data.withdrawalId)
      .maybeSingle();
    if (!wd) throw new Error("Saque não encontrado.");
    if (wd.requested_by === context.userId) throw new Error("Você não pode aprovar um saque solicitado por você mesmo.");
    const editableStatuses = ['requested', 'in_analysis'];
    if (!editableStatuses.includes(wd.status)) throw new Error("Este saque não pode mais ser alterado.");
    if (data.decision === "reject" && data.note.length < 3) throw new Error("Informe o motivo da recusa.");

    const rpc = admin.rpc as any;
    let reference = data.note;
    if (data.decision === "approve") {
      const rawBank = Array.isArray(wd.bank_accounts) ? wd.bank_accounts[0] : wd.bank_accounts;
      const bank = rawBank ? (await import("./bank-account-crypto.server")).openBank(rawBank) : null;
      if (!bank) throw new Error("Conta bancária do saque não encontrada.");
      if (!bank.pix_key) throw new Error("A conta de saque não tem chave Pix. Saques são feitos somente via Pix.");
      const { getTenantProvider } = await import("./billing.server");
      if (!wd.provider_connection_id) throw new Error("A origem deste saque precisa ser conferida antes de continuar.");
      const conn = await getTenantProvider(admin, wd.tenant_id, wd.provider_connection_id);
      if (!conn) throw new Error("Conta de pagamentos da empresa não encontrada.");
      const failAndRefund = async (why: string) => {
        await rpc("cancel_withdrawal", { _tenant_id: wd.tenant_id, _withdrawal_id: wd.id, _reason: why });
        await admin.from("withdrawals").update({ status: "failed", reviewed_by: context.userId, reviewed_at: new Date().toISOString() }).eq("id", wd.id);
        const { notifyTenant } = await import("./notify.server");
        await notifyTenant(admin, {
          tenantId: wd.tenant_id, kind: "withdrawal.failed", dedupeKey: `withdrawal.failed:${wd.id}`, link: "/financeiro",
          title: "Saque não realizado", body: "Não foi possível concluir seu saque agora. O valor voltou para o seu saldo — tente novamente mais tarde.",
          email: { subject: "Seu saque não foi concluído" },
        });
      };
      // Taxa de saque: fica na subconta para cobrir a tarifa de transferência do próprio Asaas (sem repasse à Wiize Core).
      const fee = Number(wd.fee_amount ?? 0);
      // 2) Reserva exclusiva: só um pedido consegue passar para "processing"; evita Pix enviado duas vezes.
      const { data: claimed } = await admin
        .from("withdrawals")
        .update({ status: "processing", provider_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", wd.id)
        .in("status", ["requested", "in_analysis"])
        .is("provider_transfer_id", null)
        .select("id")
        .maybeSingle();
      if (!claimed) throw new Error("Este saque já está sendo enviado. Confira o resultado antes de tentar de novo.");
      try {
        const pix = (await import("./doc-validation")).pixKeyType(bank.pix_key);
        if (!pix || bank.pix_key.includes("•")) throw new Error("Chave Pix da conta de saque inválida");
        const transfer = await conn.provider.createTransfer({
          value: Number(wd.net_amount),
          operationType: "PIX",
          pixAddressKey: pix.key,
          pixAddressKeyType: pix.type,
          description: data.note || `Saque Wiize Core ${wd.id}`,
          externalReference: `withdrawal:${wd.id}`,
        });
        reference = transfer.id;
        await admin.from("withdrawals").update({ provider_transfer_id: transfer.id, provider_status: transfer.status ?? "requested", transfer_reference: transfer.id }).eq("id", wd.id);
      } catch (e) {
        await logAudit(admin, { userId: context.userId, tenantId: wd.tenant_id, action: "withdrawal.pix", resource: "withdrawal", resourceId: wd.id, result: "failure", metadata: { error: String((e as Error).message ?? e), fee_kept_in_subaccount: fee } });
        // Timeout is not a rejection: retain the reservation until provider reconciliation.
        throw new Error("Não foi possível confirmar o envio do Pix. O saque permanece reservado para conferência no Asaas.");
      }
    }
    const { error } =
      data.decision === "approve"
        ? await rpc("complete_withdrawal", { _withdrawal_id: data.withdrawalId, _reviewer: context.userId, _reference: reference })
        : await rpc("cancel_withdrawal", { _tenant_id: wd.tenant_id, _withdrawal_id: data.withdrawalId, _reason: data.note });
    if (error) throw new Error("Este saque não pode mais ser alterado.");
    const { notifyTenant, brl } = await import("./notify.server");
    if (data.decision === "reject") {
      await admin
        .from("withdrawals")
        .update({ status: "cancelled", reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
        .eq("id", data.withdrawalId);
      await notifyTenant(admin, {
        tenantId: wd.tenant_id, kind: "withdrawal.rejected", dedupeKey: `withdrawal.rejected:${wd.id}`, link: "/financeiro",
        title: "Saque recusado", body: `${data.note}. O valor voltou para o seu saldo disponível.`,
        email: { subject: "Seu saque foi recusado", lines: [{ label: "Valor", value: brl(wd.net_amount) }] },
      });
    } else {
      await notifyTenant(admin, {
        tenantId: wd.tenant_id, kind: "withdrawal.approved", dedupeKey: `withdrawal.approved:${wd.id}`, link: "/financeiro",
        title: "Saque aprovado", body: `Seu saque de ${brl(wd.net_amount)} foi aprovado e enviado por Pix para a conta cadastrada.`,
        email: { subject: "Saque aprovado e enviado por Pix", lines: [{ label: "Valor enviado", value: brl(wd.net_amount) }, ...(Number(wd.fee_amount ?? 0) > 0 ? [{ label: "Taxa de saque", value: brl(wd.fee_amount) }] : [])] },
      });
    }
    await logAudit(admin, {
      userId: context.userId,
      tenantId: wd.tenant_id,
      action: `admin.withdrawal.${data.decision}`,
      resource: "withdrawal",
      resourceId: data.withdrawalId,
    });
    return { ok: true };
  });

const EDITABLE = ["minimum_withdrawal_amount", "withdrawal_fee_amount", "pix_daily_limit"] as const;

export const updatePlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ key: z.enum(EDITABLE), value: z.number().min(0).max(100000), financialPassword: z.string().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { assertFinancialPassword } = await import("./finance.server");
    await assertFinancialPassword(admin, context.userId, data.financialPassword, "admin.settings.update");
    const { data: before } = await admin.from("platform_settings").select("value").eq("key", data.key).maybeSingle();
    const { error } = await admin
      .from("platform_settings")
      .update({ value: data.value, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    if (error) throw new Error("Não foi possível salvar.");
    await logAudit(admin, {
      userId: context.userId,
      action: "admin.settings.update",
      resource: "platform_settings",
      resourceId: data.key,
      metadata: { from: before?.value ?? null, to: data.value },
    });
    return { ok: true };
  });

/** Contas das empresas: saldo real no provedor x saldo no sistema, e divergências de valores. */
export const getTenantAccounts = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { getTenantProvider } = await import("./billing.server");
    const [{ data: tenants }, { data: wallets }, { data: conns }, { data: issues }] = await Promise.all([
      admin.from("tenants").select("id, name"),
      admin.from("wallets").select("tenant_id, pending_balance, available_balance, blocked_balance"),
      admin.from("provider_connections").select("tenant_id, status, onboarding_status, general_status").eq("provider", "asaas"),
      admin.from("reconciliation_issues" as never).select("tenant_id, kind, expected, actual, payment_id, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(200),
    ]);
    const rows = await Promise.all((tenants ?? []).map(async (t) => {
      const w = wallets?.find((x) => x.tenant_id === t.id);
      const c = conns?.find((x) => x.tenant_id === t.id);
      const systemBalance = num(w?.available_balance) + num(w?.blocked_balance);
      let providerBalance: number | null = null;
      if (c?.status === "connected") {
        try { const p = await getTenantProvider(admin, t.id); providerBalance = p ? num((await p.provider.getBalance()).balance) : null; } catch { providerBalance = null; }
      }
      return {
        id: t.id, name: t.name, status: c?.general_status ?? c?.onboarding_status ?? c?.status ?? "sem conta",
        pending: num(w?.pending_balance), systemBalance, providerBalance,
        difference: providerBalance == null ? null : Math.round((providerBalance - systemBalance) * 100) / 100,
        issues: ((issues ?? []) as any[]).filter((i) => i.tenant_id === t.id).length,
      };
    }));
    return { rows, issues: ((issues ?? []) as any[]).map((i) => ({ ...i, tenant: tenants?.find((t) => t.id === i.tenant_id)?.name ?? "—", expected: num(i.expected), actual: num(i.actual) })) };
  });

/** Painel de uma empresa: saldo, cobranças e antecipações (somente leitura). */
export const getTenantDetail = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const [{ data: tenant }, { data: wallet }, { data: pays }, { data: ants }] = await Promise.all([
      admin.from("tenants").select("id, name, document, email").eq("id", data.tenantId).maybeSingle(),
      admin.from("wallets").select("*").eq("tenant_id", data.tenantId).maybeSingle(),
      admin
        .from("payments")
        .select("id, description, status, method, gross_amount, platform_fee_amount, provider_fee_amount, net_amount, due_on, paid_at, available_on, estimated_available_at, actual_available_at, settlement_status, anticipation_status, customers(name)")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("anticipation_requests")
        .select("id, status, gross_amount, wiize_fee_amount, provider_fee_amount, net_amount, created_at, failure_reason")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (!tenant) throw new Error("Empresa não encontrada.");
    return {
      tenant,
      wallet: {
        pending: num(wallet?.pending_balance),
        available: num(wallet?.available_balance),
        blocked: num(wallet?.blocked_balance),
        received: num(wallet?.total_received),
        fees: num(wallet?.total_fees),
        withdrawn: num(wallet?.total_withdrawn),
      },
      payments: (pays ?? []).map((p: any) => ({
        id: p.id as string,
        customer: p.customers?.name ?? "—",
        description: p.description as string | null,
        status: p.status as string,
        method: p.method as string | null,
        gross: num(p.gross_amount),
        fee: num(p.platform_fee_amount),
        providerFee: num(p.provider_fee_amount),
        net: num(p.net_amount),
        dueOn: p.due_on as string,
        paidAt: p.paid_at as string | null,
        availableOn: (p.estimated_available_at ?? p.available_on) as string | null,
        releasedAt: p.actual_available_at as string | null,
        settlement: p.settlement_status as string | null,
        anticipation: p.anticipation_status as string | null,
      })),
      anticipations: (ants ?? []).map((a) => ({
        id: a.id,
        status: a.status as string,
        gross: num(a.gross_amount),
        fee: num(a.wiize_fee_amount),
        providerFee: num(a.provider_fee_amount),
        net: num(a.net_amount),
        createdAt: a.created_at,
        reason: a.failure_reason,
      })),
    };
  });

/** Conferência extrato x carteira por empresa (somente leitura, admin + 2FA). */
export const getWalletConsistency = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data, error } = await admin.rpc("wallet_consistency_report" as never);
    if (error) throw new Error("Não foi possível conferir os saldos agora.");
    const rows = (data ?? []) as Array<{ tenant_id: string; tenant_name: string; ledger_total: number; wallet_total: number; difference: number }>;
    return rows.filter((r) => Math.abs(Number(r.difference)) >= 0.01);
  });
