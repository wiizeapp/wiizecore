import { describe, expect, it } from "vitest";
import { firstChargeCustomers, monthlyMrr, projectedMrr } from "./dashboard-mrr";

describe("indicadores MRR da empresa", () => {
  const rows = [
    { status: "paid", gross_amount: "1000", net_amount: "970", subscription_id: "s", due_on: "2026-05-10" },
    { status: "awaiting_payment", gross_amount: "1000", net_amount: "950", installment_count: 6, due_on: "2026-06-10" },
    { status: "paid", gross_amount: "2000", due_on: "2026-05-10" },
    { status: "cancelled", gross_amount: "9000", subscription_id: "s", due_on: "2026-05-10" },
  ];
  it("separa avulsos e cancelados, mantém líquido mensal emitido", () => {
    const series = monthlyMrr(rows, "2026-06");
    expect(series).toHaveLength(12);
    expect(series.find((item) => item.key === "2026-05")?.sold).toBe(970);
    expect(series.at(-1)?.sold).toBe(950);
  });
  it("projeção inclui só abertos nos próximos 30 dias", () => {
    expect(projectedMrr(rows, "2026-06-01")).toBe(95000);
    expect(projectedMrr(rows, "2026-06-11")).toBe(0);
  });
  it("conta novos clientes pela primeira cobrança, não pelas seguintes", () => {
    const charges = [
      { status: "paid", gross_amount: 10, customer_id: "a", created_at: "2026-05-01" },
      { status: "paid", gross_amount: 10, customer_id: "a", created_at: "2026-06-05" },
      { status: "awaiting_payment", gross_amount: 10, customer_id: "b", created_at: "2026-06-05" },
    ];
    expect(firstChargeCustomers(charges, new Date("2026-06-01"), new Date("2026-07-01"))).toBe(1);
  });
});