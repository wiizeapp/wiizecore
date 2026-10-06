import { describe, expect, it } from "vitest";
import { balanceLevel, planCost, sanitizeSteps, toAsaasNotifications } from "./dunning-rules";

describe("régua de cobrança", () => {
  it("remove canais fora do plano", () => {
    const s = sanitizeSteps({ before: ["whatsapp", "sms", "voice"], beforeOffset: 5 }, "essential");
    expect(s.before).toEqual(["whatsapp"]);
    expect(sanitizeSteps({ overdue: ["voice"] }, "smart").overdue).toEqual([]);
    expect(sanitizeSteps({ overdue: ["voice"] }, "intensive").overdue).toEqual(["voice"]);
  });
  it("rejeita antecedência não suportada", () => {
    expect(sanitizeSteps({ beforeOffset: 3 }, "smart").beforeOffset).toBe(5);
  });
  it("mantém até dois lembretes anteriores válidos", () => {
    expect(sanitizeSteps({ beforeOffsets: [15, 5, 3] }, "smart").beforeOffsets).toEqual([15, 5]);
  });
  it("níveis de saldo", () => {
    const t = { alert: 10, critical: 5 };
    expect(balanceLevel(20, t, 2.99)).toBe("normal");
    expect(balanceLevel(8, t, 2.99)).toBe("low");
    expect(balanceLevel(4, t, 2.99)).toBe("critical");
    expect(balanceLevel(2, t, 2.99)).toBe("insufficient");
  });
  it("custo não é inventado", () => {
    expect(planCost("smart", { whatsapp: 0.1, sms: 0.2 })).toBeNull();
    expect(planCost("smart", { whatsapp: 0.1, sms: 0.2, email: 0.01 })).toBeCloseTo(0.31);
  });
  it("desliga todos os avisos quando a régua não se aplica", () => {
    const out = toAsaasNotifications([{ id: "a", event: "PAYMENT_CREATED" }], null);
    expect(out[0]).toMatchObject({ enabled: false, whatsappEnabledForCustomer: false });
  });
  it("configura dois avisos prévios somente quando o provedor oferece duas posições", () => {
    const steps = sanitizeSteps({ beforeOffsets: [15, 5], before: ["whatsapp", "email"] }, "smart");
    const out = toAsaasNotifications([
      { id: "a", event: "PAYMENT_DUEDATE_WARNING", scheduleOffset: 10 },
      { id: "b", event: "PAYMENT_DUEDATE_WARNING", scheduleOffset: 0 },
    ], steps);
    expect(out).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "a", scheduleOffset: 15, whatsappEnabledForCustomer: true }),
      expect.objectContaining({ id: "b", scheduleOffset: 5, emailEnabledForCustomer: true }),
    ]));
  });
});
