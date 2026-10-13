import { describe, expect, it } from "vitest";
import { countFirstChargeCustomers, forecastNext30Days, isOverdue, summarize } from "./financial-summary";

describe("resumo financeiro compartilhado", () => {
  it("separa faturado, pago, aberto, vencido, taxas e líquido", () => {
    const result = summarize([
      { status: "paid", gross_amount: "350.00", net_amount: "346.02", due_on: "2026-09-29" },
      { status: "awaiting_payment", gross_amount: "100.00", due_on: "2026-10-10" },
      { status: "awaiting_payment", gross_amount: "80.00", due_on: "2026-09-01" },
      { status: "cancelled", gross_amount: "999.00", due_on: "2026-09-01" },
      { status: "failed", gross_amount: "999.00", due_on: "2026-09-01" },
    ], "2026-09-29");

    expect(result).toMatchObject({
      charged: 530,
      billed: 350,
      paid: 350,
      pending: 100,
      overdue: 80,
      fees: 3.98,
      net: 346.02,
      count: 3,
      paidCount: 1,
      overdueCount: 1,
    });
  });

  it("desconta reembolso do líquido uma única vez", () => {
    const result = summarize([
      { status: "refunded", gross_amount: 200, net_amount: 190, refunded_amount: 50 },
    ], "2026-09-29");

    expect(result.paid).toBe(200);
    expect(result.fees).toBe(10);
    expect(result.refunded).toBe(50);
    expect(result.net).toBe(140);
  });

  it("faturado e recebido contam só as pagas", () => {
    const result = summarize([
      { status: "paid", gross_amount: 250 },
      { status: "processing", gross_amount: 120, due_on: "2026-10-10" },
      { status: "overdue", gross_amount: 80, due_on: "2026-09-01" },
    ], "2026-09-29");

    expect(result.billed).toBe(250);
    expect(result.received).toBe(250);
    expect(result.charged).toBe(450);
    expect(result.pending).toBe(120);
    expect(result.overdue).toBe(80);
  });

  it("considera vencida somente a cobrança aberta antes de hoje", () => {
    expect(isOverdue({ status: "awaiting_payment", due_on: "2026-09-28" }, "2026-09-29")).toBe(true);
    expect(isOverdue({ status: "awaiting_payment", due_on: "2026-09-29" }, "2026-09-29")).toBe(false);
    expect(isOverdue({ status: "paid", due_on: "2026-09-01" }, "2026-09-29")).toBe(false);
  });

  it("contrato de R$ 6.000 em 6x com 1 parcela paga", () => {
    const rows = [
      { status: "paid", gross_amount: 1000, net_amount: 1000, due_on: "2026-09-10" },
      { status: "awaiting_payment", gross_amount: 1000, due_on: "2026-09-20" },
      ...[10, 11, 12, 13].map((m) => ({ status: "awaiting_payment", gross_amount: 1000, due_on: `2026-${m}-10` })),
    ];
    const r = summarize(rows, "2026-10-01");
    expect(r.contracted).toBe(6000);
    expect(r.received).toBe(1000);
    expect(r.billed).toBe(1000);
    expect(r.overdue).toBe(1000);
    expect(r.receivable).toBe(4000);
    expect(r.overdue + r.receivable).toBe(5000);
    expect(r.received).not.toBe(6000);
  });

  it("aviso de pagamento repetido não duplica receita (uma linha por parcela)", () => {
    const row = { status: "paid", gross_amount: 1000 };
    expect(summarize([row]).received).toBe(1000);
  });

  it("cobrança excluída não entra em nenhum total financeiro", () => {
    const result = summarize([
      { status: "cancelled", gross_amount: 950, due_on: "2026-10-05" },
      { status: "cancelled", gross_amount: 950, due_on: "2026-09-01" },
    ], "2026-10-02");

    expect(result).toMatchObject({
      contracted: 0,
      billed: 0,
      received: 0,
      receivable: 0,
      overdue: 0,
      count: 0,
    });
  });
});


describe("indicadores do painel", () => {
  const base = { status: "awaiting_payment", gross_amount: "100.10", platform_fee_amount: "3.01", created_at: "2026-10-01T12:00:00Z", due_on: "2026-10-13", installment_count: 3 };
  it("soma líquido por parcela e recorrência em centavos", () => {
    expect(forecastNext30Days([base, { ...base, installment_count: 1, subscription_id: "sub", net_amount: "90.10", refunded_amount: "1.01" }], "2026-10-13")).toMatchObject({ net: 186.18, count: 2 });
  });
  it("exclui avulsos, pagas, recusadas, estornadas, atrasadas e fim exclusivo", () => {
    const rows = ["paid", "refunded", "cancelled", "failed", "overdue"].map((status) => ({ ...base, status }));
    rows.push({ ...base, due_on: "2026-10-12" }, { ...base, due_on: "2026-11-12" }, { ...base, installment_count: 1 });
    expect(forecastNext30Days(rows, "2026-10-13")).toMatchObject({ net: 0, count: 0 });
    expect(forecastNext30Days([{ ...base, due_on: "2026-11-11" }], "2026-10-13").count).toBe(1);
  });
  it("não inventa ciclos nem saldo negativo", () => {
    expect(forecastNext30Days([], "2026-10-13").net).toBe(0);
    expect(forecastNext30Days([{ ...base, net_amount: 1, refunded_amount: 2 }], "2026-10-13").net).toBe(0);
  });
  it("conta primeira cobrança, não cadastro, uma vez por cliente", () => {
    const rows = [
      { ...base, customer_id: "old", created_at: "2026-09-01T12:00:00Z", status: "cancelled" },
      { ...base, customer_id: "old" }, { ...base, customer_id: "new" },
      { ...base, customer_id: "new", created_at: "2026-10-02T12:00:00Z" },
      { ...base, customer_id: "later", created_at: "2026-11-01T00:00:00Z" }, { ...base, customer_id: null },
    ];
    expect(countFirstChargeCustomers(rows, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"))).toBe(1);
  });
});
