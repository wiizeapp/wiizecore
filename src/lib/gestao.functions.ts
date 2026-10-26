import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";

type Ctx = { supabase: any; userId: string };
const WRITE = ["owner", "admin", "finance"];

async function membership(context: Ctx, write = false) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "finance.view");
  if (!data || (write && !WRITE.includes(data.role))) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const AUTO_LABEL: Record<string, string> = {
  payment: "Recebimento WiizePay", platform_fee: "Taxa financeira", provider_fee: "Taxa financeira", refund: "Estorno",
  withdrawal: "Saque para o banco", adjustment: "Ajuste", anticipation: "Antecipação", anticipation_fee: "Taxa de antecipação",
};

export const getGestao = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx);
    const sb = ctx.supabase;
    const [acc, cat, ent, tx, pend, firstPayment, accountEntries, wallet] = await Promise.all([
      sb.from("finance_accounts").select("id, name, kind, opening_balance, institution_code, archived").eq("tenant_id", m.tenant_id).order("created_at"),
      sb.from("finance_categories").select("id, name, direction, tenant_id, parent_id, archived, is_default, level").order("name"),
      sb.from("finance_entries").select("id, direction, amount, description, category_id, account_id, due_on, paid_on, status, notes, cost_center, group_kind, group_index, group_total, transfer_id, card_invoice_id, competence_on")
        .eq("tenant_id", m.tenant_id).gte("due_on", data.from).lte("due_on", data.to).order("due_on", { ascending: false }).limit(1000),
      sb.from("transactions").select("id, kind, description, amount, occurred_at, payment_id").eq("tenant_id", m.tenant_id)
        .gte("occurred_at", `${data.from}T00:00:00-03:00`).lte("occurred_at", `${data.to}T23:59:59-03:00`).order("occurred_at", { ascending: false }).limit(1000),
      sb.from("finance_entries").select("direction, amount").eq("tenant_id", m.tenant_id).eq("status", "pending"),
      sb.from("payments").select("id").eq("tenant_id", m.tenant_id).in("status", ["paid", "refunded"]).limit(1).maybeSingle(),
      sb.from("finance_entries").select("account_id, direction, amount").eq("tenant_id", m.tenant_id).eq("status", "paid").not("account_id", "is", null),
      sb.from("wallets").select("available_balance").eq("tenant_id", m.tenant_id).maybeSingle(),
    ]);
    if (acc.error || cat.error || ent.error) throw new Error("Não foi possível carregar a gestão financeira.");
    // Tarifas do mesmo pagamento aparecem juntas como "Taxa WiizePay" (visual).
    const { mergeFeeRows } = await import("./tx-display");
    const auto = mergeFeeRows((tx.data ?? []) as any[]).map((t: any) => ({
      id: `auto-${t.id}`, auto: true, direction: Number(t.amount) >= 0 ? "in" : "out", amount: Math.abs(Number(t.amount)),
      description: t.kind === "payment" ? (t.description || AUTO_LABEL["payment"]) : (AUTO_LABEL[t.kind] ?? t.description ?? "Movimentação"),
      category_id: null, account_id: "wiizepay", due_on: String(t.occurred_at).slice(0, 10), paid_on: String(t.occurred_at).slice(0, 10), status: "paid",
      notes: null, cost_center: null, group_kind: null, group_index: null, group_total: null, transfer_id: null, card_invoice_id: null, competence_on: null,
    }));
    const pendingIn = (pend.data ?? []).filter((p: any) => p.direction === "in").reduce((s: number, p: any) => s + Number(p.amount), 0);
    const pendingOut = (pend.data ?? []).filter((p: any) => p.direction === "out").reduce((s: number, p: any) => s + Number(p.amount), 0);
    const movementsByAccount = new Map<string, number>();
    for (const entry of accountEntries.data ?? []) {
      if (!entry.account_id) continue;
      const cents = Math.round(Number(entry.amount) * 100) * (entry.direction === "in" ? 1 : -1);
      movementsByAccount.set(entry.account_id, (movementsByAccount.get(entry.account_id) ?? 0) + cents);
    }
    const accounts = (acc.data ?? []).map((account: any) => ({
      ...account,
      balance: (Math.round(Number(account.opening_balance) * 100) + (movementsByAccount.get(account.id) ?? 0)) / 100,
    }));
    return {
      canWrite: WRITE.includes(m.role),
      canCreateEntries: WRITE.includes(m.role) && Boolean(firstPayment.data),
      accounts,
      wiizePayBalance: wallet.data ? Number(wallet.data.available_balance) : null,
      categories: cat.data ?? [],
      entries: [...(ent.data ?? []).map((e: any) => ({ ...e, amount: Number(e.amount), auto: false })), ...auto]
        .sort((a, b) => (a.due_on < b.due_on ? 1 : -1)),
      pendingIn, pendingOut,
    };
  });

