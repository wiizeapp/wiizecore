import { describe, expect, it } from "vitest";
import { feeFor, fixedFeeCount, grossUp, mixKeyFor } from "./fee-math";
import { buildUnitEconomics, simulate } from "./unit-economics";
import { calculateFeeFromConfig } from "./fee-engine.server";

// Tabela oficial (espelha payment_fee_settings v2 apenas para teste).
const T = {
  pix: { fixed: 2.99, percent: 0.99 }, pixAuto: { fixed: 2.99, percent: 4.99 }, boleto: { fixed: 2.99, percent: 4.99 },
  boleto2_6: { fixed: 2.99, percent: 5.99 }, boleto7_12: { fixed: 2.99, percent: 6.49 }, boleto13_21: { fixed: 2.99, percent: 6.99 },
  debit: { fixed: 0.99, percent: 4.99 }, debit2_6: { fixed: 0.99, percent: 5.99 }, debit7_12: { fixed: 0.99, percent: 6.49 }, debit13_21: { fixed: 0.99, percent: 6.99 },
  c1: { fixed: 0.99, percent: 5.99 }, c2_6: { fixed: 0.99, percent: 6.99 },
  c7_12: { fixed: 0.99, percent: 7.49 }, c13_21: { fixed: 0.99, percent: 7.99 },
};
const cfg = (r: { fixed: number; percent: number }) => ({ id: "x", fixed_fee: r.fixed, percentage_fee: r.percent });

describe("taxa por método (fórmula: valor × % + fixo)", () => {
  it.each([
    ["Pix à vista", T.pix, 10000, 101.99],
    ["Pix Automático", T.pixAuto, 1000, 52.89],
    ["Boleto", T.boleto, 1000, 52.89],
    ["Boleto 2–6x", T.boleto2_6, 1000, 62.89],
    ["Boleto 7–12x", T.boleto7_12, 1000, 67.89],
    ["Boleto 13–21x", T.boleto13_21, 1000, 72.89],
    ["Débito", T.debit, 1000, 50.89],
    ["Débito 2–6x", T.debit2_6, 1000, 60.89],
    ["Débito 7–12x", T.debit7_12, 1000, 65.89],
    ["Débito 13–21x", T.debit13_21, 1000, 70.89],
    ["Crédito 1x", T.c1, 10000, 599.99],
    ["Crédito 2x", T.c2_6, 1000, 70.89],
    ["Crédito 6x", T.c2_6, 1000, 70.89],
    ["Crédito 7x", T.c7_12, 1000, 75.89],
    ["Crédito 12x", T.c7_12, 1000, 75.89],
    ["Crédito 13x", T.c13_21, 1000, 80.89],
    ["Crédito 21x", T.c13_21, 1000, 80.89],
  ])("%s", (_, rate, amount, expected) => {
    expect(feeFor(amount, rate)).toBe(expected);
    const engine = calculateFeeFromConfig({ grossAmount: amount, installments: 1, paymentMethod: "pix", config: cfg(rate) });
    expect(engine.totalFee).toBe(expected);
  });
  it("Pix R$10.000 → líquido R$9.898,01", () => {
    expect(calculateFeeFromConfig({ grossAmount: 10000, installments: 1, paymentMethod: "pix", config: cfg(T.pix) }).netAmount).toBe(9898.01);
  });
  it("boleto parcelado cobra fixo por boleto; cartão e débito parcelados cobram fixo uma vez", () => {
    expect(fixedFeeCount("boleto", 2)).toBe(2);
    expect(fixedFeeCount("credit_card", 12)).toBe(1);
    expect(fixedFeeCount("debit_card", 21)).toBe(1);
    expect(feeFor(1000, T.boleto, 2)).toBe(55.88);
  });
});

describe("repasse da taxa", () => {
  it("absorvida: cliente paga o valor do serviço", () => {
    const r = grossUp(10000, T.c1, 0);
    expect(r.total).toBe(10000); expect(r.providerNet).toBe(9400.01);
  });
  it("100% repassada: gross-up, prestador recebe o líquido desejado", () => {
    const r = grossUp(10000, T.c1, 100);
    expect(r.total).toBeCloseTo((10000 + 0.99) / (1 - 0.0599), 1);
    expect(r.providerNet).toBeGreaterThanOrEqual(10000);
    expect(r.providerNet - 10000).toBeLessThan(0.05);
  });
  it("50% repassada: prestador arca com metade da taxa", () => {
    const r = grossUp(10000, T.pix, 50);
    expect(Math.abs(r.providerNet - (10000 - r.fee / 2))).toBeLessThan(0.02);
  });
});

describe("unit economics", () => {
  const p = (o: Partial<Parameters<typeof buildUnitEconomics>[0][number]>) => ({ id: "1", tenantId: "t1", status: "paid", method: "pix", installments: 1, recurring: false, gross: 10000, fee: 101.99, cost: 1.99, paidAt: "2026-09-01", ...o });
  it("TPV, receita, custo, margem e margem por R$1.000 (somente pagos)", () => {
    const ue = buildUnitEconomics([p({}), p({ id: "2", status: "refunded" }), p({ id: "3", status: "cancelled" })], []);
    expect(ue.summary.tpv).toBe(10000);
    expect(ue.summary.revenue).toBe(101.99);
    expect(ue.summary.cost).toBe(1.99);
    expect(ue.summary.margin).toBe(100);
    expect(ue.summary.marginPct).toBeCloseTo(1, 5);
    expect(ue.summary.marginPer1000).toBeCloseTo(10, 5);
    expect(ue.summary.ticket).toBe(10000);
  });
  it("custo não configurado não vira zero silencioso", () => {
    expect(buildUnitEconomics([p({ cost: null })], []).summary.uncosted).toBe(1);
  });
  it("mix por faixa de parcelas", () => {
    expect(mixKeyFor("credit_card", 7)).toBe("credit_7_12");
    expect(mixKeyFor("pix", 1, true)).toBe("pix_recurring");
  });
  it("receita de NF entra no valor do cliente", () => {
    const ue = buildUnitEconomics([p({})], [{ tenantId: "t1", fee: 2.5, cost: 0.49 }]);
    expect(ue.clients[0]!.ecosystemRevenue).toBe(104.49);
  });
  it("simulador separado dos dados reais", () => {
    const rates = Object.fromEntries(["pix", "pix_recurring", "boleto", "debit_card", "credit_1", "credit_2_6", "credit_7_12", "credit_13_21"].map((k) => [k, { fee: T.pix, cost: null }])) as Parameters<typeof simulate>[2];
    const s = simulate(1_000_000, { pix: 100, pix_recurring: 0, boleto: 0, debit_card: 0, credit_1: 0, credit_2_6: 0, credit_7_12: 0, credit_13_21: 0 }, rates, 1000);
    expect(s.revenue).toBeCloseTo(9900 + 1000 * 2.99, 2);
    expect(s.costKnown).toBe(false);
  });
});
