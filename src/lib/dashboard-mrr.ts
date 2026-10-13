import { toCents } from "./dashboard-period";
import { isOpen, todayBR, type SummaryRow } from "./financial-summary";

type MrrRow = SummaryRow & { subscription_id?: string | null; installment_count?: number | null; customer_id?: string | null; created_at?: string | null };
const eligible = (row: MrrRow) => !["cancelled", "failed"].includes(row.status) && Boolean(row.subscription_id || (row.installment_count ?? 1) > 1);
const netCents = (row: MrrRow) => Math.max(0, (row.net_amount != null ? toCents(row.net_amount) : toCents(row.gross_amount) - toCents(row.platform_fee_amount)) - toCents(row.refunded_amount));

/** Projeção líquida emitida, não saldo nem faturamento realizado. */
export function projectedMrr(rows: MrrRow[], today = todayBR()) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  const until = end.toISOString().slice(0, 10);
  return rows.filter((row) => eligible(row) && isOpen(row.status) && row.due_on && row.due_on >= today && row.due_on < until).reduce((total, row) => total + netCents(row), 0);
}

/** Últimos 12 meses: valores líquidos das parcelas/recorrências emitidas por vencimento. */
export function monthlyMrr(rows: MrrRow[], lastMonth = todayBR().slice(0, 7), locale = "pt-BR") {
  const [year, month] = lastMonth.split("-").map(Number);
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!eligible(row) || !row.due_on) continue;
    const key = row.due_on.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + netCents(row));
  }
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 12 + index, 1, 12));
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" }), sold: (totals.get(key) ?? 0) / 100 };
  });
}

export function firstChargeCustomers(rows: MrrRow[], from: Date, to: Date) {
  const first = new Map<string, number>();
  for (const row of rows) {
    if (!row.customer_id || !row.created_at || ["cancelled", "failed"].includes(row.status)) continue;
    const timestamp = Date.parse(row.created_at);
    if (!Number.isFinite(timestamp)) continue;
    first.set(row.customer_id, Math.min(first.get(row.customer_id) ?? Infinity, timestamp));
  }
  return [...first.values()].filter((timestamp) => timestamp >= from.getTime() && timestamp < to.getTime()).length;
}