/** Sugere categoria e conta a partir do último lançamento com descrição parecida. */
export const suggestEntry = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80), direction: z.enum(["in", "out"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx);
    const safe = data.q.replace(/[%_,()]/g, " ");
    const { data: rows } = await ctx.supabase.from("finance_entries").select("description, category_id, account_id, amount")
      .eq("tenant_id", m.tenant_id).eq("direction", data.direction).ilike("description", `%${safe}%`).order("created_at", { ascending: false }).limit(20);
    const seen = new Set<string>();
    return (rows ?? []).filter((r: any) => { const k = r.description.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  });

const entrySchema = z.object({
  direction: z.enum(["in", "out"]),
  amount: z.number().positive().max(1e10),
  description: z.string().trim().min(1).max(120),
  category_id: z.string().uuid().nullable(),
  account_id: z.string().uuid().nullable(),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paid: z.boolean(),
  notes: z.string().max(500).nullable().optional(),
  cost_center: z.string().max(60).nullable().optional(),
  repeat: z.enum(["none", "installment", "recurring"]).default("none"),
  times: z.number().int().min(2).max(60).optional(),
});

export const createEntry = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => entrySchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: firstPayment, error: paymentError } = await ctx.supabase.from("payments").select("id")
      .eq("tenant_id", m.tenant_id).in("status", ["paid", "refunded"]).limit(1).maybeSingle();
    if (paymentError || !firstPayment) throw new Error("Novas movimentações serão liberadas após o primeiro pagamento recebido pela WiizePay.");
    const cents = Math.round(data.amount * 100);
    const n = data.repeat === "none" ? 1 : (data.times ?? 12);
    const groupId = n > 1 ? crypto.randomUUID() : null;
    const base = data.repeat === "installment" ? Math.floor(cents / n) : cents;
    const rows = Array.from({ length: n }, (_, i) => {
      const part = data.repeat === "installment" && i === n - 1 ? cents - base * (n - 1) : base;
      const due = addMonths(data.due_on, i);
      const paid = i === 0 && data.paid;
      return {
        tenant_id: m.tenant_id, direction: data.direction, amount: (part / 100).toFixed(2), description: data.description,
        category_id: data.category_id, account_id: data.account_id, due_on: due, competence_on: due, status: paid ? "paid" : "pending", paid_on: paid ? due : null,
        notes: data.notes || null, cost_center: data.cost_center || null, created_by: ctx.userId,
        group_id: groupId, group_index: n > 1 ? i + 1 : null, group_total: n > 1 ? n : null, group_kind: n > 1 ? data.repeat : null,
      };
    });
    const { error } = await ctx.supabase.from("finance_entries").insert(rows);
    if (error) throw new Error("Não foi possível salvar o lançamento.");
    return { count: n };
  });

