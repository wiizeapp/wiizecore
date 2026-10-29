import { expect, it } from "vitest";
import { sanitizeMetadata } from "./audit-policy";
it("auditoria remove cartão, CVV e tokens, preservando apenas last4", () => {
  const result = sanitizeMetadata({ card_number: "4111111111111111", cvv: "123", token: "sensitive-test-token", last4: "1111", nested: { message: "4111111111111111" } });
  const output = JSON.stringify(result);
  expect(output).not.toContain("4111111111111111");
  expect(output).not.toContain('"123"');
  expect(output).not.toContain("sensitive-test-token");
  expect(result).toMatchObject({ last4: "1111", card_number: "[removido]", cvv: "[removido]" });
});