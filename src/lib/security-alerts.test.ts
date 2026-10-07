import { describe, expect, it } from "vitest";
import { alertDedupeKey, classifySecurityEvent, guideFor, maskIp } from "./security-alerts";

describe("alertas de segurança", () => {
  it("classifica ataques e ignora eventos comuns", () => {
    expect(classifySecurityEvent("rate_limit_blocked", "warning")).toBe("rate_limit");
    expect(classifySecurityEvent("withdrawal_mfa_failed", "warning")).toBe("financial");
    expect(classifySecurityEvent("upload_rejected", "warning")).toBe("upload");
    expect(classifySecurityEvent("login_success", "info")).toBeNull();
  });
  it("agrupa a mesma origem na mesma janela", () => {
    const a = alertDedupeKey("rate_limit", "1.2.3.4", new Date("2026-10-07T10:01:00Z"));
    const b = alertDedupeKey("rate_limit", "1.2.3.4", new Date("2026-10-07T10:20:00Z"));
    const c = alertDedupeKey("rate_limit", "1.2.3.4", new Date("2026-10-07T10:40:00Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("sempre traz passos do que fazer e mascara IP", () => {
    expect(guideFor("financial").steps.length).toBeGreaterThan(0);
    expect(maskIp("187.10.20.30")).toBe("187.10.*.*");
  });
});
