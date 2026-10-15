import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

async function member(supabase: { from: (t: string) => any }, userId: string, roles: string[]) {
  const { data } = await supabase.from("tenant_members").select("tenant_id, role").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(userId, "integrations.view");
  if (!data) throw new Error("Empresa não encontrada.");
  if (!roles.includes(data.role)) throw new Error("Você não tem permissão para esta ação.");
  return data as { tenant_id: string; role: string };
}

export const getDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await member(context.supabase, context.userId, ["owner", "admin", "finance", "viewer"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./google-drive.server");
    const c = await d.getConnection(supabaseAdmin, m.tenant_id);
    return { configured: d.driveConfigured(), connected: Boolean(c), email: (c?.google_email ?? null) as string | null, since: (c?.updated_at ?? null) as string | null, canManage: ["owner", "admin"].includes(m.role) };
  });

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => input)
  .handler(async ({ data, context }) => {
    const m = await member(context.supabase, context.userId, ["owner", "admin"]);
    const d = await import("./google-drive.server");
    if (!d.driveConfigured()) throw new Error("A integração com o Google Drive ainda não foi configurada pela Wiize Core.");
    const { safeOrigin } = await import("./contract-docs.server");
    const origin = safeOrigin(data.origin);
    return { url: d.buildAuthUrl(origin, d.signState({ t: m.tenant_id, u: context.userId, o: origin })) };
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await member(context.supabase, context.userId, ["owner", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (await import("./google-drive.server")).revokeDrive(supabaseAdmin, m.tenant_id);
    await logAudit(supabaseAdmin, { tenantId: m.tenant_id, userId: context.userId, action: "google_drive.disconnected", resource: "google_drive_connections", resourceId: m.tenant_id });
    return { ok: true };
  });
