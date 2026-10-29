import { describe, it, expect } from "vitest";
import { canResend, confirmationLinkProblem, emailIsConfirmed } from "./mfa-policy";

describe("confirmação de e-mail", () => {
  it("bloqueia conta sem confirmação", () => {
    expect(emailIsConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(emailIsConfirmed(null)).toBe(false);
    expect(emailIsConfirmed({ email_confirmed_at: "lixo" })).toBe(false);
  });
  it("aceita conta confirmada (inclui Google)", () => {
    expect(emailIsConfirmed({ email_confirmed_at: "2026-10-01T10:00:00Z" })).toBe(true);
  });
  it("reenvio: intervalo de 60s e máximo de 3", () => {
    expect(canResend([], 0)).toBe(true);
    expect(canResend([0], 59_999)).toBe(false);
    expect(canResend([0], 60_000)).toBe(true);
    expect(canResend([0, 60_000, 120_000], 999_999)).toBe(false);
  });
  it("link vencido/usado e inválido", () => {
    expect(confirmationLinkProblem(new URLSearchParams("error=access_denied&error_code=otp_expired"))).toBe("expired");
    expect(confirmationLinkProblem(new URLSearchParams("error=access_denied"))).toBe("invalid");
    expect(confirmationLinkProblem(new URLSearchParams(""))).toBe(null);
  });
});
