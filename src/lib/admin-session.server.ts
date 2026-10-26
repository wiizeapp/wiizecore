import { getRequestHeader } from "@tanstack/react-start/server";
import { adminGrantValid } from "./admin-session-policy";
import { tokenFingerprint } from "./crypto.server";

export type AdminContext = { userId: string; claims: unknown; supabase: { rpc: (name: "has_role", args: { _user_id: string; _role: "platform_admin" }) => PromiseLike<{ data: unknown; error: unknown }> } };

export async function assertAdminPage(context: AdminContext, touch = false) {
  const claims = context.claims as { aal?: string; session_id?: string };
  const proof = getRequestHeader("x-wiize-admin-proof");
  const { data: role, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (roleError || !role || claims.aal !== "aal2" || !claims.session_id || !proof || proof.length < 40 || proof.length > 200) throw new Error("Confirme novamente o 2FA e a senha financeira para acessar o Admin.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: grant, error }, { data: credential, error: credError }, { data: factors, error: factorError }] = await Promise.all([
    supabaseAdmin.from("admin_page_sessions").select("*").eq("proof_hash", tokenFingerprint(proof)).eq("user_id", context.userId).maybeSingle(),
    supabaseAdmin.from("financial_credentials").select("updated_at, locked_until").eq("user_id", context.userId).maybeSingle(),
    supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId }),
  ]);
  const now = Date.now();
  if (error || credError || factorError || !grant || !credential || !factors?.factors.some(f => f.status === "verified") || credential.updated_at !== grant.credential_updated_at || (credential.locked_until && Date.parse(credential.locked_until) > now) || !adminGrantValid({ userId: grant.user_id, sessionId: grant.auth_session_id, issuedAt: Date.parse(grant.issued_at), lastActivity: Date.parse(grant.last_activity_at), revoked: Boolean(grant.revoked_at) }, context.userId, claims.session_id, now) || Date.parse(grant.expires_at) <= now) throw new Error("Confirme novamente o 2FA e a senha financeira para acessar o Admin.");
  if (touch) {
    const { error: updateError } = await supabaseAdmin.from("admin_page_sessions").update({ last_activity_at: new Date(now).toISOString() }).eq("id", grant.id).is("revoked_at", null);
    if (updateError) throw new Error("Não foi possível confirmar sua segurança agora.");
  }
  return { admin: supabaseAdmin, grant };
}