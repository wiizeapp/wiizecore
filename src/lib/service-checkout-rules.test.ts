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
    expect(openMethods("one_time", ["pix"])).toEqual(["pix"]);
    expect(openMethods("recurring", all)).toEqual(["pix", "boleto", "credit_card"]);
  });
  it("recusa escolhas fora da regra", () => {
    expect(isValidChoice("recurring", all, "credit_card", 3)).toBe(false);
    expect(isValidChoice("installment", all, "credit_card", 12)).toBe(true);
    expect(isValidChoice("installment", all, "debit_card", 1)).toBe(false);
  });
});
