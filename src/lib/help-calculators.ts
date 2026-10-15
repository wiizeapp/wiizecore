/**
 * Calculadoras da Central de Ajuda (estimativas). Usa as mesmas fórmulas do sistema:
 * taxas via `fee-math.ts` e prazos via `settlement-rules.ts`. Os valores das taxas vêm sempre da configuração ativa.
 */
import { feeFor, findRate, fixedFeeCount, round2, type RateRow } from "./fee-math";
import { calculateEstimatedAvailability } from "./settlement-rules";

export type HelpMethod = "pix" | "pix_recurring" | "boleto" | "debit_card" | "credit_card";

export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null;
}

export function maxInstallments(rows: RateRow[], method: HelpMethod) {
  const r = rows.filter((x) => x.payment_method === method);
  return r.length ? Math.max(...r.map((x) => x.installment_max)) : 1;
}

/** Taxa estimada de uma venda: valor × % + fixo × (nº de tarifas fixas da modalidade). */
export function estimateSaleFee(rows: RateRow[], method: HelpMethod, gross: number, installments: number) {
  const n = method === "credit_card" || method === "boleto" ? Math.max(1, installments) : 1;
  const rate = findRate(rows, method, n);
  if (!rate) return null;
  const fixedCount = fixedFeeCount(method, n);
  const fee = feeFor(gross, rate, fixedCount);
  return {
    gross, installments: n, percent: rate.percent, fixed: rate.fixed, fixedCount,
    percentPart: round2(fee - rate.fixed * fixedCount), fixedPart: round2(rate.fixed * fixedCount),
    fee, net: round2(gross - fee), effectivePct: gross > 0 ? round2((fee / gross) * 100) : 0,
  };
}

/** Divide em parcelas de centavos, a sobra vai para a primeira (padrão de cobrança parcelada). */
export function splitInstallments(total: number, n: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? cents - base * n : 0)) / 100);
}

const daysBetween = (a: string, b: string) => Math.max(0, Math.ceil((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000));

/**
 * Antecipação estimada por recebível: taxa mensal proporcional aos dias que faltam
 * (mesma metodologia comercial da Wiize Recebe: valor × taxa mensal × dias / 30).
 */
export function estimateAnticipation(input: {
  rows: RateRow[]; method: "boleto" | "credit_card"; gross: number; installments: number;
  paymentDate: string; anticipationDate: string; monthlyRate: number;
}) {
  const sale = estimateSaleFee(input.rows, input.method, input.gross, input.installments);
  if (!sale) return null;
  const parts = splitInstallments(sale.net, sale.installments);
  const receivables = parts.map((net, i) => {
    const { estimated_available_at: due } = calculateEstimatedAvailability({
      paymentMethod: input.method, paymentDate: `${input.paymentDate}T12:00:00Z`, confirmedAt: `${input.paymentDate}T12:00:00Z`,
      installmentNumber: i + 1, installmentCount: sale.installments,
    });
    const days = daysBetween(input.anticipationDate, due);
    const feeCents = Math.round((Math.round(net * 100) * Math.round(input.monthlyRate * 100) * days) / (10_000 * 30));
    return { number: i + 1, due, days, net, fee: feeCents / 100, anticipated: round2(net - feeCents / 100) };
  });
  const anticipationFee = round2(receivables.reduce((s, r) => s + r.fee, 0));
  const finalNet = round2(sale.net - anticipationFee);
  return {
    sale, receivables, anticipationFee, finalNet,
    totalCost: round2(sale.fee + anticipationFee),
    effectivePct: input.gross > 0 ? round2(((sale.fee + anticipationFee) / input.gross) * 100) : 0,
  };
}
