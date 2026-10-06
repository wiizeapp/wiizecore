import { describe, it, expect } from "vitest";
import { validDocument, validPixKey } from "./doc-validation";

describe("conta de saque", () => {
  it("aceita CPF/CNPJ válidos e recusa inválidos", () => {
    expect(validDocument("52998224725")).toBe(true);
    expect(validDocument("11144477735")).toBe(true);
    expect(validDocument("11222333000181")).toBe(true);
    expect(validDocument("11111111111")).toBe(false);
    expect(validDocument("12345678900")).toBe(false);
  });
  it("valida formatos de chave Pix", () => {
    expect(validPixKey("teste@wiizepay.com")).toBe(true);
    expect(validPixKey("52998224725")).toBe(true);
    expect(validPixKey("abc")).toBe(false);
  });
});