export const setEntryStatus = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), paid: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: cur } = await ctx.supabase.from("finance_entries").select("status, transfer_id, card_invoice_id").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!cur || !["paid", "pending", "scheduled"].includes(cur.status)) throw new Error("Esta movimentação não pode ser alterada.");
    if (cur.transfer_id || cur.card_invoice_id) throw new Error("Transferências e pagamentos de fatura só podem ser estornados.");
    const { error } = await ctx.supabase.from("finance_entries").update({ status: data.paid ? "paid" : "pending", paid_on: data.paid ? today() : null })
      .eq("id", data.id).eq("tenant_id", m.tenant_id);
    if (error) throw new Error("Não foi possível atualizar.");
    return { ok: true };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { error, count } = await ctx.supabase.from("finance_entries").delete({ count: "exact" }).eq("id", data.id).eq("tenant_id", m.tenant_id)
      .in("status", ["pending", "scheduled", "cancelled"]).is("transfer_id", null).is("card_invoice_id", null);
    if (error || !count) throw new Error("Movimentações pagas não são excluídas: use Estornar para manter o histórico.");
    return { ok: true };
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(["bank", "cash", "wallet", "credit_card"]), opening_balance: z.number().min(-1e10).max(1e10), institution_code: z.string().trim().min(2).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: row, error } = await ctx.supabase.from("finance_accounts")
      .insert({ tenant_id: m.tenant_id, name: data.name, kind: data.kind, opening_balance: data.opening_balance.toFixed(2), institution_code: data.institution_code, created_by: ctx.userId }).select("id").single();
    if (error) throw new Error("Não foi possível criar a conta.");
    return row as { id: string };
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60), kind: z.enum(["bank", "cash", "wallet", "credit_card"]), opening_balance: z.number().min(-1e10).max(1e10), institution_code: z.string().trim().min(2).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { id, opening_balance, ...values } = data;
    const { error, count } = await ctx.supabase.from("finance_accounts").update({ ...values, opening_balance: opening_balance.toFixed(2) }, { count: "exact" }).eq("id", id).eq("tenant_id", m.tenant_id);
    if (error || !count) throw new Error("Não foi possível atualizar a conta.");
    return { ok: true };
  });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(60), direction: z.enum(["in", "out"]), parent_id: z.string().uuid().nullable().default(null) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    if (data.parent_id) {
      const { data: parent } = await ctx.supabase.from("finance_categories").select("id, direction, parent_id").eq("id", data.parent_id).eq("tenant_id", m.tenant_id).maybeSingle();
      if (!parent || parent.direction !== data.direction) throw new Error("Selecione uma categoria principal válida.");
    }
    const { data: row, error } = await ctx.supabase.from("finance_categories").insert({ tenant_id: m.tenant_id, ...data }).select("id").single();
    if (error) throw new Error(error.message?.includes("duplicate_category") ? "Já existe uma categoria com esse nome neste nível." : error.message?.includes("3 níveis") ? "A hierarquia permite até 3 níveis." : "Não foi possível criar a categoria.");
    return row as { id: string };
  });

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60), direction: z.enum(["in", "out"]), parent_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: current } = await ctx.supabase.from("finance_categories").select("id").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!current) throw new Error("Categorias padrão não podem ser alteradas.");
    if (data.parent_id) {
      const { data: parent } = await ctx.supabase.from("finance_categories").select("id, direction, parent_id").eq("id", data.parent_id).eq("tenant_id", m.tenant_id).maybeSingle();
      if (!parent || parent.direction !== data.direction || parent.id === data.id) throw new Error("Selecione uma categoria principal válida.");
    }
    const { error } = await ctx.supabase.from("finance_categories").update({ name: data.name, direction: data.direction, parent_id: data.parent_id }).eq("id", data.id).eq("tenant_id", m.tenant_id);
    if (error) throw new Error(error.message?.includes("duplicate_category") ? "Já existe uma categoria com esse nome neste nível." : error.message?.includes("3 níveis") ? "A hierarquia permite até 3 níveis." : "Não foi possível atualizar a categoria.");
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const [entries, children] = await Promise.all([
      ctx.supabase.from("finance_entries").select("id", { count: "exact", head: true }).eq("tenant_id", m.tenant_id).eq("category_id", data.id),
      ctx.supabase.from("finance_categories").select("id", { count: "exact", head: true }).eq("tenant_id", m.tenant_id).eq("parent_id", data.id),
    ]);
    if ((entries.count ?? 0) > 0) throw new Error("Esta categoria tem movimentações. Use Excluir para escolher para onde movê-las.");
    if ((children.count ?? 0) > 0) throw new Error("Exclua ou mova as subcategorias primeiro.");
    const { error, count } = await ctx.supabase.from("finance_categories").delete({ count: "exact" }).eq("id", data.id).eq("tenant_id", m.tenant_id);
    if (error || !count) throw new Error("Categorias padrão não podem ser excluídas.");
    return { ok: true };
  });
