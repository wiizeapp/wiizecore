import { describe, expect, it } from "vitest";
import { applyDiscount, computeCouponDiscount, normalizeCouponCode, COUPON_CODE_RE } from "./coupon-math";

describe("cupons", () => {
  it("normaliza códigos", () => {
    expect(normalizeCouponCode(" black friday ")).toBe("BLACKFRIDAY");
    expect(normalizeCouponCode("promoção10")).toBe("PROMOCAO10");
    expect(COUPON_CODE_RE.test("A<b>")).toBe(false);
  });
  it("calcula percentual com teto", () => {
    expect(computeCouponDiscount({ type: "percent", value: 20, base: 1000, maxDiscount: 100 })).toBe(100);
    expect(computeCouponDiscount({ type: "percent", value: 10, base: 500 })).toBe(50);
  });
  it("nunca deixa a cobrança abaixo do mínimo", () => {
    expect(computeCouponDiscount({ type: "fixed", value: 100, base: 50 })).toBe(45);
    expect(computeCouponDiscount({ type: "fixed", value: 10, base: 4 })).toBe(0);
    expect(applyDiscount(10, 50)).toBe(5);
  });
  it("ignora valores inválidos", () => {
    expect(computeCouponDiscount({ type: "fixed", value: -10, base: 100 })).toBe(0);
    expect(computeCouponDiscount({ type: "percent", value: 500, base: 100 })).toBe(95);
  });
});
