import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { assertStrongPassword } from "./password-policy";
import { consumeRateLimit, logAudit, logSecurityEvent } from "./audit.server";

function assertStrongFinancialPassword(value: string) {
  assertStrongPassword(value, "A senha financeira");
}

export const getSecurityStatus = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: credential }, { count: unusedCodes }] = await Promise.all([
      supabaseAdmin
        .from("financial_credentials")
        .select("created_at, updated_at, last_used_at, locked_until")
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("mfa_recovery_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("used_at", null),
    ]);

    return {
      hasFinancialPassword: Boolean(credential),
      financialPasswordUpdatedAt: credential?.updated_at ?? null,
      financialPasswordLockedUntil: await (await import("./finance.server")).getFinancialLockUntil(supabaseAdmin, context.userId),
      recoveryCodesAvailable: unusedCodes ?? 0,
    };
  });

/** Cria ou troca a senha financeira. Nunca guardamos o valor em texto puro. */
export const setFinancialPassword = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { newPassword: string; currentPassword?: string }) => {
    assertStrongFinancialPassword(input.newPassword ?? "");
    return { newPassword: input.newPassword, currentPassword: input.currentPassword ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashSecretValue } = await import("./crypto.server");

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("financial_credentials")
      .select("password_hash")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lookupError) throw new Error("Não foi possível confirmar sua segurança agora. Tente novamente.");

    if (existing) {
      const limit = await consumeRateLimit(supabaseAdmin, {
        scope: "financial_password_change",
        identifier: context.userId,
        maxAttempts: 5,
        windowSeconds: 900,
        blockSeconds: 900,
      });
      if (!limit.allowed) {
        await logSecurityEvent(supabaseAdmin, {
          userId: context.userId,
          eventType: "financial_password.change_blocked",
          severity: "warning",
        });
        throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
      }
      await (await import("./finance.server")).assertFinancialPassword(supabaseAdmin, context.userId, data.currentPassword ?? "", "financial_password.change");
    }

    const replacement = {
        user_id: context.userId,
        password_hash: hashSecretValue(data.newPassword),
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      };
    // Insert cannot overwrite a concurrent first setup. Conditional update cannot
    // overwrite a credential changed since the current password was validated.
    const write = existing
      ? supabaseAdmin.from("financial_credentials").update(replacement).eq("user_id", context.userId).eq("password_hash", existing.password_hash)
      : supabaseAdmin.from("financial_credentials").insert(replacement);
    const { data: saved, error } = await write.select("user_id").single();
    if (error || !saved) throw new Error("Não foi possível salvar a senha financeira.");

    await logAudit(supabaseAdmin, {
      userId: context.userId,
      action: existing ? "financial_password.changed" : "financial_password.created",
    });
    return { ok: true };
  });

/**
 * Valida a senha financeira antes de uma operação sensível.
 * Bloqueia o sistema por 60 minutos após 3 tentativas erradas.
 */
export const verifyFinancialPassword = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { password: string; purpose?: string }) => ({
    password: input.password ?? "",
    purpose: input.purpose ?? "generic",
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertFinancialPassword } = await import("./finance.server");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.password, data.purpose);
    return { ok: true };
  });

/** Emite o único código reserva da conta. O valor só é devolvido nesta chamada. */
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashSecretValue, randomRecoveryCode } = await import("./crypto.server");
    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
    const verified = (factors?.factors ?? []).filter((factor) => factor.status === "verified");
    if (!verified.length) {
      throw new Error("Ative e confirme o 2FA antes de emitir o código reserva.");
    }

    const { data: existing } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .select("id, single_issued_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    // Um novo autenticador (2FA reativado) recebe um novo código reserva; o mesmo autenticador nunca.
    const newestFactor = Math.max(...verified.map((f) => new Date(f.created_at).getTime()));
    const prevIssued = existing?.single_issued_at ?? null;
    if (prevIssued && new Date(prevIssued).getTime() >= newestFactor) {
      throw new Error("O código reserva já foi emitido e não pode ser mostrado ou gerado novamente.");
    }

    const code = randomRecoveryCode();
    const issuedAt = new Date().toISOString();
    const payload = { code_hash: hashSecretValue(code), used_at: null, single_issued_at: issuedAt };
    const update = existing
      ? supabaseAdmin.from("mfa_recovery_codes").update(payload).eq("id", existing.id)
      : null;
    const result = update
      ? await (prevIssued ? update.eq("single_issued_at", prevIssued) : update.is("single_issued_at", null)).select("id").maybeSingle()
      : await supabaseAdmin.from("mfa_recovery_codes").insert({ user_id: context.userId, ...payload }).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Não foi possível emitir o código reserva.");

    await logAudit(supabaseAdmin, { userId: context.userId, action: "mfa.recovery_code.issued" });
    return { codes: [code] };
  });

/** Registra no histórico que a verificação em duas etapas mudou de estado. */
export const recordMfaChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: Boolean(input.enabled) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.enabled) {
      const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
      if ((factors?.factors ?? []).some((factor) => factor.status === "verified")) {
        throw new Error("Confirme o código do autenticador ou o código reserva antes de desativar.");
      }
      await supabaseAdmin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("user_id", context.userId).is("used_at", null);
    }
    await logAudit(supabaseAdmin, {
      userId: context.userId,
      action: data.enabled ? "mfa.enabled" : "mfa.disabled",
    });
    await logSecurityEvent(supabaseAdmin, {
      userId: context.userId,
      eventType: data.enabled ? "mfa.enabled" : "mfa.disabled",
      severity: data.enabled ? "info" : "warning",
    });
    return { ok: true };
  });
