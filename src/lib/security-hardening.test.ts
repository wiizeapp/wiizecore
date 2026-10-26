import { describe, expect, it } from "vitest";
import { accessStage, sessionHasMfa } from "./mfa-policy";
import { AUDIT_QUERY_MAX_DAYS, clampRange, sanitizeMetadata } from "./audit-policy";
import { missingRequiredSteps, ONBOARDING_STEPS, resumeIndex } from "./onboarding-options";

describe("2FA obrigatório", () => {
  const base = { signedIn: true, aal: "aal1", hasVerifiedFactor: false, onboardingDone: true };
  it("conta sem 2FA cai na configuração obrigatória, mesmo com onboarding feito", () => {
    expect(accessStage(base)).toBe("mfa_setup");
  });
  it("2FA cadastrado mas não confirmado na sessão exige o código", () => {
    expect(accessStage({ ...base, hasVerifiedFactor: true })).toBe("mfa_verify");
  });
  it("onboarding só aparece depois do 2FA confirmado", () => {
    expect(accessStage({ ...base, hasVerifiedFactor: true, aal: "aal2", onboardingDone: false })).toBe("onboarding");
  });
  it("servidor só aceita sessão aal2", () => {
    expect(sessionHasMfa({ aal: "aal1" })).toBe(false);
    expect(sessionHasMfa(null)).toBe(false);
    expect(sessionHasMfa({ aal: "aal2" })).toBe(true);
  });
});

describe("onboarding obrigatório", () => {
  it("concluir sem responder as obrigatórias é recusado", () => {
    expect(missingRequiredSteps({}).length).toBe(ONBOARDING_STEPS.filter((s) => !s.optional).length);
  });
  it("faturamento é a única pergunta que pode ficar em branco", () => {
    const all = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.key, s.multi ? [s.options[0]!.id] : s.options[0]!.id]));
    delete (all as Record<string, unknown>)["monthly_revenue"];
    expect(missingRequiredSteps(all)).toEqual([]);
  });
  it("forma de recebimento vazia conta como não respondida", () => {
    expect(missingRequiredSteps({ payment_methods: [] })).toContain("payment_methods");
  });
  it("retoma na primeira pergunta sem resposta", () => {
    expect(resumeIndex({ role: "owner" })).toBe(1);
  });
});

describe("logs sanitizados", () => {
  it("remove senha, token, cartão e CVV", () => {
    const out = sanitizeMetadata({ password: "123456", access_token: "abc", card_number: "4111111111111111", cvv: "123", amount: 10 }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("123456");
    expect(JSON.stringify(out)).not.toContain("4111111111111111");
    expect(JSON.stringify(out)).not.toContain("abc");
    expect(out["amount"]).toBe(10);
  });
  it("período de consulta nunca passa de 90 dias", () => {
    const r = clampRange("2020-01-01", "2026-01-01");
    const days = (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000;
    expect(days).toBeLessThanOrEqual(AUDIT_QUERY_MAX_DAYS);
  });
});
