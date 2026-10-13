/**
 * Fonte única dos conceitos financeiros exibidos nas telas.
 * Definições oficiais (nunca misturar):
 * - Contratado: soma de todas as parcelas/ciclos emitidos e não cancelados (compromisso, não receita).
 * - Faturado = Recebido: somente parcelas pagas, cada uma pelo próprio valor (6x R$ 1.000 com 1 paga = R$ 1.000).
 * - Recebido (receita realizada): somente parcelas com pagamento confirmado pelo provedor.
 * - A receber: parcelas em aberto que ainda não venceram.
 * - Em atraso: parcelas em aberto com vencimento passado (não somam em "A receber").
 * Saldo vem só da carteira. Valores de contrato/serviço nunca entram como recebido.
 */
export const OPEN_STATUSES = ["created", "awaiting_payment", "processing", "in_analysis"] as const;
const PAID = ["paid", "refunded"];
const VOID = ["cancelled", "failed"];

export type SummaryRow = {
  status: string;
  gross_amount: number | string;
  net_amount?: number | string | null;
  platform_fee_amount?: number | string | null;
  refunded_amount?: number | string | null;
  due_on?: string | null;
};

/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
export function todayBR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function isOpen(status: string) {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** Vencido = marcado como vencido pelo provedor ou em aberto com vencimento anterior a hoje (Brasília). */
export function isOverdue(row: Pick<SummaryRow, "status" | "due_on">, today = todayBR()) {
  return row.status === "overdue" || (isOpen(row.status) && !!row.due_on && row.due_on < today);
}

export function daysLate(dueOn: string | null | undefined, today = todayBR()) {
  if (!dueOn) return 0;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(dueOn)) / 86_400_000));
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export type DashboardRow = SummaryRow & { created_at: string; customer_id?: string | null; subscription_id?: string | null; installment_count?: number | null };

/** Vencimentos reais: hoje inclusive, fim exclusivo; não inventa ciclos futuros. */
export function forecastNext30Days(rows: DashboardRow[], today = todayBR()) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  const endDay = end.toISOString().slice(0, 10);
  let net = 0;
  let count = 0;
  for (const row of rows) {
    if (!isOpen(row.status) || !row.due_on || row.due_on < today || row.due_on >= endDay) continue;
    if (!row.subscription_id && (row.installment_count ?? 1) <= 1) continue;
    const expected = row.net_amount != null ? cents(row.net_amount) : cents(row.gross_amount) - cents(row.platform_fee_amount);
    net += Math.max(0, expected - cents(row.refunded_amount));
    count++;
  }
  return { net: net / 100, count, start: today, end: endDay };
}

/** Issued installment/recurrence history by due month; not contractual MRR snapshots. */
export function monthlyIssuedNetHistory(rows: DashboardRow[], through = todayBR(), months = 12) {
  const [year, month] = through.slice(0, 7).split("-").map(Number);
  if (!year || !month || month > 12) return [];
  const series = Array.from({ length: months }, (_, i) => ({ month: new Date(Date.UTC(year, month - months + i, 1)).toISOString().slice(0, 7), netCents: 0, count: 0 }));
  const byMonth = new Map(series.map((entry) => [entry.month, entry]));
  for (const row of rows) {
    if (!row.subscription_id && (row.installment_count ?? 1) <= 1) continue;
    if (!isOpen(row.status) && row.status !== "overdue" && !PAID.includes(row.status)) continue;
    if (!row.due_on || !/^\d{4}-\d{2}-\d{2}$/.test(row.due_on)) continue;
    const entry = byMonth.get(row.due_on.slice(0, 7));
    if (!entry) continue;
    const net = row.net_amount != null ? cents(row.net_amount) : cents(row.gross_amount) - cents(row.platform_fee_amount);
    entry.netCents += Math.max(0, net - cents(row.refunded_amount));
    entry.count++;
  }
  return series.map(({ month, netCents, count }) => ({ month, net: netCents / 100, count }));
}

/** Primeira cobrança, inclusive histórico cancelado: não transforma antigo em novo. */
export function countFirstChargeCustomers(rows: DashboardRow[], start: Date, end: Date) {
  const first = new Map<string, number>();
  for (const row of rows) {
    if (!row.customer_id) continue;
    const time = Date.parse(row.created_at);
    if (!Number.isFinite(time)) continue;
    first.set(row.customer_id, Math.min(first.get(row.customer_id) ?? time, time));
  }
  return [...first.values()].filter((time) => time >= start.getTime() && time < end.getTime()).length;
}

export function summarize(rows: SummaryRow[], today = todayBR()) {
  const t = { charged: 0, billed: 0, pending: 0, overdue: 0, paid: 0, fees: 0, net: 0, refunded: 0, count: 0, paidCount: 0, overdueCount: 0 };
  for (const r of rows) {
    if (VOID.includes(r.status)) continue;
    const g = cents(r.gross_amount);
    t.charged += g;
    t.count++;
    if (PAID.includes(r.status)) {
      t.billed += g;
      t.paid += g;
      t.paidCount++;
      // Taxa = bruto − líquido (inclui custo do provedor e taxa WiizePay, como no extrato).
      const net = r.net_amount != null ? cents(r.net_amount) : g - cents(r.platform_fee_amount);
      t.fees += g - net;
      t.net += net;
    } else if (isOverdue(r, today)) {
      t.overdue += g;
      t.overdueCount++;
    } else if (isOpen(r.status)) {
      t.pending += g;
    }
    t.refunded += cents(r.refunded_amount);
  }
  const out = {} as Record<keyof typeof t | "contracted" | "received" | "receivable", number>;
  for (const [k, v] of Object.entries(t)) out[k as keyof typeof t] = k.endsWith("ount") ? v : v / 100;
  out.net = out.net - out.refunded;
  out.contracted = out.charged;
  out.received = out.paid;
  out.receivable = out.pending;
  return out as { contracted: number; received: number; receivable: number; charged: number; billed: number; pending: number; overdue: number; paid: number; fees: number; net: number; refunded: number; count: number; paidCount: number; overdueCount: number };
}
