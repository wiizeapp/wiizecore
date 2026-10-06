import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: any; userId: string };
const WRITE = ["owner", "admin", "finance"];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().positive().max(1e10).refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Máximo de 2 casas decimais");

async function membership(context: Ctx, write = false) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).limit(1).maybeSingle();
  if (!data || (write && !WRITE.includes(data.role))) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

const ERRORS: Record<string, string> = {
  limit_exceeded: "Essa compra passa do limite disponível do cartão.",
  card_unavailable: "Cartão bloqueado, arquivado ou inexistente.",
  already_paid: "Esta fatura já foi paga.",
  empty_invoice: "Esta fatura não tem compras para pagar.",
  invalid_account: "Escolha uma conta ativa da empresa.",
  invalid_transfer: "Escolha contas diferentes e um valor válido.",
  invoice_paid: "Esta compra tem parcela em fatura já paga e não pode ser cancelada.",
  invalid_target: "Escolha uma categoria de destino do mesmo tipo.",
  not_found: "Registro não encontrado.",
  duplicate_category: "Já existe uma categoria com esse nome neste nível.",
};
const friendly = (msg?: string, fallback = "Não foi possível concluir a operação.") => {
  const k = Object.keys(ERRORS).find((key) => msg?.includes(key));
  return k ? ERRORS[k]! : fallback;
};

async function rpc(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)(name, args);
  if (error) throw new Error(friendly(error.message));
  return { data, supabaseAdmin };
}

/* ------------------------------ Cartões ------------------------------ */

export const getCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx);
    const sb = ctx.supabase;
    const [cards, invoices, inst] = await Promise.all([
      sb.from("finance_cards").select("id, name, brand, last4, credit_limit, closing_day, due_day, pay_account_id, color, status").eq("tenant_id", m.tenant_id).order("created_at"),
      sb.from("finance_card_invoices").select("id, card_id, reference_month, closing_on, due_on, paid_at, paid_amount").eq("tenant_id", m.tenant_id).order("reference_month").limit(2000),
      sb.from("finance_card_installments").select("id, invoice_id, number, amount, purchase:finance_card_purchases!inner(id, description, purchased_on, installments, category_id, status, card_id)")
        .eq("tenant_id", m.tenant_id).limit(5000),
    ]);
    if (cards.error || invoices.error || inst.error) throw new Error("Não foi possível carregar os cartões.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const items = (inst.data ?? []).filter((i: any) => i.purchase?.status === "active");
    const byInvoice = new Map<string, any[]>();
    for (const i of items) byInvoice.set(i.invoice_id, [...(byInvoice.get(i.invoice_id) ?? []), i]);
    const invList: any[] = (invoices.data ?? []).map((iv: any) => {
      const rows = byInvoice.get(iv.id) ?? [];
      const cents = rows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
      const status = iv.paid_at ? "paid" : today > iv.due_on ? "overdue" : today >= iv.closing_on ? "closed" : "open";
      return {
        ...iv, total: cents / 100, status,
        items: rows.map((r) => ({ id: r.id, purchase_id: r.purchase.id, description: r.purchase.description, purchased_on: r.purchase.purchased_on, number: r.number, of: r.purchase.installments, amount: Number(r.amount), category_id: r.purchase.category_id })),
      };
    });
    return {
      canWrite: WRITE.includes(m.role),
      cards: (cards.data ?? []).map((c: any) => {
        const mine = invList.filter((iv) => iv.card_id === c.id);
        const used = mine.filter((iv) => !iv.paid_at).reduce((s, iv) => s + Math.round(iv.total * 100), 0) / 100;
        const limit = Number(c.credit_limit);
        const current = mine.find((iv) => iv.status === "open") ?? null;
        return { ...c, credit_limit: limit, used, available: Math.round((limit - used) * 100) / 100, current_total: current?.total ?? 0, invoices: mine };
      }),
    };
  });

const cardSchema = z.object({
  name: z.string().trim().min(1).max(60),
  brand: z.enum(["visa", "mastercard", "elo", "amex", "hipercard", "other"]),
  last4: z.string().regex(/^\d{4}$/, "Informe só os 4 últimos dígitos"),
  credit_limit: z.number().min(0).max(1e10),
  closing_day: z.number().int().min(1).max(28),
  due_day: z.number().int().min(1).max(28),
  pay_account_id: z.string().uuid().nullable(),
  color: z.enum(["slate", "green", "blue", "violet", "amber", "rose"]),
  status: z.enum(["active", "blocked", "archived"]).default("active"),
});

