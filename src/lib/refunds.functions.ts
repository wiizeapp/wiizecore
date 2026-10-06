import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims?: unknown };
const FINANCE = ["owner", "admin", "finance"];
async function membership(context: Ctx, write = false) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).limit(1).maybeSingle();
  if (!data || (write && !FINANCE.includes(data.role))) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

const ERRORS: Record<string, string> = {
  not_paid: "Só é possível reembolsar cobranças pagas.",
  window_expired: "O prazo para reembolso desta cobrança terminou.",
  anticipated: "Esta cobrança foi antecipada e não pode ser reembolsada por aqui.",
  refund_in_progress: "Já existe um reembolso em andamento para esta cobrança.",
  nothing_to_refund: "Não há valor disponível para reembolso.",
  partial_not_allowed: "Sua política não permite reembolso parcial.",
  invalid_amount: "Valor de reembolso inválido.",
  invalid_deduction: "A dedução precisa ser menor que o valor do reembolso.",
  deduction_reason_required: "Informe o motivo da dedução.",
  reason_required: "Informe o motivo do reembolso.",
  insufficient_balance: "Saldo insuficiente para este reembolso. Aguarde novos recebimentos.",
  forbidden: "Você não tem permissão para esta operação.",
};

/** Dados para o painel da cobrança: política, reembolsos e elegibilidade. */
export const getRefundContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx);
    const [pay, refunds, pol] = await Promise.all([
      ctx.supabase.from("payments").select("id, status, gross_amount, net_amount, platform_fee_amount, paid_at, released_at, refunded_amount, anticipation_status, method, provider_payment_id").eq("id", data.paymentId).eq("tenant_id", m.tenant_id).maybeSingle(),
      ctx.supabase.from("refunds").select("id, status, kind, mode, requested_amount, deduction_amount, deduction_reason, refund_amount, wiize_fee_retained, reason, failure_reason, created_at, completed_at").eq("payment_id", data.paymentId).order("created_at", { ascending: false }),
      ctx.supabase.from("refund_policies").select("*").eq("tenant_id", m.tenant_id).maybeSingle(),
    ]);
    const p = pay.data;
    if (!p) throw new Error("Cobrança não encontrada.");
    const policy = pol.data ?? { window_days: 30, allow_partial: true, default_mode: "net", default_deduction_type: "none", default_deduction_value: 0 };
    const deadline = p.paid_at ? new Date(new Date(p.paid_at).getTime() + policy.window_days * 86400e3) : null;
    const active = (refunds.data ?? []).some((r: any) => ["requested", "processing"].includes(r.status));
    let blocked: string | null = null;
    if (p.status !== "paid") blocked = "Só cobranças pagas podem ser reembolsadas.";
    else if (!p.provider_payment_id) blocked = "Cobrança sem registro no processador.";
    else if (deadline && deadline < new Date()) blocked = `O prazo de ${policy.window_days} dias para reembolso terminou.`;
    else if (["pending", "processing", "completed"].includes(p.anticipation_status ?? "")) blocked = "Cobrança antecipada não pode ser reembolsada.";
    else if (active) blocked = "Já existe um reembolso em andamento.";
    const refunded = Number(p.refunded_amount ?? 0);
    return {
      canWrite: FINANCE.includes(m.role),
      payment: { gross: Number(p.gross_amount), net: Number(p.net_amount), fee: Number(p.platform_fee_amount), refunded, method: p.method, paidAt: p.paid_at },
      eligibleNet: Math.max(0, Number(p.net_amount) - refunded),
      eligibleGross: Math.max(0, Number(p.gross_amount) - refunded),
      deadline: deadline?.toISOString() ?? null,
      blocked, policy, refunds: refunds.data ?? [],
    };
  });

export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    paymentId: z.string().uuid(),
    mode: z.enum(["net", "gross"]),
    kind: z.enum(["total", "partial"]),
    amount: z.number().positive().max(1e9).optional(),
    deductionType: z.enum(["none", "fixed", "percent"]),
    deductionValue: z.number().min(0).max(1e9),
    deductionReason: z.string().max(200).optional(),
    reason: z.string().trim().min(3).max(300),
    financialPassword: z.string().min(1).max(200),
    idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { assertTwoFactorIfEnrolled, assertFinancialPassword } = await import("./finance.server");
    await assertTwoFactorIfEnrolled(ctx.claims as never, ctx.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit } = await import("./audit.server");
    const rl = await consumeRateLimit(supabaseAdmin, { scope: "refund", identifier: ctx.userId, maxAttempts: 10, windowSeconds: 3600, blockSeconds: 3600 });
    if (!rl.allowed) throw new Error("Muitas tentativas. Tente novamente mais tarde.");
    await assertFinancialPassword(supabaseAdmin, ctx.userId, data.financialPassword, "refund.request");
    const { data: id, error } = await (supabaseAdmin.rpc as any)("request_refund", {
      _tenant_id: m.tenant_id, _user_id: ctx.userId, _payment_id: data.paymentId, _mode: data.mode, _kind: data.kind,
      _requested_amount: data.amount ?? null, _deduction_type: data.deductionType, _deduction_value: data.deductionValue,
      _deduction_reason: data.deductionReason ?? null, _reason: data.reason, _idempotency_key: data.idempotencyKey,
    });
    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message?.includes(k));
      throw new Error(code ? ERRORS[code] : "Não foi possível solicitar o reembolso.");
    }
    const { sendRefundToProvider } = await import("./refunds.server");
    await sendRefundToProvider(supabaseAdmin, id as string);
    const { data: r } = await (supabaseAdmin.from as any)("refunds").select("status, failure_reason").eq("id", id).single();
    return { id: id as string, status: r?.status as string, failure: r?.failure_reason as string | null };
  });

export const listRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx);
    const { data } = await ctx.supabase.from("refunds")
      .select("id, payment_id, status, original_amount, deduction_amount, refund_amount, reason, created_at, completed_at, payments(description, customers(name))")
      .eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const saveRefundPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    window_days: z.number().int().min(1).max(30), allow_partial: z.boolean(), default_mode: z.enum(["net", "gross"]),
    default_deduction_type: z.enum(["none", "fixed", "percent"]), default_deduction_value: z.number().min(0).max(1e9),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    if (!["owner", "admin"].includes(m.role)) throw new Error("Apenas dono ou administrador pode alterar a política.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("refund_policies").upsert({ tenant_id: m.tenant_id, ...data });
    if (error) throw new Error("Não foi possível salvar a política.");
    await supabaseAdmin.from("audit_logs").insert({ tenant_id: m.tenant_id, user_id: ctx.userId, action: "refund_policy.update", resource: "refund_policy", result: "success", metadata: data as never });
    return { ok: true };
  });
