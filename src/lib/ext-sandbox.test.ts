import { describe, expect, it } from "vitest";
import { applySandboxAction, isSafeReturnUrl, type SandboxState } from "./ext-sandbox";
import { buildToolPrompt, AI_TOOLS, EXT_ENDPOINTS } from "./ext-docs";

const one: SandboxState = { status: "awaiting_payment", kind: "one_time", cyclesPaid: 0, subscriptionStatus: null };
const sub: SandboxState = { status: "awaiting_payment", kind: "recurring", cyclesPaid: 0, subscriptionStatus: "pending" };

describe("simulador de testes", () => {
  it("aprovação de teste gera payment.confirmed com rótulo de teste", () => {
    const r = applySandboxAction(one, "approve");
    expect(r.ok && r.event).toBe("payment.confirmed");
    expect(r.ok && r.label).toBe("Pagamento de teste aprovado");
  });
  it("não aprova duas vezes", () => {
    const r = applySandboxAction({ ...one, status: "paid", cyclesPaid: 1 }, "approve");
    expect(r.ok).toBe(false);
  });
  it("renovação só é evento quando o novo ciclo é pago", () => {
    const opened = applySandboxAction({ ...sub, status: "paid", cyclesPaid: 1, subscriptionStatus: "active" }, "renew");
    expect(opened.ok && opened.event).toBe("payment.updated");
    const paid = opened.ok ? applySandboxAction(opened.next, "approve") : null;
    expect(paid?.ok && paid.event).toBe("subscription.renewed");
  });
  it("assinatura cancelada não aceita mais simulações", () => {
    const c = applySandboxAction(sub, "cancel");
    expect(c.ok && c.event).toBe("subscription.cancelled");
    expect(c.ok ? applySandboxAction(c.next, "approve").ok : true).toBe(false);
  });
  it("reembolso só depois de pago", () => {
    expect(applySandboxAction(one, "refund").ok).toBe(false);
    const r = applySandboxAction({ ...one, status: "paid", cyclesPaid: 1 }, "refund");
    expect(r.ok && r.event).toBe("payment.refunded");
  });
  it("venda avulsa paga não pode ser cancelada", () => {
    expect(applySandboxAction({ ...one, status: "paid", cyclesPaid: 1 }, "cancel").ok).toBe(false);
  });
});

describe("endereços de retorno", () => {
  it("aceita https público", () => expect(isSafeReturnUrl("https://app.exemplo.com/ok")).toBe(true));
  it.each(["http://app.exemplo.com", "https://localhost/x", "https://10.0.0.1/x", "https://u:p@exemplo.com", "javascript:alert(1)", "https://intranet"])("bloqueia %s", (u) => expect(isSafeReturnUrl(u)).toBe(false));
});

describe("prompts de integração", () => {
  it("todos os cards têm prompt sem chave real e com todos os endpoints", () => {
    for (const tool of AI_TOOLS) {
      const p = buildToolPrompt(tool.id);
      expect(p).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{6}/);
      for (const e of EXT_ENDPOINTS) expect(p).toContain(`${e.method} ${e.path}`);
      expect(p).toContain("WiizePay-Signature");
    }
  });
});
