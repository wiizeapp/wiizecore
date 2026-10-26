import { expect, it } from "vitest";
import { decryptPld, encryptPld } from "./pld-crypto.server";
it("conteúdo é cifrado com nonce novo e vinculado ao caso", () => {
  const key = "synthetic-key-only-for-tests", input = { note: "synthetic evidence" };
  const a = encryptPld(input, "case:a", key), b = encryptPld(input, "case:a", key);
  expect(a).not.toBe(b); expect(a).not.toContain(input.note);
  expect(decryptPld(a, "case:a", key)).toEqual(input);
  expect(() => decryptPld(a, "case:b", key)).toThrow();
  expect(() => decryptPld(a, "case:a", "wrong-test-key")).toThrow();
  expect(() => decryptPld(a.slice(0,-5)+"AAAAA", "case:a", key)).toThrow();
});