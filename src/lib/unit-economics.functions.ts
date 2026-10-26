import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { MIX_LABELS, mixKeyFor, type MixKey } from "./fee-math";
import { buildUnitEconomics, type UePayment } from "./unit-economics";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

/** platform_admin + 2FA obrigatórios. Somente leitura, exceto a edição de taxas/custos (auditada). */
async function requireAdmin(context: Ctx) {
  await (await import("./admin-session.server")).assertAdminPage(context);
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe Wiize Core.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getUnitEconomics = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { start: string; end: string }) => z.object({ start: z.string().datetime(), end: z.string().datetime() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const [pays, invs, tenants, dupHooks, feeCfg, created] = await Promise.all([
      admin.from("payments").select("id, tenant_id, customer_id, method, status, gross_amount, service_amount, platform_fee_amount, provider_fee_amount, estimated_provider_cost, fee_configuration_id, fee_fixed_amount, fee_percentage, installment_count, subscription_id, provider_payment_id, paid_at, description")
        .not("paid_at", "is", null).gte("paid_at", data.start).lt("paid_at", data.end).limit(50000),
      admin.from("invoices").select("tenant_id, fee_amount, provider_fee_amount, fee_charged_at").not("fee_charged_at", "is", null).gte("fee_charged_at", data.start).lt("fee_charged_at", data.end).limit(50000),
      admin.from("tenants").select("id, name"),
      admin.from("webhook_events").select("external_event_id").gte("received_at", data.start).lt("received_at", data.end).limit(50000),
      admin.from("payment_fee_settings").select("id, fixed_fee, percentage_fee"),
      admin.from("payments").select("id, tenant_id, method, customer_id, status, provider_payment_id, gross_amount, created_at").gte("created_at", data.start).lt("created_at", data.end).limit(50000),
    ]);
    if (pays.error || invs.error || created.error) throw new Error("Não foi possível carregar os indicadores agora.");
    const names = new Map((tenants.data ?? []).map((t) => [t.id, t.name as string]));
    const payments: UePayment[] = (pays.data ?? []).map((p) => ({
      id: p.id, tenantId: p.tenant_id, status: p.status, method: p.method, installments: p.installment_count ?? 1,
      recurring: Boolean(p.subscription_id), gross: Number(p.gross_amount), fee: Number(p.platform_fee_amount),
      cost: Number(p.provider_fee_amount) > 0 ? Number(p.provider_fee_amount) : p.estimated_provider_cost != null ? Number(p.estimated_provider_cost) : null,
      paidAt: p.paid_at!,
    }));
    const result = buildUnitEconomics(payments, (invs.data ?? []).map((i) => ({ tenantId: i.tenant_id, fee: Number(i.fee_amount ?? 0), cost: Number(i.provider_fee_amount ?? 0) })));

    // ----- Auditoria financeira (somente alertas; nunca corrige valores) -----
    const alerts: { kind: string; label: string; count: number; sample: string[] }[] = [];
    const push = (kind: string, label: string, ids: string[]) => { if (ids.length) alerts.push({ kind, label, count: ids.length, sample: ids.slice(0, 5) }); };
    const cfg = new Map((feeCfg.data ?? []).map((f) => [f.id, f]));
    const rows = pays.data ?? [];
    push("fee_mismatch", "Taxa registrada diferente da tabela vigente na criação", rows.filter((p) => {
      const c = p.fee_configuration_id ? cfg.get(p.fee_configuration_id) : null;
      if (!c || (p.installment_count ?? 1) > 1) return false;
      const expected = Math.round(Number(p.gross_amount) * Number(c.percentage_fee)) / 100 + Number(c.fixed_fee);
      return Math.abs(expected - Number(p.platform_fee_amount)) > 0.02;
    }).map((p) => p.id));
    push("negative_margin", "Margem negativa (custo maior que a taxa)", payments.filter((p) => p.cost != null && p.cost > p.fee).map((p) => p.id));
    const seen = new Map<string, number>();
    for (const p of created.data ?? []) if (p.provider_payment_id) seen.set(p.provider_payment_id, (seen.get(p.provider_payment_id) ?? 0) + 1);
    push("duplicate_payment", "Pagamento duplicado no provedor", [...seen].filter(([, n]) => n > 1).map(([k]) => k));
    const hooks = new Map<string, number>();
    for (const h of dupHooks.data ?? []) hooks.set(h.external_event_id, (hooks.get(h.external_event_id) ?? 0) + 1);
    push("duplicate_webhook", "Aviso do provedor recebido em duplicidade", [...hooks].filter(([, n]) => n > 1).map(([k]) => k));
    push("no_customer", "Cobrança sem cliente", (created.data ?? []).filter((p) => !p.customer_id).map((p) => p.id));
    push("no_method", "Pagamento sem forma de pagamento", rows.filter((p) => !p.method).map((p) => p.id));
    push("no_provider", "Cobrança paga sem registro no provedor", rows.filter((p) => !p.provider_payment_id).map((p) => p.id));
    push("no_cost", "Custo do provedor não configurado", payments.filter((p) => p.status === "paid" && p.cost == null).map((p) => p.id));
    push("status", "Pago com status inconsistente", rows.filter((p) => !["paid", "refunded"].includes(p.status)).map((p) => p.id));

    const rowsOut = payments.filter((p) => p.status === "paid").map((p) => ({
      data: p.paidAt, cliente: names.get(p.tenantId) ?? "—", metodo: MIX_LABELS[mixKeyFor(p.method, p.installments, p.recurring)],
      status: p.status, valor: p.gross, taxa: p.fee, custo: p.cost, margem: p.cost == null ? null : Math.round((p.fee - p.cost) * 100) / 100,
    }));
    return {
      ...result,
      clients: result.clients.map((c) => ({ ...c, name: names.get(c.tenantId) ?? "—" })),
      alerts,
      rows: rowsOut,
      saasAvailable: false,
    };
  });

