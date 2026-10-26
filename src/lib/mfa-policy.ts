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
