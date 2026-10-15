import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };
const FINANCE = ["owner", "admin", "finance"];

async function membership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  if (!data) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}
async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Duas listas: coproduções que minha empresa criou e as que minha empresa participa. Campos mínimos. */
export const listCoproductions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context);
    const admin = await adminDb();
    const a = admin as any;
    const { data: mine } = await a.from("payment_coproductions").select("id, charge_group_id, status, split_error, created_at, payment_coproduction_participants(id, name, email, percentage, participation_type, fixed_amount, responsibility, status)").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(100);
    const { data: parts } = await a.from("payment_coproduction_participants").select("id, coproduction_id, tenant_id, percentage, responsibility, status, payment_coproductions(charge_group_id, status, created_at)").eq("participant_tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(100);
    const groups = [...new Set([...(mine ?? []).map((c: any) => c.charge_group_id), ...(parts ?? []).map((p: any) => p.payment_coproductions?.charge_group_id)].filter(Boolean))] as string[];
    const { data: pays } = groups.length ? await admin.from("payments").select("id, charge_group_id, tenant_id, description, gross_amount, status, installment_number, installment_count, due_on, customers(name)").in("charge_group_id", groups).order("due_on") : { data: [] as any[] };
    const ids = (pays ?? []).map((p: any) => p.id);
    const { data: splits } = ids.length ? await a.from("coproduction_splits").select("payment_id, participant_id, participant_tenant_id, amount, status, net_amount").in("payment_id", ids) : { data: [] };
    const tenantIds = [...new Set((parts ?? []).map((p: any) => p.tenant_id))] as string[];
    const { data: owners } = tenantIds.length ? await admin.from("tenants").select("id, name").in("id", tenantIds) : { data: [] as any[] };
    const byGroup = (g: string) => (pays ?? []).filter((p: any) => p.charge_group_id === g);
    const installments = (g: string, participantId?: string) => byGroup(g).map((p: any) => {
      const rows = (splits ?? []).filter((s: any) => s.payment_id === p.id && (!participantId || s.participant_id === participantId));
      return { number: p.installment_number ?? 1, count: p.installment_count ?? 1, status: p.status, dueOn: p.due_on, gross: Number(p.gross_amount), received: rows.reduce((t: number, s: any) => t + (s.status === "refunded" ? 0 : Number(s.amount)), 0), refunded: rows.some((s: any) => s.status === "refunded") };
    });
    const head = (g: string) => { const f = byGroup(g)[0] as any; return { service: f?.description ?? "Cobrança", customer: (f?.customers as any)?.name ?? "Cliente", total: byGroup(g).reduce((t: number, p: any) => t + Number(p.gross_amount), 0) }; };
    return {
      created: (mine ?? []).map((c: any) => ({ id: c.id, status: c.status, splitError: c.split_error, createdAt: c.created_at, ...head(c.charge_group_id), participants: c.payment_coproduction_participants ?? [], installments: installments(c.charge_group_id) })),
      participating: (parts ?? []).filter((p: any) => p.payment_coproductions).map((p: any) => ({
        id: p.coproduction_id, participantStatus: p.status, status: p.payment_coproductions.status, percentage: Number(p.percentage), responsibility: p.responsibility,
        owner: (owners ?? []).find((o: any) => o.id === p.tenant_id)?.name ?? "Empresa", ...head(p.payment_coproductions.charge_group_id),
        installments: installments(p.payment_coproductions.charge_group_id, p.id),
      })),
    };
  });

