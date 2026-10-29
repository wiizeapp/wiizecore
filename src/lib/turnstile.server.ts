import { TURNSTILE_ACTION_CARD, allowedHostnames, verifyTurnstileToken, type TurnstileFailure } from "./turnstile";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const MESSAGES: Record<TurnstileFailure, string> = {
  missing_token: "Conclua a verificação de segurança antes de pagar.",
  invalid_token: "A verificação de segurança não foi aceita. Tente novamente.",
  expired_or_reused: "A verificação de segurança expirou. Faça a verificação novamente.",
  hostname_mismatch: "Verificação de segurança inválida para este endereço.",
  action_mismatch: "Verificação de segurança inválida para esta operação.",
  not_configured: "Pagamento com cartão temporariamente indisponível.",
  unavailable: "Não conseguimos confirmar a verificação de segurança agora. Tente novamente em instantes.",
};

/**
 * Exige um token Turnstile válido para tentar pagar com cartão. Chamado no servidor,
 * então uma chamada direta à função sem passar pela tela também é bloqueada.
 * Token de uso único: além da checagem oficial, o hash do token só é aceito uma vez.
 */
export async function requireTurnstile(admin: AdminClient, opts: { token: string | undefined; remoteIp: string | null; tenantId: string; paymentId: string }) {
  const { logAudit, consumeRateLimit } = await import("./audit.server");
  const result = await verifyTurnstileToken({
    token: opts.token,
    secret: process.env["TURNSTILE_SECRET_KEY"],
    remoteIp: opts.remoteIp,
    hostnames: allowedHostnames(process.env["TURNSTILE_ALLOWED_HOSTNAMES"]),
    expectedAction: TURNSTILE_ACTION_CARD,
  });
  if (!result.ok) {
    await logAudit(admin, { tenantId: opts.tenantId, action: "checkout.turnstile_rejected", resource: "payments", resourceId: opts.paymentId, metadata: { reason: result.reason } });
    throw new Error(MESSAGES[result.reason]);
  }
  const { tokenFingerprint } = await import("./crypto.server");
  const once = await consumeRateLimit(admin, { scope: "turnstile_token", identifier: tokenFingerprint(opts.token!), maxAttempts: 1, windowSeconds: 600, blockSeconds: 600 });
  if (!once.allowed) {
    await logAudit(admin, { tenantId: opts.tenantId, action: "checkout.turnstile_rejected", resource: "payments", resourceId: opts.paymentId, metadata: { reason: "expired_or_reused" } });
    throw new Error(MESSAGES.expired_or_reused);
  }
}
