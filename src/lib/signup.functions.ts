import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signupSchema, SIGNUP_LIMITS, SIGNUP_TURNSTILE_MESSAGES } from "./signup-rules";

/**
 * Cadastro protegido: dados validados no servidor, CAPTCHA (Turnstile, ação "signup")
 * e limites por IP confiável e por e-mail antes de criar a conta. A confirmação de
 * e-mail continua obrigatória. Resposta neutra para e-mail já cadastrado.
 */
export const signUpProtected = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => signupSchema.extend({ turnstileToken: z.string().max(2048).optional(), next: z.string().max(2000).optional() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit, requestInfo, logAudit } = await import("./audit.server");
    const { tokenFingerprint } = await import("./crypto.server");
    const ip = requestInfo().ip;
    const email = data.email.toLowerCase();
    const [byIp, byEmail] = await Promise.all([
      consumeRateLimit(admin, { scope: "signup_ip", identifier: ip ?? "unknown", ...SIGNUP_LIMITS.ip }),
      consumeRateLimit(admin, { scope: "signup_email", identifier: tokenFingerprint(`signup:${email}`), ...SIGNUP_LIMITS.email }),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      await logAudit(admin, { action: "auth.signup_rate_limited", resource: "auth", metadata: { scope: !byIp.allowed ? "ip" : "email" } });
      throw new Error("Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.");
    }
    const { requireTurnstileFor } = await import("./turnstile.server");
    const { TURNSTILE_ACTION_SIGNUP } = await import("./turnstile");
    await requireTurnstileFor(admin, { token: data.turnstileToken, remoteIp: ip, action: TURNSTILE_ACTION_SIGNUP, auditAction: "auth.signup_turnstile_rejected", resource: "auth", messages: SIGNUP_TURNSTILE_MESSAGES });

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const pub = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); } },
    });
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { safeOrigin } = await import("./contract-docs.server");
    const origin = safeOrigin(getRequestHeader("origin") ?? undefined);
    const next = data.next && data.next.startsWith("/oauth/authorize?") && !data.next.startsWith("//") ? data.next : undefined;
    const { data: res, error } = await pub.auth.signUp({
      email, password: data.password,
      options: { emailRedirectTo: `${origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`, data: { full_name: data.fullName } },
    });
    if (error) {
      if (/already registered/i.test(error.message)) return { duplicate: true };
      await logAudit(admin, { action: "auth.signup_failed", resource: "auth", metadata: { code: (error as { code?: string }).code ?? "unknown" } });
      throw new Error(/password/i.test(error.message) ? "Escolha uma senha diferente: esta não é aceita por segurança." : "Não foi possível criar a conta. Tente novamente.");
    }
    const duplicate = Boolean(res.user && (res.user.identities?.length ?? 0) === 0);
    await logAudit(admin, { userId: duplicate ? null : res.user?.id ?? null, action: duplicate ? "auth.signup_duplicate" : "auth.signup_created", resource: "auth", metadata: {} });
    return { duplicate };
  });
