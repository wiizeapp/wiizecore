import { describe, expect, it } from "vitest";
import { canonicalJson, extCheckoutBody, IDEMPOTENCY_RE, mapCoreError } from "./ext-checkout.server";

const ok = { service_id: "7b0b8f5e-2f8a-4b8f-9d6a-1f2e3d4c5b6a", customer: { name: "Ana Souza", document: "529.982.247-25" } };

describe("checkout da integração externa", () => {
  it("aceita corpo mínimo e limpa o CPF", () => {
    const p = extCheckoutBody.parse(ok);
    expect(p.customer.document).toBe("52998224725");
  });
  it("recusa valor enviado pelo SaaS, CPF inválido e URL sem https", () => {
    expect(extCheckoutBody.safeParse({ ...ok, amount: 1 }).success).toBe(false);
    expect(extCheckoutBody.safeParse({ ...ok, customer: { name: "Ana", document: "11111111111" } }).success).toBe(false);
    expect(extCheckoutBody.safeParse({ ...ok, success_url: "http://x.com" }).success).toBe(false);
  });
  it("assinatura do pedido não depende da ordem dos campos", () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(canonicalJson({ b: { d: 3, c: 2 }, a: 1 }));
  });
  it("exige chave de idempotência razoável", () => {
    expect(IDEMPOTENCY_RE.test("order-12345")).toBe(true);
    expect(IDEMPOTENCY_RE.test("x")).toBe(false);
  });
  it("não vaza mensagens internas", () => {
    expect(mapCoreError("Serviço não encontrado ou inativo.")).toEqual({ status: 404, code: "service_not_found" });
    expect(mapCoreError("boom secret").code).toBe("provider_unavailable");
  });
});