/** Convite visto pelo coprodutor: apenas o necessário (sem CPF, endereço ou documentos). */
export const getCoproductionInvite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context);
    const a = (await adminDb()) as any;
    const { data: part } = await a.from("payment_coproduction_participants").select("id, tenant_id, participant_user_id, percentage, participation_type, fixed_amount, responsibility, status, accepted_at, rejected_at, payment_coproductions(charge_group_id, status)").eq("coproduction_id", data.id).eq("participant_tenant_id", m.tenant_id).maybeSingle();
    if (!part) throw new Error("Convite não encontrado.");
    const g = part.payment_coproductions.charge_group_id;
    const { data: pays } = await a.from("payments").select("gross_amount, installment_count, description, customers(name)").eq("charge_group_id", g).neq("status", "cancelled");
    const { data: owner } = await a.from("tenants").select("name").eq("id", part.tenant_id).maybeSingle();
    return {
      owner: owner?.name ?? "Empresa", customer: pays?.[0]?.customers?.name ?? "Cliente", service: pays?.[0]?.description ?? "Cobrança",
      total: (pays ?? []).reduce((t: number, p: any) => t + Number(p.gross_amount), 0), installments: pays?.[0]?.installment_count ?? 1,
      percentage: Number(part.percentage), type: part.participation_type, fixedAmount: part.fixed_amount != null ? Number(part.fixed_amount) : null,
      responsibility: part.responsibility, status: part.status, coproductionStatus: part.payment_coproductions.status,
      canRespond: part.participant_user_id === context.userId && part.status === "pending" && part.payment_coproductions.status === "pending",
    };
  });

export const respondCoproduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const a = (await adminDb()) as any;
    const { data: part } = await a.from("payment_coproduction_participants").select("*, payment_coproductions(id, tenant_id, status, version)").eq("coproduction_id", data.id).eq("participant_user_id", context.userId).maybeSingle();
    // O aceite só vale para a conta autenticada que foi convidada.
    if (!part || part.status !== "pending" || part.payment_coproductions.status !== "pending") throw new Error("Este convite não está mais disponível.");
    const now = new Date().toISOString();
    const { logAudit } = await import("./audit.server");
    const { notifyTenant } = await import("./notify.server");
    const cp = part.payment_coproductions;
    if (!data.accept) {
      await a.from("payment_coproduction_participants").update({ status: "rejected", rejected_at: now, updated_at: now }).eq("id", part.id).eq("status", "pending");
      await a.from("payment_coproductions").update({ status: "rejected", updated_at: now }).eq("id", cp.id).eq("status", "pending");
      await a.from("coproduction_events").insert({ coproduction_id: cp.id, tenant_id: cp.tenant_id, participant_id: part.id, actor_user_id: context.userId, event: "rejected" });
      await logAudit(a, { tenantId: cp.tenant_id, userId: context.userId, action: "coproduction.rejected", resource: "payment_coproductions", resourceId: cp.id });
      await notifyTenant(a, { tenantId: cp.tenant_id, kind: "coproduction.rejected", dedupeKey: `coproduction.rejected:${part.id}`, link: "/coproducoes", title: "Coprodução recusada", body: `${part.name} recusou a coprodução. O pagamento segue bloqueado até você cancelar e criar uma nova configuração.`, email: { subject: "Coprodução recusada", lines: [] } });
      return { status: "rejected" };
    }
    const snapshot = { version: cp.version, percentage: part.percentage, participation_type: part.participation_type, fixed_amount: part.fixed_amount, responsibility: part.responsibility, accepted_at: now, user_id: context.userId };
    const { data: upd } = await a.from("payment_coproduction_participants").update({ status: "accepted", accepted_at: now, accepted_by: context.userId, accepted_snapshot: snapshot, updated_at: now }).eq("id", part.id).eq("status", "pending").select("id");
    if (!upd?.length) throw new Error("Este convite não está mais disponível.");
    await a.from("coproduction_events").insert({ coproduction_id: cp.id, tenant_id: cp.tenant_id, participant_id: part.id, actor_user_id: context.userId, event: "accepted", metadata: snapshot });
    await logAudit(a, { tenantId: cp.tenant_id, userId: context.userId, action: "coproduction.accepted", resource: "payment_coproductions", resourceId: cp.id, metadata: snapshot });
    const { data: all } = await a.from("payment_coproduction_participants").select("status").eq("coproduction_id", cp.id);
    if ((all ?? []).every((p: any) => p.status === "accepted")) {
      const { data: act } = await a.from("payment_coproductions").update({ status: "active", activated_at: now, updated_at: now }).eq("id", cp.id).eq("status", "pending").select("id");
      if (act?.length) {
        const { applySplitToOpenPayments } = await import("./coproduction.server");
        await applySplitToOpenPayments(a, cp.id).catch((e) => console.error("coproduction split", e instanceof Error ? e.message : "x"));
        await notifyTenant(a, { tenantId: cp.tenant_id, kind: "coproduction.active", dedupeKey: `coproduction.active:${cp.id}`, link: "/coproducoes", title: "Coprodução aceita", body: "Todos os coprodutores aceitaram. O link de pagamento foi liberado.", email: { subject: "Coprodução aceita — pagamento liberado", lines: [] } });
      }
    }
    return { status: "accepted" };
  });

