import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateCardRisk } from "./card-risk-rules";

const zero = { cards_per_ip: 1, links_per_ip: 1, declines_per_ip: 0, declines_per_card: 0, ips_per_card: 1 };

describe("antifraude comportamental do cartão", () => {
  it("pagador comum não é bloqueado", () => {
    expect(evaluateCardRisk(zero)).toEqual({ level: "low", reasons: [], block: false, findings: [] });
  });
  it("4 cartões diferentes na mesma origem em 1h bloqueia", () => {
    expect(evaluateCardRisk({ ...zero, cards_per_ip: 4 }).block).toBe(true);
  });
  it("3 cartões gera alerta sem bloquear", () => {
    const r = evaluateCardRisk({ ...zero, cards_per_ip: 3 });
    expect(r).toMatchObject({ level: "medium", block: false });
  });
  it("5 recusas na mesma origem bloqueia", () => {
    expect(evaluateCardRisk({ ...zero, declines_per_ip: 5 }).reasons).toContain("declines_same_origin");
  });
  it("3 recusas do mesmo cartão bloqueia", () => {
    expect(evaluateCardRisk({ ...zero, declines_per_card: 3 }).block).toBe(true);
  });
  it("5 links diferentes na mesma origem bloqueia", () => {
    expect(evaluateCardRisk({ ...zero, links_per_ip: 5 }).block).toBe(true);
  });
  it("mesmo cartão vindo de 4 origens bloqueia", () => {
    expect(evaluateCardRisk({ ...zero, ips_per_card: 4 }).block).toBe(true);
  });
  it("checkout avalia o risco antes de chamar a Asaas e registra recusas", () => {
    const src = readFileSync("src/lib/checkout.functions.ts", "utf8");
    const risk = src.indexOf('outcome: "attempt"');
    expect(risk).toBeGreaterThan(0);
    expect(risk).toBeLessThan(src.indexOf("payWithCreditCard(payment.provider_payment_id"));
    expect(src).toMatch(/outcome: "declined"/);
  });
});
