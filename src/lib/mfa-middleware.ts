import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionHasMfa } from "./mfa-policy";

/**
 * Controle central: sessão válida + segundo fator confirmado nesta sessão (aal2).
 * Usado por todas as funções protegidas. Só as funções de configuração/recuperação do 2FA
 * e de aceite de convite usam `requireSupabaseAuth` diretamente.
 */
export const requireMfaAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (!sessionHasMfa(context.claims)) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { logAudit } = await import("./audit.server");
        await logAudit(supabaseAdmin, { userId: context.userId, action: "security.mfa_bypass_blocked", result: "blocked", origin: "backend" });
      } catch {
        // Falha ao registrar nunca libera o acesso.
      }
      throw new Error("Confirme a verificação em duas etapas para continuar.");
    }
    return next();
  });
