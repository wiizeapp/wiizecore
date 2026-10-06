import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createPkce, maskEmail, signPayload, validateSignature, validateTimestamp } from "./wiize-integration.server";

describe("integração Wiize", () => {
  it("PKCE S256 confere", () => {
    const { verifier, challenge } = createPkce();
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
  });
  it("assinatura válida e adulterada", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signPayload("segredo", ts, '{"a":1}');
    expect(validateSignature("segredo", ts, '{"a":1}', sig)).toBe(true);
    expect(validateSignature("segredo", ts, '{"a":2}', sig)).toBe(false);
    expect(validateSignature("segredo", ts, '{"a":1}', null)).toBe(false);
  });
  it("rejeita horário fora da janela (replay)", () => {
    const now = 1_800_000_000;
    expect(validateTimestamp(String(now - 60), now)).toBe(true);
    expect(validateTimestamp(String(now - 600), now)).toBe(false);
    expect(validateTimestamp("abc", now)).toBe(false);
  });
  it("mascara e-mail", () => {
    expect(maskEmail("joana@empresa.com")).toBe("jo***@empresa.com");
  });
});
