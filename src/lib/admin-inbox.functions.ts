import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => any }; userId: string; claims: unknown };

async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe Wiize Recebe.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listInboundEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data, error } = await admin.from("inbound_emails").select("*").order("received_at", { ascending: false }).limit(200);
    if (error) throw new Error("Não foi possível carregar a caixa de entrada.");
    const ids = Array.from(new Set((data ?? []).map((m) => m.tenant_id).filter(Boolean))) as string[];
    const { data: tenants } = ids.length ? await admin.from("tenants").select("id, name").in("id", ids) : { data: [] };
    const names = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    return (data ?? []).map((m) => ({ ...m, links: (m.links as string[]) ?? [], tenant_name: m.tenant_id ? names.get(m.tenant_id) ?? null : null }));
  });

export const markInboundEmailRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context as Ctx);
    await admin.from("inbound_emails").update({ read_at: new Date().toISOString() }).eq("id", data.id).is("read_at", null);
    return { ok: true };
  });
