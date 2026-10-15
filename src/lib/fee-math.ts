/**
 * Fórmulas puras de taxas Wiize Recebe (fonte única de cálculo).
 * Os VALORES das taxas nunca ficam aqui: vêm de payment_fee_settings / provider_cost_settings.
 */
export type FeeRate = { fixed: number; percent: number };

const toCents = (n: number) => Math.round(n * 100);

/** taxa = valor × percentual + fixo × quantidade de cobranças com tarifa fixa */
export function feeFor(amount: number, rate: FeeRate, fixedCount = 1): number {
  const cents = Math.round((toCents(amount) * Math.round(rate.percent * 100)) / 10_000) + toCents(rate.fixed) * fixedCount;
  return cents / 100;
}

/**
 * Gross-up com repasse parcial.
 * total = (serviço + share × fixo × n) / (1 − share × percentual)
 * share = 0..1 (parte da taxa paga pelo cliente final).
 */
export function grossUp(serviceAmount: number, rate: FeeRate, sharePct: number, fixedCount = 1) {
  const share = Math.min(Math.max(sharePct, 0), 100) / 100;
  const p = rate.percent / 100;
  if (share === 0) {
    const fee = feeFor(serviceAmount, rate, fixedCount);
    return { total: serviceAmount, fee, customerPaysFee: 0, providerNet: round2(serviceAmount - fee) };
  }
  let total = Math.ceil(((serviceAmount + share * rate.fixed * fixedCount) / (1 - share * p)) * 100) / 100;
  // Ajuste de centavos: garante que o prestador receba ao menos serviço − (1−share)·taxa.
  for (let i = 0; i < 3; i++) {
    const fee = feeFor(total, rate, fixedCount);
    const target = serviceAmount - (1 - share) * fee;
    if (round2(total - fee) + 0.005 >= target) break;
    total = round2(total + 0.01);
  }
  const fee = feeFor(total, rate, fixedCount);
  return { total, fee, customerPaysFee: round2(total - serviceAmount), providerNet: round2(total - fee) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Quantas tarifas fixas incidem: cartões/débito = 1 venda; boleto/Pix parcelado = 1 por parcela. */
export function fixedFeeCount(method: string | null, installments: number) {
  return method === "credit_card" || method === "debit_card" ? 1 : Math.max(1, installments);
}

export type MixKey = "pix" | "pix_recurring" | "boleto" | "debit_card" | "credit_1" | "credit_2_6" | "credit_7_12" | "credit_13_21";
export const MIX_LABELS: Record<MixKey, string> = {
  pix: "Pix à vista", pix_recurring: "Pix Automático", boleto: "Boleto", debit_card: "Débito",
  credit_1: "Crédito 1x", credit_2_6: "Crédito 2–6x", credit_7_12: "Crédito 7–12x", credit_13_21: "Crédito 13–21x",
};
export function mixKeyFor(method: string | null, installments: number | null, recurring = false): MixKey {
  const n = installments ?? 1;
  if (method === "credit_card") return n <= 1 ? "credit_1" : n <= 6 ? "credit_2_6" : n <= 12 ? "credit_7_12" : "credit_13_21";
  if (method === "debit_card") return "debit_card";
  if (method === "boleto") return "boleto";
  return recurring ? "pix_recurring" : "pix";
}
export const MIX_TIER: Record<MixKey, { method: string; installments: number }> = {
  pix: { method: "pix", installments: 1 }, pix_recurring: { method: "pix_recurring", installments: 1 },
  boleto: { method: "boleto", installments: 1 }, debit_card: { method: "debit_card", installments: 1 },
  credit_1: { method: "credit_card", installments: 1 }, credit_2_6: { method: "credit_card", installments: 2 },
  credit_7_12: { method: "credit_card", installments: 7 }, credit_13_21: { method: "credit_card", installments: 13 },
};

export type RateRow = { payment_method: string; installment_min: number; installment_max: number; fixed: number; percent: number };
export function findRate(rows: RateRow[], method: string, installments: number): FeeRate | null {
  const r = rows.find((x) => x.payment_method === method && x.installment_min <= installments && x.installment_max >= installments);
  return r ? { fixed: r.fixed, percent: r.percent } : null;
}
