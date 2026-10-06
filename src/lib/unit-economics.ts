/**
 * Agregação de Unit Economics (pura, testável). Tudo em centavos internamente.
 * TPV = soma do valor bruto de pagamentos com status "paid" (estornados, cancelados e não pagos ficam fora).
 * Receita = taxas cobradas pela WiizePay. Custo = tarifa real do provedor (ou estimativa configurada).
 */
import { MIX_LABELS, mixKeyFor, type MixKey } from "./fee-math";

export type UePayment = { id: string; tenantId: string; status: string; method: string | null; installments: number; recurring: boolean; gross: number; fee: number; cost: number | null; paidAt: string };
export type UeInvoice = { tenantId: string; fee: number; cost: number };

const c = (n: number) => Math.round(n * 100);
const r = (n: number) => n / 100;

type Acc = { tpv: number; count: number; revenue: number; cost: number; costKnown: number; uncosted: number };
const acc = (): Acc => ({ tpv: 0, count: 0, revenue: 0, cost: 0, costKnown: 0, uncosted: 0 });
function add(a: Acc, p: UePayment) {
  a.tpv += c(p.gross); a.count += 1; a.revenue += c(p.fee);
  if (p.cost == null) a.uncosted += 1; else { a.cost += c(p.cost); a.costKnown += c(p.fee); }
}
function out(a: Acc, totalTpv: number) {
  const margin = a.revenue - a.cost;
  return {
    tpv: r(a.tpv), count: a.count, revenue: r(a.revenue), cost: r(a.cost), margin: r(margin),
    marginPct: a.tpv ? (margin / a.tpv) * 100 : 0,
    marginPer1000: a.tpv ? (margin / a.tpv) * 1000 : 0,
    ticket: a.count ? r(a.tpv) / a.count : 0,
    shareOfTpv: totalTpv ? (a.tpv / totalTpv) * 100 : 0,
    uncosted: a.uncosted,
  };
}

export function buildUnitEconomics(payments: UePayment[], invoices: UeInvoice[]) {
  const paid = payments.filter((p) => p.status === "paid");
  const total = acc();
  const byMix = new Map<MixKey, Acc>();
  const byClient = new Map<string, Acc & { nf: number; nfRevenue: number; nfCost: number }>();
  for (const p of paid) {
    add(total, p);
    const k = mixKeyFor(p.method, p.installments, p.recurring);
    if (!byMix.has(k)) byMix.set(k, acc());
    add(byMix.get(k)!, p);
    if (!byClient.has(p.tenantId)) byClient.set(p.tenantId, { ...acc(), nf: 0, nfRevenue: 0, nfCost: 0 });
    add(byClient.get(p.tenantId)!, p);
  }
  let nfRevenue = 0, nfCost = 0;
  for (const i of invoices) {
    nfRevenue += c(i.fee); nfCost += c(i.cost);
    if (!byClient.has(i.tenantId)) byClient.set(i.tenantId, { ...acc(), nf: 0, nfRevenue: 0, nfCost: 0 });
    const cl = byClient.get(i.tenantId)!; cl.nf += 1; cl.nfRevenue += c(i.fee); cl.nfCost += c(i.cost);
  }
  const summary = out(total, total.tpv);
  const clients = [...byClient].map(([tenantId, a]) => {
    const base = out(a, total.tpv);
    const ecoRevenue = a.revenue + a.nfRevenue;
    const ecoMargin = a.revenue - a.cost + (a.nfRevenue - a.nfCost);
    return { tenantId, ...base, invoices: a.nf, invoiceRevenue: r(a.nfRevenue), saasRevenue: null as number | null, ecosystemRevenue: r(ecoRevenue), ecosystemMargin: r(ecoMargin) };
  });
  const activeClients = clients.filter((x) => x.count > 0).length;
  return {
    summary: {
      ...summary,
      activeClients,
      revenuePerClient: activeClients ? summary.revenue / activeClients : 0,
      tpvPerClient: activeClients ? summary.tpv / activeClients : 0,
      marginPerClient: activeClients ? summary.margin / activeClients : 0,
      invoiceRevenue: r(nfRevenue), invoiceCost: r(nfCost),
    },
    methods: (Object.keys(MIX_LABELS) as MixKey[]).map((k) => ({ key: k, label: MIX_LABELS[k], ...out(byMix.get(k) ?? acc(), total.tpv) })),
    clients,
  };
}

/** Simulação — nunca misturada com dados reais. */
export function simulate(tpv: number, mix: Record<MixKey, number>, rates: Record<MixKey, { fee: { fixed: number; percent: number } | null; cost: { fixed: number; percent: number } | null }>, ticket: number) {
  const lines = (Object.keys(MIX_LABELS) as MixKey[]).map((k) => {
    const volume = (tpv * (mix[k] ?? 0)) / 100;
    const tx = ticket > 0 ? volume / ticket : 0;
    const fee = rates[k].fee, cost = rates[k].cost;
    const revenue = fee ? (volume * fee.percent) / 100 + tx * fee.fixed : 0;
    const costV = cost ? (volume * cost.percent) / 100 + tx * cost.fixed : null;
    return { key: k, label: MIX_LABELS[k], volume, tx, revenue, cost: costV, margin: costV == null ? null : revenue - costV };
  });
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const costKnown = lines.every((l) => l.cost != null || l.volume === 0);
  const cost = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  const margin = revenue - cost;
  return { lines, revenue, cost, costKnown, margin, marginPct: tpv ? (margin / tpv) * 100 : 0, annualRevenue: revenue * 12, annualMargin: margin * 12, transactions: lines.reduce((s, l) => s + l.tx, 0) };
}
