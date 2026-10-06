import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAccess } from "./team.functions";

/** Status da conexão do Wiize CRM com a empresa do usuário (derivado dos tokens OAuth). */
export const getIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await loadAccess(context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data } = await db
      .from("oauth_tokens")
      .select("created_at, scopes, access_expires_at, refresh_expires_at")
      .eq("tenant_id", access.tenantId)
      .is("revoked_at", null)
      .or(`access_expires_at.gt.${now},refresh_expires_at.gt.${now}`)
      .order("created_at", { ascending: true });
    const rows = data ?? [];
    return {
      canManage: access.role === "owner" || access.role === "admin",
      wiize: {
        active: rows.length > 0,
        connectedAt: rows[0]?.created_at ?? null,
        lastActivity: rows.at(-1)?.created_at ?? null,
        scopes: Array.from(new Set(rows.flatMap((r) => r.scopes ?? []))),
      },
    };
  });

/** Cancela a conexão: revoga todos os acessos do Wiize a esta empresa. */
export const disconnectWiizeCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await loadAccess(context.userId);
    if (access.role !== "owner" && access.role !== "admin") throw new Error("Somente o dono ou administrador pode cancelar integrações.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", access.tenantId)
      .is("revoked_at", null);
    if (error) throw new Error("Não foi possível cancelar a conexão.");
    await db.from("audit_logs").insert({
      tenant_id: access.tenantId, user_id: context.userId, action: "integration.wiize.disconnected",
      entity_type: "integration", metadata: {},
    } as never);
    return { ok: true };
  });
