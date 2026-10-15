import { describe, expect, it } from "vitest";
import { isValidChoice, openInstallments, openMethods } from "./service-checkout-rules";

const all = ["pix", "boleto", "credit_card"];
describe("checkout aberto", () => {
  it("só parcela serviço parcelado, até 21x", () => {
    expect(openInstallments("one_time")).toEqual([1]);
    expect(openInstallments("recurring")).toEqual([1]);
    expect(openInstallments("installment").at(-1)).toBe(21);
  });
  it("respeita as formas aceitas pelo serviço", () => {
    expect(openMethods(["pix"])).toEqual(["pix"]);
    expect(openMethods(all)).toEqual(["pix", "boleto", "credit_card"]);
  });
  it("recusa escolhas fora da regra", () => {
    expect(isValidChoice("recurring", all, "credit_card", 3)).toBe(false);
    expect(isValidChoice("installment", all, "credit_card", 12)).toBe(true);
    expect(isValidChoice("installment", all, "debit_card", 1)).toBe(false);
  });
  it("respeita o limite definido pela empresa", () => {
    expect(openInstallments("installment", 3)).toEqual([1, 2, 3]);
    expect(isValidChoice("installment", all, "credit_card", 4, 3)).toBe(false);
    expect(isValidChoice("installment", all, "pix", 1, 3)).toBe(true);
    expect(openInstallments("installment", 40).at(-1)).toBe(21);
  });
});
