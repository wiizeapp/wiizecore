/** Encargos por atraso — regras puras, usadas somente no servidor para o valor final. */
export type LateChargeInput = {
  amount: number;
  finePercent: number;
  /** Juros ao mês, proporcionais por dia (base 30). */
  interestPercentMonthly: number;
  dueOn: string;
  today: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function daysLate(dueOn: string, today: string) {
  const d = Date.parse(`${dueOn}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((t - d) / 86_400_000));
}

export function computeLateCharges(i: LateChargeInput) {
  const days = daysLate(i.dueOn, i.today);
  const base = r2(Math.max(0, i.amount));
  if (days <= 0) return { days: 0, base, fine: 0, interest: 0, total: base };
  const fine = r2(base * Math.max(0, i.finePercent) / 100);
  const interest = r2(base * Math.max(0, i.interestPercentMonthly) / 100 / 30 * days);
  return { days, base, fine, interest, total: r2(base + fine + interest) };
}

export function todaySaoPaulo(now = Date.now()) {
  return new Date(now - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Dias sem pagamento após o vencimento para a primeira cobrança ser cancelada sozinha. */
export const FIRST_CHARGE_AUTO_CANCEL_DAYS = 30;

/** A primeira cobrança de um cliente é cancelada automaticamente após 30 dias de atraso. */
export function shouldAutoCancelFirstCharge(dueOn: string, today: string, isFirstCharge: boolean) {
  return isFirstCharge && daysLate(dueOn, today) >= FIRST_CHARGE_AUTO_CANCEL_DAYS;
}