async function checkAccount(ctx: Ctx, tenant: string, id: string | null) {
  if (!id) return;
  const { data } = await ctx.supabase.from("finance_accounts").select("id").eq("id", id).eq("tenant_id", tenant).maybeSingle();
  if (!data) throw new Error(ERRORS["invalid_account"]);
}

export const saveCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cardSchema.extend({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    await checkAccount(ctx, m.tenant_id, data.pay_account_id);
    const { id, ...values } = data;
    const row = { ...values, credit_limit: values.credit_limit.toFixed(2) };
    const res = id
      ? await ctx.supabase.from("finance_cards").update(row).eq("id", id).eq("tenant_id", m.tenant_id).select("id").single()
      : await ctx.supabase.from("finance_cards").insert({ ...row, tenant_id: m.tenant_id, created_by: ctx.userId }).select("id").single();
    if (res.error) throw new Error("Não foi possível salvar o cartão.");
    return { id: res.data.id as string };
  });

export const addCardPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    card_id: z.string().uuid(), description: z.string().trim().min(1).max(120), amount: money, purchased_on: date,
    installments: z.number().int().min(1).max(48), category_id: z.string().uuid().nullable(), idempotency_key: z.string().min(16).max(80),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: id, supabaseAdmin } = await rpc("fin_card_purchase", {
      _tenant: m.tenant_id, _card: data.card_id, _description: data.description, _amount: data.amount, _date: data.purchased_on,
      _installments: data.installments, _category: data.category_id, _key: data.idempotency_key,
    });
    await logAudit(supabaseAdmin, { userId: ctx.userId, tenantId: m.tenant_id, action: "finance.card_purchase", resource: "finance_card_purchase", resourceId: id, metadata: { amount: data.amount, installments: data.installments } });
    return { id: id as string };
  });

export const cancelCardPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ purchase_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { supabaseAdmin } = await rpc("fin_cancel_card_purchase", { _tenant: m.tenant_id, _purchase: data.purchase_id });
    await logAudit(supabaseAdmin, { userId: ctx.userId, tenantId: m.tenant_id, action: "finance.card_purchase_cancel", resource: "finance_card_purchase", resourceId: data.purchase_id });
    return { ok: true };
  });

export const payInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoice_id: z.string().uuid(), account_id: z.string().uuid(), paid_on: date }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: id, supabaseAdmin } = await rpc("fin_pay_invoice", { _tenant: m.tenant_id, _invoice: data.invoice_id, _account: data.account_id, _paid_on: data.paid_on });
    await logAudit(supabaseAdmin, { userId: ctx.userId, tenantId: m.tenant_id, action: "finance.invoice_pay", resource: "finance_card_invoice", resourceId: data.invoice_id });
    return { entryId: id as string };
  });

/* --------------------------- Movimentações --------------------------- */

export const createTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().uuid(), to: z.string().uuid(), amount: money, date, description: z.string().trim().max(120).default("") }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: id, supabaseAdmin } = await rpc("fin_transfer", { _tenant: m.tenant_id, _from: data.from, _to: data.to, _amount: data.amount, _date: data.date, _description: data.description });
    await logAudit(supabaseAdmin, { userId: ctx.userId, tenantId: m.tenant_id, action: "finance.transfer", resource: "finance_transfer", resourceId: id, metadata: { amount: data.amount } });
    return { id: id as string };
  });

/** Cancela (pendente) ou estorna (pago). Transferências são desfeitas nos dois lados; nada é apagado. */
export const cancelEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { supabaseAdmin } = await rpc("fin_cancel_entry", { _tenant: m.tenant_id, _entry: data.id });
    await logAudit(supabaseAdmin, { userId: ctx.userId, tenantId: m.tenant_id, action: "finance.entry_cancel", resource: "finance_entry", resourceId: data.id });
    return { ok: true };
  });

export const getAccountStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx);
    const { data: rows, error } = await ctx.supabase.from("finance_entries")
      .select("id, direction, amount, description, due_on, paid_on, status, transfer_id, card_invoice_id")
      .eq("tenant_id", m.tenant_id).eq("account_id", data.account_id).order("due_on", { ascending: false }).limit(500);
    if (error) throw new Error("Não foi possível carregar o extrato.");
    return (rows ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) }));
  });

