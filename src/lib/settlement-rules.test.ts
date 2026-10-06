import { describe, expect, it } from "vitest";
import { calculateEstimatedAvailability as calc, isBusinessDay } from "./settlement-rules";

describe("calculateEstimatedAvailability", () => {
  it("Pix pago na sexta libera na segunda", () => {
    expect(calc({ paymentMethod: "pix", confirmedAt: "2026-09-25T15:00:00Z" }).estimated_available_at).toBe("2026-09-28");
  });
  it("Pix antes de feriado pula o feriado (Finados 02/11/2026 é segunda)", () => {
    expect(calc({ paymentMethod: "pix", confirmedAt: "2026-10-30T15:00:00Z" }).estimated_available_at).toBe("2026-11-03");
  });
  it("Débito: 3 dias úteis", () => {
    expect(calc({ paymentMethod: "debit_card", confirmedAt: "2026-09-24T15:00:00Z" }).estimated_available_at).toBe("2026-09-29");
  });
  it("Crédito à vista: 32 dias corridos ajustados para dia útil", () => {
    const r = calc({ paymentMethod: "credit_card", confirmedAt: "2026-09-25T15:00:00Z" });
    expect(r.estimated_available_at).toBe("2026-10-27");
    expect(r.estimated_rule).toBe("credit_card_32_days");
  });
  it("Parcelado: cada parcela a cada 32 dias", () => {
    const p2 = calc({ paymentMethod: "credit_card", paymentDate: "2026-09-25T15:00:00Z", confirmedAt: "2026-09-25T15:00:00Z", installmentNumber: 2, installmentCount: 3 });
    expect(p2.estimated_available_at).toBe("2026-11-30"); // 28/11 é sábado
  });
  it("Carnaval 2027 não é dia útil", () => {
    expect(isBusinessDay(new Date("2027-02-09T00:00:00Z"))).toBe(false);
  });
});

import { summarize, isOverdue, daysLate } from "./financial-summary";
describe("resumo financeiro único", () => {
  const today = "2026-09-29";
  const rows = [
    { status: "paid", gross_amount: 1000, net_amount: 970.01, platform_fee_amount: 29.99, due_on: "2026-09-01" },
    { status: "awaiting_payment", gross_amount: 500, due_on: "2026-10-10" },
    { status: "awaiting_payment", gross_amount: 300, due_on: "2026-09-20" },
    { status: "overdue", gross_amount: 200, due_on: "2026-09-10" },
    { status: "cancelled", gross_amount: 999, due_on: "2026-09-10" },
    { status: "refunded", gross_amount: 100, net_amount: 97, platform_fee_amount: 3, refunded_amount: 97, due_on: "2026-09-02" },
  ];
  it("separa faturado, pago, pendente, vencido, taxas e líquido", () => {
    const t = summarize(rows, today);
    expect(t.charged).toBe(2100);
    expect(t.billed).toBe(1100);
    expect(t.paid).toBe(1100);
    expect(t.pending).toBe(500);
    expect(t.overdue).toBe(500);
    expect(t.fees).toBe(32.99);
    expect(t.net).toBe(970.01);
    expect(t.refunded).toBe(97);
  });
  it("vencido considera horário de Brasília e dias de atraso", () => {
    expect(isOverdue({ status: "awaiting_payment", due_on: "2026-09-28" }, today)).toBe(true);
    expect(isOverdue({ status: "awaiting_payment", due_on: today }, today)).toBe(false);
    expect(daysLate("2026-09-20", today)).toBe(9);
  });
});
