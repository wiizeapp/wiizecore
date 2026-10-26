import { describe, expect, it } from "vitest";
import { assertReplaceableProviderPayment, scopedProviderEventId } from "./financial-scope";
import { assertTwoFactor, assertFinancialPassword } from "./finance.server";
import { vi } from "vitest";

vi.mock("./audit.server", () => ({ logAudit: vi.fn(), logSecurityEvent: vi.fn() }));
vi.mock("./crypto.server", () => ({ verifySecretValue: (value: string) => value === "correct" }));

describe("escopo financeiro", () => {
  it("isola o mesmo aviso por conexão autenticada", () => {
    expect(scopedProviderEventId("a", "evt1")).toBe("a:evt1");
    expect(scopedProviderEventId("b", "evt1")).not.toBe(scopedProviderEventId("a", "evt1"));
  });
  it("não substitui pagamento já confirmado ou em análise", () => {
    for (const status of ["CONFIRMED", "RECEIVED", "AWAITING_RISK_ANALYSIS", "REFUNDED"]) {
      expect(() => assertReplaceableProviderPayment({ id: "p", status }, "p", false)).toThrow();
    }
    expect(() => assertReplaceableProviderPayment({ id: "p", status: "PENDING" }, "p", false)).not.toThrow();
  });
  it("rejeita retorno de outro pagamento ou estado desconhecido", () => {
    expect(() => assertReplaceableProviderPayment({ id: "other", status: "PENDING" }, "p", false)).toThrow();
    expect(() => assertReplaceableProviderPayment({ id: "p" }, "p", false)).toThrow();
  });
  it("reativa somente após confirmação de exclusão pelo provedor", () => {
    expect(() => assertReplaceableProviderPayment({ id: "p", deleted: true }, "p", true)).not.toThrow();
    expect(() => assertReplaceableProviderPayment({ id: "p", status: "PENDING" }, "p", true)).toThrow();
  });
  it("exige aal2 inclusive para quem não cadastrou autenticador", () => {
    expect(() => assertTwoFactor({ aal: "aal1" })).toThrow();
    expect(() => assertTwoFactor(null)).toThrow();
    expect(() => assertTwoFactor({ aal: "aal2" })).not.toThrow();
  });
  it("senha correta não ignora bloqueio atômico vigente", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { state: "locked", attempts: 3, lockedUntil: new Date(Date.now() + 60 * 60_000).toISOString() }, error: null });
    const q: any = { select: () => q, eq: () => q, limit: () => q, maybeSingle: () => Promise.resolve({ data: { tenant_id: "t", password_hash: "hash" }, error: null }) };
    const admin: any = { from: () => q, rpc };
    await expect(assertFinancialPassword(admin, "u", "correct", "test")).rejects.toThrow("bloqueado");
    expect(rpc).toHaveBeenCalledWith("record_financial_password_check", { _user_id: "u", _expected_hash: "hash", _valid: true });
  });
});