import { describe, expect, it } from "vitest";
import { assertPldDecision, evaluatePldRule, type PldParameters } from "./pld-rules";
const p: PldParameters = { windowDays: 7, minCount: 2, minTotal: "0.30", smallPaymentMax: "1.00", growthMultiplier: "2", rapidHours: 2 };
const pay = (id: string, amount: string, providerConfirmed = true) => ({ id, amount, providerConfirmed, paidAt: "2026-10-01T00:00:00Z" });
describe("indicadores PLD sem operações financeiras", () => {
  it("soma valores decimais sem arredondamento binário", () => {
    const result = evaluatePldRule("small_payments", p, [pay("a", "0.10"), pay("b", "0.20")], [], [], []);
    expect(result.matched).toBe(true); expect(result.total).toBe("0.30");
  });
  it("não considera recebimento sem confirmação do provedor", () => {
    expect(evaluatePldRule("small_payments", p, [pay("a", "0.10"), pay("b", "0.20", false)], [], [], []).matched).toBe(false);
  });
  it("exige histórico suficiente para crescimento", () => {
    expect(evaluatePldRule("volume_growth", p, [pay("a", "100")], [], [], []).sufficient).toBe(false);
  });
  it("só considera saque pedido depois de recebimento no período configurado", () => {
    const w = [{ id: "w1", amount: "10", requestedAt: "2026-10-01T01:00:00Z" }, { id: "w2", amount: "10", requestedAt: "2026-10-01T01:30:00Z" }];
    expect(evaluatePldRule("rapid_withdrawal", p, [pay("a", "100")], [], w, []).matched).toBe(true);
    expect(evaluatePldRule("rapid_withdrawal", p, [pay("a", "100")], [], w.map(r => ({ ...r, requestedAt: "2026-09-30T23:00:00Z" })), []).matched).toBe(false);
  });
  it("conclusão exige justificativa e resultado", () => {
    expect(() => assertPldDecision("closed", "", "explained")).toThrow();
    expect(() => assertPldDecision("closed", "Conferido no provedor")).toThrow();
    expect(() => assertPldDecision("closed", "Conferido no provedor", "explained")).not.toThrow();
  });
});