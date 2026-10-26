import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

async function requireAdmin(context: Ctx) {
  await (await import("./admin-session.server")).assertAdminPage(context);
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe Wiize Core.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const runAiReconciliation = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) =>
    z.object({
      tenantId: z.string().uuid(),
      periodStart: date,
      periodEnd: date,
      statementName: z.string().max(200).nullable(),
      statement: z.string().min(10, "Envie o extrato.").max(200_000, "Extrato muito grande (máx. 200 mil caracteres)."),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    if (data.periodEnd < data.periodStart) throw new Error("Período inválido.");
    const from = `${data.periodStart}T00:00:00-03:00`;
    const to = `${data.periodEnd}T23:59:59-03:00`;
    const [{ data: tenant }, { data: payments }, { data: txs }, { data: withdrawals }] = await Promise.all([
      admin.from("tenants").select("id, name").eq("id", data.tenantId).maybeSingle(),
      admin.from("payments")
        .select("id, provider_payment_id, description, status, method, gross_amount, platform_fee_amount, provider_fee_amount, net_amount, gross_margin_amount, due_on, paid_at, provider_fee_reimbursement_id, provider_fee_reimbursed_at")
        .eq("tenant_id", data.tenantId).gte("created_at", from).lte("created_at", to).limit(500),
      admin.from("transactions").select("kind, description, amount, occurred_at, payment_id").eq("tenant_id", data.tenantId).gte("occurred_at", from).lte("occurred_at", to).limit(1000),
      admin.from("withdrawals").select("amount, fee_amount, net_amount, status, provider_transfer_id, requested_at, completed_at").eq("tenant_id", data.tenantId).gte("requested_at", from).lte("requested_at", to),
    ]);
    if (!tenant) throw new Error("Empresa não encontrada.");
    const { explainDivergences } = await import("./reconciliation-ai.server");
    const report = await explainDivergences(
      { empresa: tenant.name, periodo: [data.periodStart, data.periodEnd], cobrancas: payments ?? [], lancamentos: txs ?? [], saques: withdrawals ?? [] },
      data.statement,
    );
    const { data: row } = await admin.from("reconciliation_reports").insert({
      tenant_id: data.tenantId, requested_by: context.userId, period_start: data.periodStart, period_end: data.periodEnd,
      statement_name: data.statementName, summary: report.summary, total_difference: Math.round(report.total_difference * 100) / 100, report,
    }).select("id, created_at").single();
    await logAudit(admin, { tenantId: data.tenantId, userId: context.userId, action: "reconciliation.ai_report", resource: "reconciliation_reports", resourceId: row?.id ?? null });
    return { id: row?.id, createdAt: row?.created_at, ...report };
  });

export const listAiReconciliations = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({ tenantId: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    let q = admin.from("reconciliation_reports").select("id, tenant_id, period_start, period_end, statement_name, summary, total_difference, report, created_at, tenants(name)").order("created_at", { ascending: false }).limit(30);
    if (data.tenantId) q = q.eq("tenant_id", data.tenantId);
    const { data: rows } = await q;
    return (rows ?? []).map((r: any) => ({ ...r, company: r.tenants?.name ?? "—", total_difference: Number(r.total_difference ?? 0) }));
  });
