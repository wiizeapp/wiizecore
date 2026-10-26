import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Eventos de autenticação informados pela tela (origem "ui"), sempre ligados ao próprio usuário
 * da sessão validada no servidor. Lista fechada de tipos; nenhum código, senha ou token é aceito.
 * Funciona antes do 2FA (é usada durante login e configuração).
 */
const KINDS = ["auth.login_success", "auth.logout", "mfa.verify_failed", "mfa.setup_started", "mfa.setup_failed", "mfa.recovery_saved"] as const;

export const recordAuthEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: string }) => z.object({ kind: z.enum(KINDS) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit, logAudit, logSecurityEvent } = await import("./audit.server");
    const limit = await consumeRateLimit(supabaseAdmin, { scope: "auth_event", identifier: context.userId, maxAttempts: 30, windowSeconds: 600, blockSeconds: 600 });
    if (!limit.allowed) return { ok: false };
    const failed = data.kind.endsWith("_failed");
    await logAudit(supabaseAdmin, { userId: context.userId, action: data.kind, result: failed ? "failure" : "success", origin: "ui" });
    if (data.kind === "mfa.verify_failed") {
      const { count } = await supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true })
        .eq("user_id", context.userId).eq("action", "mfa.verify_failed").gte("created_at", new Date(Date.now() - 15 * 60000).toISOString());
      if ((count ?? 0) >= 5) await logSecurityEvent(supabaseAdmin, { userId: context.userId, eventType: "mfa.repeated_failures", severity: "warning", metadata: { count } });
    }
    return { ok: true };
  });

/** Falha de login (sem sessão). Guarda só um hash do e-mail; limitado por IP. */
export const recordLoginFailure = createServerFn({ method: "POST" })
  .inputValidator((i: { email: string }) => z.object({ email: z.string().trim().toLowerCase().max(200) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit, logAudit, logSecurityEvent, requestInfo } = await import("./audit.server");
    const { hashSecretValue } = await import("./crypto.server");
    const ip = requestInfo().ip ?? "unknown";
    const limit = await consumeRateLimit(supabaseAdmin, { scope: "login_failure_log", identifier: ip, maxAttempts: 20, windowSeconds: 600, blockSeconds: 900 });
    if (!limit.allowed) {
      await logSecurityEvent(supabaseAdmin, { eventType: "auth.login_bruteforce_suspected", severity: "warning" });
      return { ok: false };
    }
    const emailRef = hashSecretValue(`login:${data.email}`).slice(0, 16);
    await logAudit(supabaseAdmin, { action: "auth.login_failed", result: "failure", origin: "ui", metadata: { email_ref: emailRef } });
    return { ok: true };
  });
