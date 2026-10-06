import { describe, expect, it } from "vitest";
import { feeFor, fixedFeeCount } from "./fee-math";
import { calculateFeeFromConfig, calculateAnticipationFromConfig } from "./fee-engine.server";

// Espelho (apenas para teste) da tabela oficial vigente em payment_fee_settings v5.
const PIX = { fixed: 2.49, percent: 0.99 };
const CARD = { 1: { fixed: 0.99, percent: 4.99 }, 2: { fixed: 0.99, percent: 5.49 }, 7: { fixed: 0.99, percent: 5.99 }, 13: { fixed: 0.99, percent: 6.29 } };
const cfg = (r: { fixed: number; percent: number }) => ({ id: "v5", fixed_fee: r.fixed, percentage_fee: r.percent });

describe("tabela oficial out/2026", () => {
  it.each([
    ["Pix R$1.000", PIX, 1000, 12.39, 987.61],
    ["Pix Automático R$1.000", PIX, 1000, 12.39, 987.61],
    ["Boleto R$1.000", PIX, 1000, 12.39, 987.61],
    ["Cartão 1x", CARD[1], 1000, 50.89, 949.11],
    ["Cartão 2–6x", CARD[2], 1000, 55.89, 944.11],
    ["Cartão 7–12x", CARD[7], 1000, 60.89, 939.11],
    ["Cartão 13–21x", CARD[13], 1000, 63.89, 936.11],
    ["Pix R$10", PIX, 10, 2.59, 7.41],
    ["Pix R$100", PIX, 100, 3.48, 96.52],
    ["Pix R$10.000", PIX, 10000, 101.49, 9898.51],
    ["Cartão 1x R$123,45", CARD[1], 123.45, 7.15, 116.3],
  ])("%s", (_l, rate, amount, fee, net) => {
    const r = calculateFeeFromConfig({ grossAmount: amount, installments: 1, paymentMethod: "pix", config: cfg(rate) });
    expect(r.totalFee).toBe(fee);
    expect(r.netAmount).toBe(net);
  });

  it("cartão: fixo uma vez por venda (2x, 6x, 12x, 21x)", () => {
    for (const n of [2, 6, 7, 12, 13, 21]) expect(fixedFeeCount("credit_card", n)).toBe(1);
  });
  it("boleto parcelado: fixo por parcela", () => {
    expect(feeFor(1000, PIX, fixedFeeCount("boleto", 6))).toBe(24.84);
  });
  it("antecipação 30 dias: boleto 6,99%, cartão 2,99%", () => {
    expect(calculateAnticipationFromConfig({ grossAmount: 1000, originalDueDate: "2026-11-01", anticipationDate: "2026-10-02", monthlyRate: 6.99 }).anticipationFee).toBe(69.9);
    expect(calculateAnticipationFromConfig({ grossAmount: 1000, originalDueDate: "2026-11-01", anticipationDate: "2026-10-02", monthlyRate: 2.99 }).anticipationFee).toBe(29.9);
  });
});
