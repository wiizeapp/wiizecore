import { createHash } from "node:crypto";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type SaleTrigger = "created" | "updated" | "payment_received" | "overdue" | "cancelled" | "refunded";

/** Situações enviadas ao Wiize (código estável + texto em português). */
export const SALE_STATUS_LABELS = {
  awaiting_first_payment: "Aguardando 1º pagamento",
  active: "Em dia",
  paid: "Pago",
  overdue_installment: "Parcela em atraso",
  expired: "Vencido/expirado",
  cancelled: "Cancelado",
  refunded: "Estornado",
} as const;
export type SaleStatus = keyof typeof SALE_STATUS_LABELS;

type Pay = { status: string; gross_amount: number; due_on: string; paid_at: string | null; installment_count: number | null; installment_number: number | null };
const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, d: number) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

/** Regra pura da situação da venda a partir das parcelas. */
export function deriveSaleStatus(kind: "one_time" | "installment" | "recurring", pays: Pay[]): SaleStatus {
  const live = pays.filter((p) => !["cancelled", "failed"].includes(p.status));
  if (!live.length) return "cancelled";
  if (live.every((p) => p.status === "refunded")) return "refunded";
  const paid = live.filter((p) => p.status === "paid").length;
  const overdue = live.some((p) => p.status === "overdue");
  if (kind === "one_time") return paid ? "paid" : overdue ? "expired" : "awaiting_first_payment";
  if (overdue) return "overdue_installment";
  if (kind === "installment" && paid === live.length) return "paid";
  return paid ? "active" : "awaiting_first_payment";
}

/** A empresa só envia avisos se a Wiize estiver conectada (acesso OAuth válido). */
async function wiizeConnected(db: Db, tenantId: string) {
  const now = new Date().toISOString();
  const { data } = await db.from("oauth_tokens").select("id").eq("tenant_id", tenantId).is("revoked_at", null).gt("refresh_expires_at", now).limit(1);
  return (data?.length ?? 0) > 0;
}

export async function buildSalePayload(db: Db, tenantId: string, chargeGroupId: string) {
  const { data: rows } = await db
    .from("payments")
    .select("status, gross_amount, due_on, paid_at, installment_count, installment_number, subscription_id, customer_id, contract_id, service_id, method, description")
    .eq("tenant_id", tenantId).eq("charge_group_id", chargeGroupId)
    .order("due_on", { ascending: true });
  if (!rows?.length) return null;
  const first = rows[0]!;
  const subId = rows.find((r) => r.subscription_id)?.subscription_id ?? null;
  const count = Math.max(...rows.map((r) => r.installment_count ?? 1), rows.length);
  const kind: "one_time" | "installment" | "recurring" = subId ? "recurring" : count > 1 ? "installment" : "one_time";

  const [{ data: cust }, { data: link }, { data: sub }, { data: contract }, { data: service }] = await Promise.all([
    first.customer_id ? db.from("customers").select("name, document, email").eq("id", first.customer_id).eq("tenant_id", tenantId).maybeSingle() : Promise.resolve({ data: null }),
    first.customer_id ? db.from("wiize_customer_links").select("wiize_customer_id").eq("tenant_id", tenantId).eq("customer_id", first.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    subId ? db.from("subscriptions").select("amount, frequency, starts_on, ends_on, active").eq("id", subId).maybeSingle() : Promise.resolve({ data: null }),
    first.contract_id ? db.from("contracts").select("id, ends_on").eq("id", first.contract_id).eq("tenant_id", tenantId).maybeSingle() : Promise.resolve({ data: null }),
    first.service_id ? db.from("services").select("id, name").eq("id", first.service_id).eq("tenant_id", tenantId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const live = rows.filter((r) => !["cancelled", "failed"].includes(r.status));
  const base = live.length ? live : rows;
  const installmentValue = kind === "recurring" ? Number(sub?.amount ?? first.gross_amount) : Number(first.gross_amount);
  const total = kind === "installment" ? round2(base.reduce((s, r) => s + Number(r.gross_amount), 0)) : round2(kind === "one_time" ? Number(first.gross_amount) : installmentValue);
  const startsOn = (kind === "recurring" && sub?.starts_on) || first.due_on;
  const expiresOn = contract?.ends_on ?? (kind === "installment" ? addDays(startsOn, 30 * count) : null);
  const status = deriveSaleStatus(kind, rows as Pay[]);
  const paid = rows.filter((r) => r.status === "paid");
  const next = live.find((r) => ["created", "awaiting_payment", "overdue"].includes(r.status));

  return {
    sale_id: chargeGroupId,
    customer: link?.wiize_customer_id
      ? { source: "wiize", wiize_customer_id: link.wiize_customer_id }
      : { source: "wiizepay", name: cust?.name ?? null, document: cust?.document ?? null, email: cust?.email ?? null },
    type: kind, // one_time = à vista | installment = parcelado | recurring = recorrente
    type_label: kind === "one_time" ? "À vista" : kind === "installment" ? "Parcelado" : "Recorrente",
    total_amount: total,
    installment_amount: round2(installmentValue),
    installments: kind === "recurring" ? null : kind === "installment" ? count : 1, // null = indeterminado
    recurrence_frequency: kind === "recurring" ? sub?.frequency ?? "monthly" : null,
    starts_on: startsOn,
    expires_on: expiresOn, // null = indeterminado
    status,
    status_label: SALE_STATUS_LABELS[status],
    paid_installments: paid.length,
    amount_received: round2(paid.reduce((s, r) => s + Number(r.gross_amount), 0)),
    last_paid_at: paid.map((r) => r.paid_at).filter(Boolean).sort().at(-1) ?? null,
    next_due_on: next?.due_on ?? null,
    payment_method: first.method,
    description: first.description,
    service: service ? { id: service.id, name: service.name } : null,
    contract_id: contract?.id ?? null,
    currency: "BRL",
  };
}

/** Enfileira o aviso de venda para o Wiize. Nunca lança erro para não afetar a operação financeira. */
export async function enqueueWiizeSaleEvent(db: Db, tenantId: string, chargeGroupId: string, trigger: SaleTrigger) {
  try {
    if (!(await wiizeConnected(db, tenantId))) return;
    const data = await buildSalePayload(db, tenantId, chargeGroupId);
    if (!data) return;
    const type = `sale.${trigger}`;
    // Mesmo estado + mesmo motivo = mesmo aviso (sem duplicar em reprocessamentos).
    const eventId = `sevt_${createHash("sha256").update(`${chargeGroupId}:${type}:${JSON.stringify(data)}`).digest("hex").slice(0, 32)}`;
    const body = { event_id: eventId, type, occurred_at: new Date().toISOString(), data };
    await db.from("wiize_sale_events").upsert(
      { event_id: eventId, tenant_id: tenantId, charge_group_id: chargeGroupId, type, body: body as never },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("wiize sale enqueue", e instanceof Error ? e.message : "x");
  }
}

export function triggerForStatus(status: string): SaleTrigger {
  if (status === "paid") return "payment_received";
  if (status === "overdue") return "overdue";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  return "updated";
}
