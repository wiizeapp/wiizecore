import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Preferência do usuário: exigir código 2FA além da senha financeira em saques. */
export const getWithdrawalSecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_security_settings")
      .select("withdrawal_2fa_required, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { required: data?.withdrawal_2fa_required === true, updatedAt: data?.updated_at ?? null };
  });

/** Liga/desliga a exigência. Sempre pede senha financeira e sessão confirmada com 2FA (aal2). */
export const setWithdrawalSecurity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ required: z.boolean(), financialPassword: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertTwoFactor, assertFinancialPassword } = await import("./finance.server");
    assertTwoFactor(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit, logAudit, logSecurityEvent } = await import("./audit.server");
    const rl = await consumeRateLimit(supabaseAdmin, {
      scope: "withdrawal_2fa_toggle",
      identifier: context.userId,
      maxAttempts: 5,
      windowSeconds: 900,
      blockSeconds: 900,
    });
    if (!rl.allowed) throw new Error("Muitas tentativas. Aguarde 15 minutos.");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.financialPassword, "withdrawal_2fa.toggle");
    const { error } = await supabaseAdmin
      .from("user_security_settings")
      .upsert({ user_id: context.userId, withdrawal_2fa_required: data.required }, { onConflict: "user_id" });
    if (error) throw new Error("Não foi possível salvar a configuração.");
    await logAudit(supabaseAdmin, {
      userId: context.userId,
      action: data.required ? "withdrawal_2fa.enable" : "withdrawal_2fa.disable",
      resource: "user_security_settings",
      resourceId: context.userId,
    });
    await logSecurityEvent(supabaseAdmin, {
      userId: context.userId,
      eventType: data.required ? "withdrawal_2fa.enabled" : "withdrawal_2fa.disabled",
      severity: data.required ? "info" : "warning",
      metadata: {},
    });
    const { data: member } = await supabaseAdmin.from("tenant_members").select("tenant_id").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
    if (member) {
      await supabaseAdmin.from("notifications").insert({
        tenant_id: member.tenant_id,
        kind: "security.withdrawal_2fa",
        title: data.required ? "2FA para saques ativado" : "2FA para saques desativado",
        body: data.required ? "Saques agora pedem senha financeira e código do autenticador." : "Saques voltam a pedir apenas a senha financeira.",
        link: "/seguranca",
      });
    }
    return { required: data.required };
  });
