/**
 * Política única de acesso da área logada (sem dependências de servidor).
 * Ordem: login → configurar 2FA → confirmar 2FA na sessão → onboarding → painel.
 */
export type AccessStage = "signed_out" | "mfa_setup" | "mfa_verify" | "onboarding" | "ready";

export function accessStage(input: {
  signedIn: boolean;
  aal: string | null | undefined;
  hasVerifiedFactor: boolean;
  onboardingDone: boolean;
}): AccessStage {
  if (!input.signedIn) return "signed_out";
  if (!input.hasVerifiedFactor) return "mfa_setup";
  if (input.aal !== "aal2") return "mfa_verify";
  if (!input.onboardingDone) return "onboarding";
  return "ready";
}

/** Sessão só é aceita pelo servidor quando o segundo fator foi confirmado nela. */
export function sessionHasMfa(claims: unknown): boolean {
  return (claims as { aal?: string } | null)?.aal === "aal2";
}

/** E-mail confirmado segundo o estado atual da conta lido no servidor (Google já chega confirmado). */
export function emailIsConfirmed(user: { email_confirmed_at?: string | null } | null | undefined): boolean {
  const at = user?.email_confirmed_at;
  return typeof at === "string" && at.length > 0 && !Number.isNaN(Date.parse(at));
}

/** Traduz erros de link de confirmação sem revelar se a conta existe. */
export function confirmationLinkProblem(params: URLSearchParams): "expired" | "invalid" | null {
  const code = params.get("error_code");
  if (!code && !params.get("error")) return null;
  return code === "otp_expired" ? "expired" : "invalid";
}

export const RESEND_COOLDOWN_MS = 60_000;
export const RESEND_MAX_PER_PAGE = 3;
export function canResend(sent: number[], now: number): boolean {
  if (sent.length >= RESEND_MAX_PER_PAGE) return false;
  const last = sent[sent.length - 1];
  return last === undefined || now - last >= RESEND_COOLDOWN_MS;
}
