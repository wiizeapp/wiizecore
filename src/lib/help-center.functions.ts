import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

export const SUGGESTION_CATEGORIES = ["feature", "improvement", "usage", "bug", "help_content", "fees", "other"] as const;
export const SUGGESTION_STATUSES = ["new", "analysis", "planned", "in_progress", "done", "rejected"] as const;
export const SUGGESTION_PRIORITIES = ["low", "medium", "high"] as const;

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

/** Cliente: grava uma sugestão ligada ao usuário logado e à empresa ativa (se houver). */
export const submitSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    category: z.enum(SUGGESTION_CATEGORIES),
    title: z.string().transform(clean).pipe(z.string().min(3).max(140)),
    description: z.string().transform(clean).pipe(z.string().min(10).max(4000)),
    extra: z.string().transform(clean).pipe(z.string().max(2000)).optional(),
    sourcePage: z.string().max(200).regex(/^\/[\w\-/.$]*$/).optional(),
    idempotencyKey: z.string().uuid(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin.from("feature_suggestions").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gte("created_at", since);
    if ((count ?? 0) >= 10) throw new Error("Você enviou muitas sugestões na última hora. Tente novamente mais tarde.");
    const { activeMember } = await import("./member-access.server");
    const member = await activeMember(context.userId).catch(() => null);
    const { data: row, error } = await supabaseAdmin.from("feature_suggestions").upsert({
      user_id: context.userId, tenant_id: member?.tenantId ?? null, category: data.category, title: data.title,
      description: data.description, extra: data.extra || null, source_page: data.sourcePage ?? null, idempotency_key: data.idempotencyKey,
    }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error) throw new Error("Não foi possível enviar sua sugestão agora. Tente novamente.");
    if (row) await supabaseAdmin.from("feature_suggestion_events").insert({ suggestion_id: row.id, actor_id: context.userId, action: "created", to_value: "new" });
    return { ok: true };
  });

/** Cliente: registra "Isso ajudou?" (uma resposta por artigo, pode mudar). */
export const rateArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().regex(/^[a-z0-9-]{2,120}$/), helpful: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("help_article_feedback").upsert({ user_id: context.userId, article_slug: data.slug, helpful: data.helpful, updated_at: new Date().toISOString() }, { onConflict: "user_id,article_slug" });
    if (error) throw new Error("Não foi possível registrar sua avaliação.");
    return { ok: true };
  });

async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe Wiize Core.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminListSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data, error } = await admin.from("feature_suggestions").select("id, user_id, tenant_id, category, title, description, source_page, status, priority, assigned_to, created_at, updated_at").order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error("Não foi possível carregar as sugestões.");
    const tenantIds = [...new Set((data ?? []).map((s) => s.tenant_id).filter(Boolean))] as string[];
    const { data: tenants } = tenantIds.length ? await admin.from("tenants").select("id, name").in("id", tenantIds) : { data: [] };
    const tn = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const userIds = [...new Set((data ?? []).flatMap((s) => [s.user_id, s.assigned_to]).filter(Boolean))] as string[];
    const emails = new Map<string, string>();
    await Promise.all(userIds.map(async (id) => { const { data: u } = await admin.auth.admin.getUserById(id); if (u?.user?.email) emails.set(id, u.user.email); }));
    return (data ?? []).map((s) => ({ ...s, tenant_name: s.tenant_id ? tn.get(s.tenant_id) ?? null : null, user_email: emails.get(s.user_id) ?? null, assigned_email: s.assigned_to ? emails.get(s.assigned_to) ?? null : null }));
  });

export const adminSuggestionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context as Ctx);
    const [{ data: s }, { data: notes }, { data: events }] = await Promise.all([
      admin.from("feature_suggestions").select("extra").eq("id", data.id).maybeSingle(),
      admin.from("feature_suggestion_notes").select("id, author_id, note, created_at").eq("suggestion_id", data.id).order("created_at"),
      admin.from("feature_suggestion_events").select("id, actor_id, action, from_value, to_value, created_at").eq("suggestion_id", data.id).order("created_at"),
    ]);
    const ids = [...new Set([...(notes ?? []).map((n) => n.author_id), ...(events ?? []).map((e) => e.actor_id)].filter(Boolean))] as string[];
    const emails = new Map<string, string>();
    await Promise.all(ids.map(async (id) => { const { data: u } = await admin.auth.admin.getUserById(id); if (u?.user?.email) emails.set(id, u.user.email); }));
    return {
      extra: s?.extra ?? null,
      notes: (notes ?? []).map((n) => ({ ...n, author: emails.get(n.author_id) ?? "Admin" })),
      events: (events ?? []).map((e) => ({ ...e, actor: e.actor_id ? emails.get(e.actor_id) ?? "—" : "—" })),
    };
  });

export const adminUpdateSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(SUGGESTION_STATUSES).optional(),
    priority: z.enum(SUGGESTION_PRIORITIES).optional(),
    assignToMe: z.boolean().optional(),
    unassign: z.boolean().optional(),
    note: z.string().transform(clean).pipe(z.string().min(1).max(4000)).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data: cur } = await admin.from("feature_suggestions").select("status, priority, assigned_to").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("Sugestão não encontrada.");
    const patch: { status?: string; priority?: string; assigned_to?: string | null } = {};
    const events: { suggestion_id: string; actor_id: string; action: string; from_value: string | null; to_value: string | null }[] = [];
    if (data.status && data.status !== cur.status) { patch.status = data.status; events.push({ suggestion_id: data.id, actor_id: context.userId, action: "status", from_value: cur.status, to_value: data.status }); }
    if (data.priority && data.priority !== cur.priority) { patch.priority = data.priority; events.push({ suggestion_id: data.id, actor_id: context.userId, action: "priority", from_value: cur.priority, to_value: data.priority }); }
    if (data.assignToMe && cur.assigned_to !== context.userId) { patch.assigned_to = context.userId; events.push({ suggestion_id: data.id, actor_id: context.userId, action: "assigned", from_value: cur.assigned_to, to_value: context.userId }); }
    if (data.unassign && cur.assigned_to) { patch.assigned_to = null; events.push({ suggestion_id: data.id, actor_id: context.userId, action: "unassigned", from_value: cur.assigned_to, to_value: null }); }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("feature_suggestions").update(patch).eq("id", data.id);
      if (error) throw new Error("Não foi possível atualizar a sugestão.");
    }
    if (data.note) {
      await admin.from("feature_suggestion_notes").insert({ suggestion_id: data.id, author_id: context.userId, note: data.note });
      events.push({ suggestion_id: data.id, actor_id: context.userId, action: "note", from_value: null, to_value: null });
    }
    if (events.length) await admin.from("feature_suggestion_events").insert(events);
    return { ok: true };
  });
