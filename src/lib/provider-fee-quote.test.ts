import { describe, expect, it } from "vitest";
import { coveredProviderFeeCents, estimateProviderFeeCents, reimbursementCents } from "./provider-fee-quote";

const fees = { payment: {
  bankSlip: { defaultValue: 1.99 },
  creditCard: { operationValue: 0.49, oneInstallmentPercentage: 2.99 },
  debitCard: { operationValue: 0.35, defaultPercentage: 1.89 },
  pix: { type: "FIXED", fixedFeeValue: 1.99, percentageFee: null },
} };

describe("custo do Asaas pela API", () => {
  it("pix e boleto fixos", () => {
    expect(estimateProviderFeeCents(fees, "pix", 10000)).toBe(199);
    expect(estimateProviderFeeCents(fees, "boleto", 10000)).toBe(199);
  });
  it("cartão à vista: 0,49 + 2,99%", () => expect(estimateProviderFeeCents(fees, "credit_card", 10000)).toBe(348));
  it("sem dados ou forma indefinida → sem estimativa", () => {
    expect(estimateProviderFeeCents(null, "pix", 10000)).toBeNull();
    expect(estimateProviderFeeCents(fees, null, 10000)).toBeNull();
  });
  it("divisão: WiizePay recebe só a diferença", () => {
    const covered = coveredProviderFeeCents(629, 348);
    expect(629 - covered).toBe(281);
  });
  it("taxa WiizePay menor que o custo (promoção) → cobre só até a taxa e devolve o resto", () => {
    const covered = coveredProviderFeeCents(249, 199 + 100);
    expect(covered).toBe(249);
    expect(reimbursementCents(299, covered)).toBe(50);
  });
  it("cobranças antigas (sem cobertura) seguem com devolução total", () => expect(reimbursementCents(199, 0)).toBe(199));
  it("custo real menor que a estimativa → nada a devolver", () => expect(reimbursementCents(99, 199)).toBe(0));
});

describe("promoção do Asaas informada pela API", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const promo = { payment: {
    bankSlip: { defaultValue: 1.99, discountValue: 0.99, expirationDate: "2027-01-07" },
    pix: { type: "FIXED", fixedFeeValue: 1.99, fixedFeeValueWithDiscount: 0.99, discountExpiration: "2027-01-07" },
  } };
  it("durante a promoção usa 0,99 (diferença fica com a WiizePay)", () => {
    expect(estimateProviderFeeCents(promo, "pix", 10000, now)).toBe(99);
    expect(estimateProviderFeeCents(promo, "boleto", 10000, now)).toBe(99);
    expect(249 - coveredProviderFeeCents(249, 99)).toBe(150);
  });
  it("depois do fim volta sozinho para 1,99", () => {
    const later = Date.parse("2027-01-08T12:00:00Z");
    expect(estimateProviderFeeCents(promo, "pix", 10000, later)).toBe(199);
  });
  it("perto do fim usa o preço cheio por segurança", () => {
    const near = Date.parse("2027-01-01T12:00:00Z");
    expect(estimateProviderFeeCents(promo, "boleto", 10000, near)).toBe(199);
    expect(estimateProviderFeeCents(promo, "pix", 10000, near)).toBe(99);
  });
});

