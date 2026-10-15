import { describe, expect, it } from "vitest";
import { estimateAnticipation, estimateSaleFee, parseMoney, splitInstallments } from "./help-calculators";
import type { RateRow } from "./fee-math";

const rows: RateRow[] = [
  { payment_method: "pix", installment_min: 1, installment_max: 1, fixed: 2.99, percent: 0 },
  { payment_method: "boleto", installment_min: 1, installment_max: 12, fixed: 2.99, percent: 0 },
  { payment_method: "credit_card", installment_min: 1, installment_max: 1, fixed: 0.99, percent: 4.99 },
  { payment_method: "credit_card", installment_min: 2, installment_max: 6, fixed: 0.99, percent: 6.99 },
  { payment_method: "credit_card", installment_min: 7, installment_max: 12, fixed: 0.99, percent: 7.99 },
];

describe("help calculators", () => {
  it("parses money in BR format", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("100")).toBe(100);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("0")).toBeNull();
  });
  it("uses the right card tier", () => {
    expect(estimateSaleFee(rows, "credit_card", 1000, 1)?.fee).toBe(50.89);
    expect(estimateSaleFee(rows, "credit_card", 1000, 3)?.fee).toBe(70.89);
    expect(estimateSaleFee(rows, "credit_card", 1000, 12)?.net).toBe(919.11);
    expect(estimateSaleFee(rows, "credit_card", 1000, 13)).toBeNull();
  });
  it("charges fixed fee per boleto installment and flat pix", () => {
    expect(estimateSaleFee(rows, "boleto", 300, 3)?.fee).toBe(8.97);
    expect(estimateSaleFee(rows, "pix", 50, 1)?.net).toBe(47.01);
  });
  it("splits installments without losing cents", () => {
    const p = splitInstallments(100, 3);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(p).toEqual([33.34, 33.33, 33.33]);
  });
  it("prorates anticipation per receivable", () => {
    const r = estimateAnticipation({ rows, method: "credit_card", gross: 1000, installments: 2, paymentDate: "2026-10-15", anticipationDate: "2026-10-15", monthlyRate: 3 });
    expect(r?.receivables).toHaveLength(2);
    expect(r!.receivables[1]!.days).toBeGreaterThan(r!.receivables[0]!.days);
    const expected = r!.receivables.reduce((s, x) => s + Math.round((x.net * 100 * 300 * x.days) / 300000) / 100, 0);
    expect(r!.anticipationFee).toBeCloseTo(expected, 2);
    expect(r!.finalNet).toBeCloseTo(r!.sale.net - r!.anticipationFee, 2);
  });
});
