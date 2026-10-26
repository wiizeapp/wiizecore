import Decimal from "decimal.js";
import { z } from "zod";

export const pldRuleCode = z.enum(["volume_growth", "small_payments", "rapid_withdrawal", "refund_frequency"]);
export type PldRuleCode = z.infer<typeof pldRuleCode>;
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export const pldParameters = z.object({
  windowDays: z.number().int().min(1).max(30),
  minCount: z.number().int().min(2).max(10000),
  minTotal: money,
  smallPaymentMax: money,
  growthMultiplier: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).refine(v => new Decimal(v).gt(1)),
  rapidHours: z.number().int().min(1).max(168),
});
export type PldParameters = z.infer<typeof pldParameters>;
export type PldPayment = { id: string; amount: string; paidAt: string; providerConfirmed: boolean };
export type PldWithdrawal = { id: string; amount: string; requestedAt: string };
export type PldRefund = { id: string; amount: string; completedAt: string };
export function evaluatePldRule(code: PldRuleCode, p: PldParameters, payments: PldPayment[], previous: PldPayment[], withdrawals: PldWithdrawal[], refunds: PldRefund[]) {
  const confirmed = payments.filter(r => r.providerConfirmed);
  const sum = (rows: { amount: string }[]) => rows.reduce((v, r) => v.plus(r.amount), new Decimal(0));
  let rows: { id: string; amount: string }[] = confirmed;
  let matched = false, sufficient = true;
  if (code === "volume_growth") {
    const baseline = previous.filter(r => r.providerConfirmed);
    sufficient = baseline.length >= p.minCount && sum(baseline).gt(0);
    matched = sufficient && confirmed.length >= p.minCount && sum(confirmed).gte(p.minTotal) && sum(confirmed).gte(sum(baseline).mul(p.growthMultiplier));
  } else if (code === "small_payments") {
    rows = confirmed.filter(r => new Decimal(r.amount).lte(p.smallPaymentMax));
    matched = rows.length >= p.minCount && sum(rows).gte(p.minTotal);
  } else if (code === "rapid_withdrawal") {
    rows = withdrawals.filter(w => confirmed.some(r => {
      const ms = Date.parse(w.requestedAt) - Date.parse(r.paidAt);
      return ms >= 0 && ms <= p.rapidHours * 3600000;
    }));
    matched = rows.length >= p.minCount && sum(rows).gte(p.minTotal);
  } else {
    rows = refunds;
    matched = rows.length >= p.minCount && sum(rows).gte(p.minTotal);
  }
  return { matched, sufficient, total: sum(rows).toFixed(2), count: rows.length, references: rows.map(r => r.id) };
}

export const pldStatus = z.enum(["new", "in_review", "awaiting_information", "escalated", "closed"]);
export const pldOutcome = z.enum(["false_positive", "explained", "specialist_review"]);
export function assertPldDecision(status: string, note: string, outcome?: string | null) {
  if (note.trim().length < 5) throw new Error("Registre uma justificativa com pelo menos 5 caracteres.");
  if (status === "closed" && !pldOutcome.safeParse(outcome).success) throw new Error("Escolha o resultado da análise.");
}