import { describe, expect, it } from "vitest";
import { normalizePercents, splitNet, validateRules } from "./coproduction-math";

describe("coprodução", () => {
  it("à vista: 950 líquido 70/30", () => {
    expect(splitNet(950, [30])).toEqual({ principal: 665, participants: [285], net: 950 });
  });
  it("parcelas com líquidos diferentes", () => {
    expect(splitNet(190, [30])).toEqual({ principal: 133, participants: [57], net: 190 });
    expect(splitNet(191, [30])).toEqual({ principal: 133.7, participants: [57.3], net: 191 });
  });
  it("parcela pendente = zero", () => {
    expect(splitNet(0, [30]).participants).toEqual([0]);
  });
  it("4 coprodutores e centavos residuais com o principal", () => {
    const r = splitNet(100.01, [10, 20, 15.5, 7.25]);
    const total = Math.round((r.principal + r.participants.reduce((a, b) => a + b, 0)) * 100);
    expect(total).toBe(10001);
    expect(r.participants).toEqual([10, 20, 15.5, 7.25]);
  });
  it("valor fixo vira percentual do líquido", () => {
    expect(normalizePercents([{ type: "fixed", fixedAmount: 285 }], 950)).toEqual([30]);
  });
  it("bloqueia 100% ou mais e mais de 4", () => {
    expect(validateRules([{ type: "percent", percent: 60 }, { type: "percent", percent: 40 }], 1000)).toMatch(/menos de 100%/);
    expect(validateRules(Array.from({ length: 5 }, () => ({ type: "percent" as const, percent: 5 })), 1000)).toMatch(/limite/);
    expect(validateRules([{ type: "percent", percent: -1 }], 1000)).toBeTruthy();
    expect(validateRules([{ type: "percent", percent: 30 }], 1000)).toBeNull();
  });
});
