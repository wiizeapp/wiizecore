/**
 * Estimativa do custo do Asaas para UMA cobrança à vista, a partir das taxas da própria conta
 * (GET /myAccount/fees). Se a API informar um preço promocional ainda válido (Pix/boleto), usa esse
 * preço e a economia fica com a WiizePay. A promoção só vale se ainda estiver ativa com folga
 * (Pix: 2 dias, boleto: 10 dias); se o Asaas acabar cobrando o preço cheio, a rotina de devolução
 * cobre a diferença — a empresa nunca paga mais do que a taxa WiizePay exibida.
 * Retorna null quando não dá para estimar com segurança (aí vale o fluxo antigo, com devolução).
 */
export type AsaasAccountFees = {
  payment?: {
    bankSlip?: { defaultValue?: number | null; discountValue?: number | null; expirationDate?: string | null };
    creditCard?: { operationValue?: number | null; oneInstallmentPercentage?: number | null };
    debitCard?: { operationValue?: number | null; defaultPercentage?: number | null };
    pix?: { type?: string | null; fixedFeeValue?: number | null; percentageFee?: number | null; minimumFeeValue?: number | null; maximumFeeValue?: number | null; fixedFeeValueWithDiscount?: number | null; discountExpiration?: string | null };
  };
};

const toCents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null);
// percentual com até 4 casas → frações de centavo inteiras para evitar float
const pctOf = (amountCents: number, pct: unknown) => {
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0) return null;
  return Math.ceil((amountCents * Math.round(pct * 10000)) / 1_000_000);
};

const DAY = 86_400_000;
/** Preço promocional só conta se for menor que o cheio e ainda valer com folga. */
function promoCents(full: number | null, promo: unknown, expiration: unknown, marginDays: number, now: number) {
  const pc = toCents(promo);
  if (full == null || pc == null || pc >= full || typeof expiration !== "string") return full;
  const end = Date.parse(expiration.length <= 10 ? `${expiration}T23:59:59-03:00` : expiration);
  return Number.isFinite(end) && end - now >= marginDays * DAY ? pc : full;
}

export function estimateProviderFeeCents(fees: AsaasAccountFees | null | undefined, method: string | null, amountCents: number, now: number = Date.now()): number | null {
  const p = fees?.payment;
  if (!p || !method || amountCents <= 0) return null;
  let cents: number | null = null;
  if (method === "boleto") cents = promoCents(toCents(p.bankSlip?.defaultValue), p.bankSlip?.discountValue, p.bankSlip?.expirationDate, 10, now);
  else if (method === "pix") {
    const pix = p.pix;
    if (pix?.type === "FIXED" || (pix?.percentageFee == null && pix?.fixedFeeValue != null)) cents = promoCents(toCents(pix?.fixedFeeValue), pix?.fixedFeeValueWithDiscount, pix?.discountExpiration, 2, now);
    else {
      let v = pctOf(amountCents, pix?.percentageFee);
      const min = toCents(pix?.minimumFeeValue), max = toCents(pix?.maximumFeeValue);
      if (v != null && min != null) v = Math.max(v, min);
      if (v != null && max != null) v = Math.min(v, max);
      cents = v;
    }
  } else if (method === "credit_card" || method === "debit_card") {
    const c = method === "credit_card" ? p.creditCard : p.debitCard;
    const pct = method === "credit_card" ? p.creditCard?.oneInstallmentPercentage : p.debitCard?.defaultPercentage;
    const fixed = toCents(c?.operationValue), v = pctOf(amountCents, pct);
    cents = fixed != null && v != null ? fixed + v : null;
  }
  return cents != null && cents < amountCents ? cents : null;
}

/** Quanto do custo do Asaas sai da taxa WiizePay já na divisão (nunca mais que a própria taxa). */
export function coveredProviderFeeCents(totalFeeCents: number, estimateCents: number | null) {
  if (estimateCents == null || totalFeeCents <= 0) return 0;
  return Math.min(totalFeeCents, estimateCents);
}

/** Devolução após o pagamento: só a parte do custo real que a divisão não cobriu. */
export function reimbursementCents(actualProviderFeeCents: number, coveredCents: number) {
  return Math.max(0, actualProviderFeeCents - Math.max(0, coveredCents));
}
