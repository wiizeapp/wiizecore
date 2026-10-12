import { describe, expect, it } from "vitest";
import { maskSecret, parseSecretKey, sanitizeScopes } from "./ext-keys";

describe("chaves da integração externa", () => {
  it("aceita só chaves sk_ bem formadas", () => {
    const k = "sk_test_" + "a".repeat(43);
    expect(parseSecretKey(`Bearer ${k}`)).toEqual({ env: "test", key: k });
    expect(parseSecretKey("Bearer pk_test_abc")).toBeNull();
    expect(parseSecretKey("sk_prod_" + "a".repeat(43))).toBeNull();
    expect(parseSecretKey(null)).toBeNull();
  });
  it("descarta permissões não autorizadas", () => {
    expect(sanitizeScopes(["charges:write", "withdrawals:write", "charges:write"])).toEqual(["charges:write"]);
    expect(sanitizeScopes("x")).toEqual([]);
  });
  it("mascara a chave", () => {
    expect(maskSecret("sk_live_", "ab12")).toMatch(/^sk_live_•+ab12$/);
  });
});
