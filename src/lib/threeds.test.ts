import { describe, expect, it } from "vitest";
import { authStatusForEvent, isCheckoutThreeDsEnabled, modalityForPayment } from "./threeds.server";

describe("configuração do 3DS no checkout", () => {
  it("fica desligado por padrão", () => {
    expect(isCheckoutThreeDsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("só liga com o valor exato true", () => {
    expect(isCheckoutThreeDsEnabled({ CHECKOUT_3DS_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isCheckoutThreeDsEnabled({ CHECKOUT_3DS_ENABLED: "false" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isCheckoutThreeDsEnabled({ CHECKOUT_3DS_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("modalidade da autenticação", () => {
  it("cobrança recorrente usa modalidade própria", () => {
    expect(modalityForPayment({ subscription_id: "sub_1", installment_count: null })).toBe("recurring");
  });

  it("compra parcelada usa modalidade própria", () => {
    expect(modalityForPayment({ subscription_id: null, installment_count: 12 })).toBe("installment");
  });

  it("compra à vista é modalidade única", () => {
    expect(modalityForPayment({ subscription_id: null, installment_count: 1 })).toBe("single");
    expect(modalityForPayment({})).toBe("single");
  });
});

describe("eventos oficiais que concluem a autenticação", () => {
  it("confirmação do processador marca autenticado", () => {
    expect(authStatusForEvent("PAYMENT_CONFIRMED")).toBe("authenticated");
    expect(authStatusForEvent("PAYMENT_RECEIVED")).toBe("authenticated");
  });

  it("falha do desafio e recusa de captura têm estados próprios", () => {
    expect(authStatusForEvent("PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED")).toBe("failed");
    expect(authStatusForEvent("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED")).toBe("capture_refused");
  });

  it("eventos sem relação com autenticação não alteram o registro", () => {
    expect(authStatusForEvent("PAYMENT_OVERDUE")).toBeNull();
    expect(authStatusForEvent("PAYMENT_CREATED")).toBeNull();
    expect(authStatusForEvent("QUALQUER_OUTRO")).toBeNull();
  });
});
