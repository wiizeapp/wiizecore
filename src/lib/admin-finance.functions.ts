import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe WiizePay.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const c = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const r = (cents: number) => cents / 100;

type Totals = {
  volume: number; count: number; fees: number; providerCost: number;
  anticipationRevenue: number; anticipationCost: number; withdrawalRevenue: number; invoiceRevenue: number; invoiceCost: number;
  refunds: number; refundsRetained: number; withdrawn: number; customers: number;
};
const empty = (): Totals => ({ volume: 0, count: 0, fees: 0, providerCost: 0, anticipationRevenue: 0, anticipationCost: 0, withdrawalRevenue: 0, invoiceRevenue: 0, invoiceCost: 0, refunds: 0, refundsRetained: 0, withdrawn: 0, customers: 0 });

/**
 * Consolida os números financeiros do Admin (período atual e anterior).
 * Tudo em centavos; somente leitura — nunca altera saldo.
 * Receita bruta = taxas cobradas (cobranças + antecipação + saques + notas).
 * Custos = taxas pagas ao provedor. Receita líquida = bruta − custos.
 */
export const getAdminFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { start: string; end: string; prevStart: string; granularity: "hour" | "day" }) =>
    z.object({ start: z.string().datetime(), end: z.string().datetime(), prevStart: z.string().datetime(), granularity: z.enum(["hour", "day"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { start, end, prevStart } = data;
    const [pays, antic, wds, invs, refs, tenants, open, queue] = await Promise.all([
      admin.from("payments").select("id, tenant_id, customer_id, method, status, gross_amount, platform_fee_amount, provider_fee_amount, net_amount, paid_at, available_on, settlement_status, installment_count, description").not("paid_at", "is", null).gte("paid_at", prevStart).lt("paid_at", end).order("paid_at", { ascending: false }).limit(20000),
      admin.from("anticipation_requests").select("wiize_fee_amount, provider_fee_amount, settled_at").eq("status", "completed").gte("settled_at", prevStart).lt("settled_at", end),
      admin.from("withdrawals").select("fee_amount, net_amount, completed_at").eq("status", "completed").gte("completed_at", prevStart).lt("completed_at", end),
      admin.from("invoices").select("wiize_fee_amount, provider_fee_amount, fee_charged_at").not("fee_charged_at", "is", null).gte("fee_charged_at", prevStart).lt("fee_charged_at", end),
      admin.from("refunds").select("id, tenant_id, payment_id, refund_amount, wiize_fee_retained, status, completed_at, reason").eq("status", "completed").gte("completed_at", prevStart).lt("completed_at", end),
      admin.from("tenants").select("id, name"),
      admin.from("payments").select("id, tenant_id, method, status, gross_amount, platform_fee_amount, net_amount, due_on").in("status", ["created", "awaiting_payment", "processing", "overdue", "in_analysis"]).order("due_on").limit(5000),
      admin.from("withdrawals").select("id, tenant_id, net_amount, status, requested_at").in("status", ["requested", "in_analysis", "processing"]),
    ]);
    const names = new Map((tenants.data ?? []).map((t) => [t.id, t.name]));
    const cur = empty(), prev = empty();
    const pick = (iso: string | null) => (iso && iso >= start ? cur : prev);
    const custCur = new Set<string>(), custPrev = new Set<string>();
    const byMethod: Record<string, { volume: number; count: number; fees: number; cost: number }> = {};
    const step = data.granularity === "hour" ? 3_600_000 : 86_400_000;
    const s0 = new Date(start).getTime(), p0 = new Date(prevStart).getTime();
    const nB = Math.max(1, Math.ceil((new Date(end).getTime() - s0) / step));
    const series = Array.from({ length: nB }, (_, i) => ({ t: s0 + i * step, volume: 0, fees: 0, cost: 0, net: 0, prevVolume: 0, prevFees: 0, prevCost: 0, prevNet: 0, withdrawn: 0, prevWithdrawn: 0 }));
    const bucket = (iso: string) => {
      const t = new Date(iso).getTime();
      const isCur = t >= s0;
      const i = Math.floor((t - (isCur ? s0 : p0)) / step);
      return { b: series[i], isCur };
    };
    const transactions: Array<{ id: string; date: string; tenant: string; type: string; method: string; amount: number; fee: number; cost: number; revenue: number; status: string; settlement: string | null; settlementStatus: string; description: string | null }> = [];
    for (const p of pays.data ?? []) {
      const g = c(p.gross_amount), f = c(p.platform_fee_amount), k = c(p.provider_fee_amount);
      const T = pick(p.paid_at);
      T.volume += g; T.count += 1; T.fees += f; T.providerCost += k;
      if (p.customer_id) (T === cur ? custCur : custPrev).add(p.tenant_id);
      const { b, isCur } = bucket(p.paid_at!);
      if (b) { if (isCur) { b.volume += g; b.fees += f; b.cost += k; } else { b.prevVolume += g; b.prevFees += f; b.prevCost += k; } }
      if (T === cur) {
        const m = (p.installment_count ?? 1) > 1 && p.method === "credit_card" ? "credit_card_installment" : p.method ?? "outro";
        byMethod[m] ??= { volume: 0, count: 0, fees: 0, cost: 0 };
        byMethod[m].volume += g; byMethod[m].count += 1; byMethod[m].fees += f; byMethod[m].cost += k;
        transactions.push({
          id: p.id, date: p.paid_at!, tenant: names.get(p.tenant_id) ?? "—", type: "Recebimento", method: m,
          amount: r(g), fee: r(f), cost: r(k), revenue: r(f - k), status: p.status, settlement: p.available_on, settlementStatus: p.settlement_status, description: p.description,
        });
      }
    }
    for (const a of antic.data ?? []) {
      const T = pick(a.settled_at); T.anticipationRevenue += c(a.wiize_fee_amount); T.anticipationCost += c(a.provider_fee_amount);
      const { b, isCur } = bucket(a.settled_at!);
      if (b) { if (isCur) { b.fees += c(a.wiize_fee_amount); b.cost += c(a.provider_fee_amount); } else { b.prevFees += c(a.wiize_fee_amount); b.prevCost += c(a.provider_fee_amount); } }
    }
    for (const w of wds.data ?? []) {
      const T = pick(w.completed_at); T.withdrawalRevenue += c(w.fee_amount); T.withdrawn += c(w.net_amount);
      const { b, isCur } = bucket(w.completed_at!);
      if (b) { if (isCur) { b.fees += c(w.fee_amount); b.withdrawn += c(w.net_amount); } else { b.prevFees += c(w.fee_amount); b.prevWithdrawn += c(w.net_amount); } }
    }
    for (const i of invs.data ?? []) {
      const T = pick(i.fee_charged_at); T.invoiceRevenue += c(i.wiize_fee_amount); T.invoiceCost += c(i.provider_fee_amount);
      const { b, isCur } = bucket(i.fee_charged_at!);
      if (b) { if (isCur) { b.fees += c(i.wiize_fee_amount); b.cost += c(i.provider_fee_amount); } else { b.prevFees += c(i.wiize_fee_amount); b.prevCost += c(i.provider_fee_amount); } }
    }
    const refundList: Array<{ id: string; tenant: string; amount: number; retained: number; date: string; reason: string }> = [];
    for (const x of refs.data ?? []) {
      const T = pick(x.completed_at); T.refunds += c(x.refund_amount); T.refundsRetained += c(x.wiize_fee_retained);
      if (T === cur) refundList.push({ id: x.id, tenant: names.get(x.tenant_id) ?? "—", amount: Number(x.refund_amount), retained: Number(x.wiize_fee_retained), date: x.completed_at!, reason: x.reason });
    }
    cur.customers = custCur.size; prev.customers = custPrev.size;
    for (const b of series) { b.net = b.fees - b.cost; b.prevNet = b.prevFees - b.prevCost; }

    const summarize = (t: Totals) => {
      const gross = t.fees + t.anticipationRevenue + t.withdrawalRevenue + t.invoiceRevenue;
      const costs = t.providerCost + t.anticipationCost + t.invoiceCost;
      return {
        volume: r(t.volume), count: t.count, customers: t.customers, withdrawn: r(t.withdrawn),
        chargeFees: r(t.fees), anticipationRevenue: r(t.anticipationRevenue), withdrawalRevenue: r(t.withdrawalRevenue), invoiceRevenue: r(t.invoiceRevenue),
        providerCost: r(t.providerCost), anticipationCost: r(t.anticipationCost), invoiceCost: r(t.invoiceCost),
        refunds: r(t.refunds), refundsRetained: r(t.refundsRetained),
        grossRevenue: r(gross), costs: r(costs), netRevenue: r(gross - costs),
        margin: gross > 0 ? ((gross - costs) / gross) * 100 : null,
        avgTicket: t.count ? r(Math.round(t.volume / t.count)) : 0,
        avgFeePct: t.volume ? (t.fees / t.volume) * 100 : null,
        avgCostPerTx: t.count ? r(Math.round(t.providerCost / t.count)) : 0,
      };
    };

    const today = new Date().toISOString().slice(0, 10);
    let receivable = 0, overdue = 0, processing = 0;
    const receivables = (open.data ?? []).map((p) => {
      const g = c(p.gross_amount);
      const late = p.status === "overdue" || (p.due_on < today && p.status !== "processing" && p.status !== "in_analysis");
      const bucketName = p.status === "processing" || p.status === "in_analysis" ? "processing" : late ? "overdue" : "open";
      if (bucketName === "processing") processing += g; else if (late) overdue += g; else receivable += g;
      return {
        id: p.id, tenant: names.get(p.tenant_id) ?? "—", method: p.method, amount: r(g), fee: Number(p.platform_fee_amount), net: Number(p.net_amount),
        due: p.due_on, bucket: bucketName, days: Math.round((new Date(p.due_on).getTime() - new Date(today).getTime()) / 86_400_000),
      };
    });
    const payable = (queue.data ?? []).reduce((s, w) => s + c(w.net_amount), 0);

    return {
      current: summarize(cur), previous: summarize(prev),
      byMethod: Object.entries(byMethod).map(([method, v]) => ({ method, volume: r(v.volume), count: v.count, fees: r(v.fees), cost: r(v.cost), net: r(v.fees - v.cost) })).sort((a, b) => b.volume - a.volume),
      extras: [
        { key: "anticipation", revenue: r(cur.anticipationRevenue), cost: r(cur.anticipationCost) },
        { key: "withdrawal", revenue: r(cur.withdrawalRevenue), cost: 0 },
        { key: "invoice", revenue: r(cur.invoiceRevenue), cost: r(cur.invoiceCost) },
      ],
      series: series.map((b) => ({ t: b.t, volume: r(b.volume), fees: r(b.fees), cost: r(b.cost), net: r(b.net), withdrawn: r(b.withdrawn), prevVolume: r(b.prevVolume), prevFees: r(b.prevFees), prevCost: r(b.prevCost), prevNet: r(b.prevNet), prevWithdrawn: r(b.prevWithdrawn) })),
      position: { receivable: r(receivable), overdue: r(overdue), processing: r(processing), payable: r(payable), payableCount: queue.data?.length ?? 0 },
      transactions, receivables, refunds: refundList,
    };
  });