/* ---------------- Configuração de taxas e custos ---------------- */

const methodEnum = z.enum(["pix", "pix_recurring", "boleto", "debit_card", "credit_card"]);

export const getFeeConfiguration = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const now = new Date().toISOString();
    const [fees, costs, log] = await Promise.all([
      admin.from("payment_fee_settings").select("id, payment_method, installment_min, installment_max, fixed_fee, percentage_fee, version").eq("active", true).lte("effective_from", now).order("payment_method").order("installment_min"),
      admin.from("provider_cost_settings").select("id, provider, payment_method, installment_min, installment_max, fixed_cost, percentage_cost, effective_from").eq("active", true).order("payment_method").order("installment_min"),
      admin.from("fee_change_log").select("id, kind, payment_method, installment_min, installment_max, previous, next, reason, changed_by, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      fees: (fees.data ?? []).map((f) => ({ ...f, fixed: Number(f.fixed_fee), percent: Number(f.percentage_fee) })),
      costs: (costs.data ?? []).map((c) => ({ ...c, fixed: Number(c.fixed_cost), percent: Number(c.percentage_cost) })),
      log: log.data ?? [],
    };
  });

const rateInput = z.object({
  kind: z.enum(["commercial_fee", "provider_cost"]),
  paymentMethod: methodEnum,
  installmentMin: z.number().int().min(1).max(21),
  installmentMax: z.number().int().min(1).max(21),
  fixed: z.number().min(0).max(1000),
  percent: z.number().min(0).max(100),
  reason: z.string().trim().min(3).max(300),
}).refine((v) => v.installmentMax >= v.installmentMin, "Faixa de parcelas inválida.");

/** Nova versão de taxa/custo: encerra a anterior (não altera transações já criadas) e registra histórico. */
export const saveRate = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => rateInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const now = new Date().toISOString();
    const userId = (context as Ctx).userId;
    const range = { payment_method: data.paymentMethod, installment_min: data.installmentMin, installment_max: data.installmentMax };
    let previous: { fixed: number; percent: number; version?: number } | null = null;
    if (data.kind === "commercial_fee") {
      const { data: cur } = await admin.from("payment_fee_settings").select("id, fixed_fee, percentage_fee, version").match(range).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
      const { data: maxV } = await admin.from("payment_fee_settings").select("version").match(range).order("version", { ascending: false }).limit(1).maybeSingle();
      if (cur) { previous = { fixed: Number(cur.fixed_fee), percent: Number(cur.percentage_fee), version: cur.version }; await admin.from("payment_fee_settings").update({ active: false, effective_until: now }).eq("id", cur.id); }
      const { error } = await admin.from("payment_fee_settings").insert({ ...range, fixed_fee: data.fixed, percentage_fee: data.percent, version: (maxV?.version ?? 0) + 1, effective_from: now, created_by: userId });
      if (error) throw new Error("Não foi possível salvar a taxa. Verifique se a faixa não se sobrepõe a outra.");
    } else {
      const { data: cur } = await admin.from("provider_cost_settings").select("id, fixed_cost, percentage_cost").match(range).eq("active", true).limit(1).maybeSingle();
      if (cur) { previous = { fixed: Number(cur.fixed_cost), percent: Number(cur.percentage_cost) }; await admin.from("provider_cost_settings").update({ active: false, effective_until: now }).eq("id", cur.id); }
      const { error } = await admin.from("provider_cost_settings").insert({ ...range, provider: "asaas", fixed_cost: data.fixed, percentage_cost: data.percent, effective_from: now, created_by: userId });
      if (error) throw new Error("Não foi possível salvar o custo.");
    }
    await admin.from("fee_change_log").insert({ kind: data.kind, ...range, previous, next: { fixed: data.fixed, percent: data.percent }, reason: data.reason, changed_by: userId });
    await admin.from("audit_logs").insert({ user_id: userId, action: `${data.kind}.update`, resource: data.kind, result: "success", metadata: { ...range, previous, next: { fixed: data.fixed, percent: data.percent }, reason: data.reason } });
    return { ok: true };
  });

export type { MixKey };
