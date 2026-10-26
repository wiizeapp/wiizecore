import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "./mfa-middleware";
import { freshChallengeValid } from "./admin-session-policy";

export const beginAdminUnlock = createServerFn({ method: "POST" }).middleware([requireMfaAuth]).handler(async ({ context }) => {
  const { data: role, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  const sessionId = (context.claims as { session_id?: string }).session_id;
  if (error || !role || !sessionId) throw new Error("Acesso restrito à administração.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { consumeRateLimit } = await import("./audit.server");
  const rate = await consumeRateLimit(supabaseAdmin, { scope: "admin_unlock", identifier: context.userId, maxAttempts: 5, windowSeconds: 300, blockSeconds: 300 });
  if (!rate.allowed) throw new Error("Muitas tentativas. Aguarde antes de tentar novamente.");
  const [{ data: factors, error: factorError }, { data: credential, error: credError }] = await Promise.all([
    supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId }),
    supabaseAdmin.from("financial_credentials").select("user_id").eq("user_id", context.userId).maybeSingle(),
  ]);
  const factor = factors?.factors.find(f => f.status === "verified" && f.factor_type === "totp");
  if (factorError || credError || !factor) throw new Error("Confirme a configuração do autenticador na página Segurança.");
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Não foi possível confirmar sua segurança agora.");
  const response = await fetch(`${url}/auth/v1/factors/${factor.id}/challenge`, { method: "POST", headers: { apikey: key, Authorization: getRequestHeader("authorization") ?? "", "Content-Type": "application/json" }, body: JSON.stringify({ factorId: factor.id }) });
  if (!response.ok) throw new Error("Não foi possível iniciar a confirmação do autenticador.");
  const challenge = await response.json() as { id?: string };
  if (!challenge.id) throw new Error("Não foi possível iniciar a confirmação do autenticador.");
  const { data, error: insertError } = await supabaseAdmin.from("admin_unlock_challenges").insert({ user_id: context.userId, auth_session_id: sessionId, factor_id: factor.id, provider_challenge_id: challenge.id }).select("id").single();
  if (insertError || !data) throw new Error("Não foi possível iniciar a confirmação do autenticador.");
  return { challengeId: data.id, hasPassword: Boolean(credential) };
});

export const completeAdminUnlock = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), password: z.string().min(1).max(256), createPassword: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: role, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
    const sessionId = (context.claims as { session_id?: string }).session_id;
    if (roleError || !role || !sessionId) throw new Error("Acesso restrito à administração.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("./audit.server");
    const { data: challenge, error } = await supabaseAdmin.from("admin_unlock_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", data.challengeId).eq("user_id", context.userId).eq("auth_session_id", sessionId).is("consumed_at", null).select("*").maybeSingle();
    if (error || !challenge || !freshChallengeValid(Date.parse(challenge.created_at), false, Date.now())) throw new Error("A confirmação expirou. Tente novamente.");
    try {
      const [{ data: credential, error: credError }, { data: factors, error: factorsError }] = await Promise.all([
        supabaseAdmin.from("financial_credentials").select("password_hash, updated_at").eq("user_id", context.userId).maybeSingle(),
        supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId }),
      ]);
      if (credError || factorsError || !factors?.factors.some(f => f.id === challenge.factor_id && f.status === "verified")) throw new Error("Não foi possível confirmar sua segurança agora.");
      if (credential) {
        const { assertFinancialPassword } = await import("./finance.server");
        await assertFinancialPassword(supabaseAdmin, context.userId, data.password, "admin_unlock");
      } else {
        if (!data.createPassword) throw new Error("Cadastre sua senha financeira para continuar.");
        const { assertStrongPassword } = await import("./password-policy");
        assertStrongPassword(data.password, "A senha financeira");
      }
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) throw new Error("Não foi possível confirmar sua segurança agora.");
      const result = await fetch(`${url}/auth/v1/factors/${challenge.factor_id}/verify`, { method: "POST", headers: { apikey: key, Authorization: getRequestHeader("authorization") ?? "", "Content-Type": "application/json" }, body: JSON.stringify({ challenge_id: challenge.provider_challenge_id, code: data.code }) });
      if (!result.ok) throw new Error("Código do autenticador inválido ou expirado.");
      // Auth tokens returned by verification are deliberately never returned, logged or persisted here.
      const { hashSecretValue, randomToken, tokenFingerprint } = await import("./crypto.server");
      if (!credential) {
        const { error: createError } = await supabaseAdmin.from("financial_credentials").insert({ user_id: context.userId, password_hash: hashSecretValue(data.password) });
        if (createError) throw new Error("Não foi possível cadastrar sua senha financeira.");
      }
      const { data: current, error: currentError } = await supabaseAdmin.from("financial_credentials").select("updated_at").eq("user_id", context.userId).single();
      if (currentError || !current || (credential && current.updated_at !== credential.updated_at)) throw new Error("A segurança da conta mudou. Confirme novamente.");
      const proof = randomToken();
      const { data: grant, error: grantError } = await supabaseAdmin.from("admin_page_sessions").insert({ user_id: context.userId, auth_session_id: sessionId, proof_hash: tokenFingerprint(proof), credential_updated_at: current.updated_at }).select("expires_at").single();
      if (grantError || !grant) throw new Error("Não foi possível liberar o Admin.");
      await logAudit(supabaseAdmin, { userId: context.userId, action: "admin.page_unlocked", origin: "backend" });
      return { proof, expiresAt: grant.expires_at };
    } catch (err) {
      await logAudit(supabaseAdmin, { userId: context.userId, action: "admin.unlock_denied", result: "blocked", metadata: { reason_code: "verification_failed" } });
      throw err;
    }
  });

export const touchAdminPage = createServerFn({ method: "POST" }).middleware([requireMfaAuth]).handler(async ({ context }) => {
  const { assertAdminPage } = await import("./admin-session.server");
  await assertAdminPage(context, true);
  return { ok: true };
});

export const closeAdminPage = createServerFn({ method: "POST" }).middleware([requireMfaAuth]).handler(async ({ context }) => {
  const { assertAdminPage } = await import("./admin-session.server");
  const { admin, grant } = await assertAdminPage(context);
  const { error } = await admin.from("admin_page_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", grant.id);
  if (error) throw new Error("Não foi possível encerrar o acesso.");
  return { ok: true };
});