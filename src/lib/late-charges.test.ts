import { describe, expect, it } from "vitest";
import { computeLateCharges, daysLate } from "./late-charges";

describe("encargos por atraso", () => {
  it("sem atraso não cobra nada", () => {
    expect(computeLateCharges({ amount: 950, finePercent: 2, interestPercentMonthly: 1, dueOn: "2026-10-10", today: "2026-10-10" }).total).toBe(950);
  });
  it("multa única e juros proporcionais por dia", () => {
    const r = computeLateCharges({ amount: 950, finePercent: 2, interestPercentMonthly: 1, dueOn: "2026-09-01", today: "2026-10-01" });
    expect(r.days).toBe(30);
    expect(r.fine).toBe(19);
    expect(r.interest).toBe(9.5);
    expect(r.total).toBe(978.5);
  });
  it("não aceita percentuais negativos", () => {
    expect(computeLateCharges({ amount: 100, finePercent: -5, interestPercentMonthly: -1, dueOn: "2026-09-01", today: "2026-09-11" }).total).toBe(100);
  });
  it("conta dias corretamente", () => {
    expect(daysLate("2026-09-28", "2026-10-01")).toBe(3);
    expect(daysLate("2026-10-05", "2026-10-01")).toBe(0);
  });
});

import { shouldAutoCancelFirstCharge } from "./late-charges";
describe("cancelamento automático da primeira cobrança", () => {
  it("cancela só a primeira cobrança com 30 dias ou mais de atraso", () => {
    expect(shouldAutoCancelFirstCharge("2026-01-05", "2026-02-04", true)).toBe(true);
    expect(shouldAutoCancelFirstCharge("2026-01-05", "2026-02-03", true)).toBe(false);
    expect(shouldAutoCancelFirstCharge("2026-01-05", "2026-03-01", false)).toBe(false);
  });
  it("R$ 300 com multa 2% e juros 3% ao mês, 5 dias de atraso", () => {
    expect(computeLateCharges({ amount: 300, finePercent: 2, interestPercentMonthly: 3, dueOn: "2026-01-05", today: "2026-01-10" }).total).toBe(307.5);
  });
});
