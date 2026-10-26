import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { pkceMatches, signWebhook, sha256hex } from "./wiize-pay-oauth.server";

describe("WiizePay OAuth", () => {
  it("aceita PKCE S256 correto e rejeita errado", () => {
    const v = "a".repeat(64);
    const c = createHash("sha256").update(v).digest("base64url");
    expect(pkceMatches(v, c)).toBe(true);
    expect(pkceMatches("b".repeat(64), c)).toBe(false);
    expect(pkceMatches("curto", c)).toBe(false);
  });
  it("assina webhook com timestamp, nonce e corpo", () => {
    const a = signWebhook("seg", "1700000000", "n1", "{}");
    expect(a).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(signWebhook("seg", "1700000000", "n2", "{}")).not.toBe(a);
    expect(signWebhook("seg", "1700000001", "n1", "{}")).not.toBe(a);
  });
  it("hash determinístico", () => expect(sha256hex("x")).toHaveLength(64));
});
