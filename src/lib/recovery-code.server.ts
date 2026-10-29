type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Conditional write is the single-use claim shared by every backup-code flow. */
export async function claimRecoveryCode(admin: Admin, id: string, userId: string) {
  const consumedAt = new Date().toISOString();
  const { data, error } = await admin.from("mfa_recovery_codes")
    .update({ used_at: consumedAt }).eq("id", id).eq("user_id", userId)
    .is("used_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error("Este código reserva já foi utilizado.");
  return consumedAt;
}