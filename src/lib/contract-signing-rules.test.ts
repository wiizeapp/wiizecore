import { describe, it, expect } from "vitest";
import { birthDateSchema, SIGNING_CODE_TTL_SECONDS, SIGNING_RESEND_SECONDS, SIGNING_MAX_ATTEMPTS } from "./contract-signing-rules";
import { sanitizeMetadata } from "./audit-policy";

describe("contract signing identity", () => {
  it("requires birthdate", () => expect(birthDateSchema.safeParse("").success).toBe(false));
  it("rejects nonexistent dates", () => expect(birthDateSchema.safeParse("2001-02-29").success).toBe(false));
  it("accepts leap day", () => expect(birthDateSchema.parse("2000-02-29")).toBe("2000-02-29"));
  it("rejects future birthdate", () => expect(birthDateSchema.safeParse("9999-01-01").success).toBe(false));
  it("keeps a ten-minute code", () => expect(SIGNING_CODE_TTL_SECONDS).toBe(600));
  it("requires sixty seconds before resend", () => expect(SIGNING_RESEND_SECONDS).toBe(60));
  it("bounds verification attempts", () => expect(SIGNING_MAX_ATTEMPTS).toBe(5));
  it("removes birthdate and secret codes from general audit", () => expect(sanitizeMetadata({ birthDate: "2000-01-01", code: "123456", financialPassword: "private" })).toEqual({ birthDate: "[removido]", code: "[removido]", financialPassword: "[removido]" }));
});