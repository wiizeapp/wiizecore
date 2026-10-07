import { effectivePermissions, type TeamRole } from "./permissions";

/**
 * Membro ATIVO do usuário, com permissões efetivas calculadas no servidor.
 * Cada usuário tem no máximo um vínculo ativo (índice único no banco), então a empresa é sempre a mesma.
 */
export async function activeMember(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: m } = await supabaseAdmin
    .from("tenant_members")
    .select("id, tenant_id, role, permissions, tenant_custom_roles(permissions)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!m) return null;
  const custom = (m.tenant_custom_roles as { permissions?: string[] } | null) ?? null;
  const role = m.role as TeamRole;
  return {
    memberId: m.id as string,
    tenantId: m.tenant_id as string,
    role,
    permissions: effectivePermissions(role, m.permissions ?? [], custom?.permissions ?? []),
  };
}

/** Exige vínculo ativo e a permissão pedida. Registra a recusa na auditoria. */
export async function requireModulePerm(userId: string, perm: string) {
  const access = await activeMember(userId);
  if (!access) throw new Error("Você não tem permissão para esta operação.");
  if (!access.permissions.includes(perm)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("./audit.server");
    await logAudit(supabaseAdmin, { tenantId: access.tenantId, userId, action: "permission.denied", result: "blocked", metadata: { perm } });
    throw new Error("Você não tem permissão para esta operação.");
  }
  return access;
}