export const setAccountArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { error, count } = await ctx.supabase.from("finance_accounts").update({ archived: data.archived }, { count: "exact" }).eq("id", data.id).eq("tenant_id", m.tenant_id);
    if (error || !count) throw new Error("Não foi possível atualizar a conta.");
    return { ok: true };
  });

/* ----------------------------- Categorias ----------------------------- */

export const setCategoryFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), archived: z.boolean().optional(), is_default: z.boolean().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: cat } = await ctx.supabase.from("finance_categories").select("id, direction").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!cat) throw new Error("Categorias padrão não podem ser alteradas.");
    if (data.is_default) await ctx.supabase.from("finance_categories").update({ is_default: false }).eq("tenant_id", m.tenant_id).eq("direction", cat.direction);
    const patch: Record<string, boolean> = {};
    if (data.archived !== undefined) { patch["archived"] = data.archived; if (data.archived) patch["is_default"] = false; }
    if (data.is_default !== undefined) patch["is_default"] = data.is_default;
    const { error } = await ctx.supabase.from("finance_categories").update(patch).eq("id", data.id).eq("tenant_id", m.tenant_id);
    if (error) throw new Error("Não foi possível atualizar a categoria.");
    return { ok: true };
  });

/** Move as movimentações para outra categoria (ou "sem categoria") e depois exclui. */
export const moveAndDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), target_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { count } = await ctx.supabase.from("finance_categories").select("id", { count: "exact", head: true }).eq("tenant_id", m.tenant_id).eq("parent_id", data.id);
    if ((count ?? 0) > 0) throw new Error("Exclua ou mova as subcategorias primeiro.");
    const { data: moved, supabaseAdmin } = await rpc("fin_move_category", { _tenant: m.tenant_id, _from: data.id, _to: data.target_id });
    const { error } = await ctx.supabase.from("finance_categories").delete().eq("id", data.id).eq("tenant_id", m.tenant_id);
    if (error) throw new Error("Não foi possível excluir a categoria.");
    await logAudit(supabaseAdmin, { userId: ctx.userId, tenantId: m.tenant_id, action: "finance.category_delete", resource: "finance_category", resourceId: data.id, metadata: { moved, target: data.target_id } });
    return { moved: moved as number };
  });

const SUGGESTED: Record<"in" | "out", Record<string, string[]>> = {
  out: { Operacionais: ["Software", "Hospedagem", "Domínios"], Marketing: ["Google Ads", "Meta Ads", "Influenciadores"], Pessoal: ["Salários", "Benefícios"], Administrativo: ["Contabilidade", "Jurídico"] },
  in: { Vendas: ["Produto", "Serviço", "Assinatura"], Recebimentos: ["Pix", "Cartão", "Boleto"] },
};

/** Cria a estrutura sugerida, pulando o que já existe (idempotente). */
export const seedSuggestedCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const m = await membership(ctx, true);
    const { data: existing } = await ctx.supabase.from("finance_categories").select("id, name, direction, parent_id").eq("tenant_id", m.tenant_id);
    const all = [...(existing ?? [])] as { id: string; name: string; direction: string; parent_id: string | null }[];
    const find = (name: string, dir: string, parent: string | null) => all.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.direction === dir && c.parent_id === parent);
    let created = 0;
    for (const dir of ["in", "out"] as const) {
      for (const [root, subs] of Object.entries(SUGGESTED[dir])) {
        let parent = find(root, dir, null);
        if (!parent) {
          const { data: row, error } = await ctx.supabase.from("finance_categories").insert({ tenant_id: m.tenant_id, name: root, direction: dir, parent_id: null }).select("id, name, direction, parent_id").single();
          if (error) continue;
          parent = row; all.push(row); created++;
        }
        for (const sub of subs) {
          if (find(sub, dir, parent!.id)) continue;
          const { data: row, error } = await ctx.supabase.from("finance_categories").insert({ tenant_id: m.tenant_id, name: sub, direction: dir, parent_id: parent!.id }).select("id, name, direction, parent_id").single();
          if (!error && row) { all.push(row); created++; }
        }
      }
    }
    return { created };
  });
