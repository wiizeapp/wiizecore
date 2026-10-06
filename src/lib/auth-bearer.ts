import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// Páginas públicas (checkout e portal do cliente) não usam login da empresa;
// pular a leitura da sessão evita esperas longas ao abrir essas páginas.
const PUBLIC_PREFIXES = ["/portal/", "/pagar/"];

// Funções liberadas antes do segundo fator (recuperação pelo código reserva).
const MFA_EXEMPT = new Set(["recoverWithCode"]);

function decodeClaims(token: string): { sub?: string; aal?: string } | null {
  try {
    const part = token.split(".")[1] ?? "";
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/** Anexa o token do usuário logado e, no servidor, exige o 2FA quando ele estiver ativo. */
export const attachBearer = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    if (typeof window !== "undefined" && PUBLIC_PREFIXES.some((p) => window.location.pathname.startsWith(p))) {
      return next({ headers: {} });
    }
    const session = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]).catch(() => null);
    const token = session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next, serverFnMeta }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const auth = getRequestHeader("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || MFA_EXEMPT.has(serverFnMeta?.name ?? "")) return next();
    const claims = decodeClaims(auth.slice(7));
    // A assinatura do token é validada depois pela autenticação de cada função.
    if (!claims?.sub || claims.aal === "aal2") return next();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: claims.sub });
    if ((data?.factors ?? []).some((f) => f.status === "verified")) {
      throw new Response("Verificação em duas etapas necessária.", { status: 401 });
    }
    return next();
  });