/** Principal cancela a configuração (só sem nenhum pagamento confirmado). Nada é apagado. */
export const cancelCoproduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context);
    if (!FINANCE.includes(m.role)) throw new Error("Você não tem permissão para esta operação.");
    const a = (await adminDb()) as any;
    const { data: cp } = await a.from("payment_coproductions").select("id, tenant_id, charge_group_id, status, split_applied_at").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!cp || cp.status === "cancelled") throw new Error("Coprodução não encontrada.");
    const { count } = await a.from("payments").select("id", { count: "exact", head: true }).eq("charge_group_id", cp.charge_group_id).in("status", ["paid", "refunded", "processing", "in_analysis"]);
    if ((count ?? 0) > 0) throw new Error("Já existe pagamento nesta cobrança. A coprodução não pode mais ser cancelada; o histórico fica preservado.");
    const now = new Date().toISOString();
    await a.from("payment_coproductions").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", cp.id);
    await a.from("payment_coproduction_participants").update({ status: "cancelled", updated_at: now }).eq("coproduction_id", cp.id).in("status", ["pending", "accepted"]);
    // Se a divisão já estava no Asaas, volta a deixar só a taxa Wiize Core nas parcelas abertas.
    if (cp.split_applied_at) {
      const { getTenantProvider } = await import("./billing.server");
      const { splitFor } = await import("./coproduction.server");
      const conn = await getTenantProvider(a, cp.tenant_id);
      const { data: rows } = await a.from("payments").select("provider_payment_id, gross_amount, platform_fee_amount").eq("charge_group_id", cp.charge_group_id).in("status", ["created", "awaiting_payment", "overdue"]).not("provider_payment_id", "is", null);
      for (const r of rows ?? []) {
        await conn?.provider.updatePayment(r.provider_payment_id, { split: await splitFor(a, cp.charge_group_id, Number(r.gross_amount), Number(r.platform_fee_amount ?? 0)) }).catch((e) => console.error("coproduction unsplit", e instanceof Error ? e.message : "x"));
      }
    }
    await a.from("coproduction_events").insert({ coproduction_id: cp.id, tenant_id: cp.tenant_id, actor_user_id: context.userId, event: "cancelled" });
    const { logAudit } = await import("./audit.server");
    await logAudit(a, { tenantId: cp.tenant_id, userId: context.userId, action: "coproduction.cancelled", resource: "payment_coproductions", resourceId: cp.id });
    return { ok: true };
  });

/** Tenta de novo registrar a divisão no Asaas quando a primeira tentativa falhou. */
export const retryCoproductionSplit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context);
    if (!FINANCE.includes(m.role)) throw new Error("Você não tem permissão para esta operação.");
    const a = (await adminDb()) as any;
    const { data: cp } = await a.from("payment_coproductions").select("id").eq("id", data.id).eq("tenant_id", m.tenant_id).eq("status", "active").maybeSingle();
    if (!cp) throw new Error("Coprodução não encontrada.");
    const { applySplitToOpenPayments } = await import("./coproduction.server");
    await applySplitToOpenPayments(a, cp.id);
    return { ok: true };
  });
