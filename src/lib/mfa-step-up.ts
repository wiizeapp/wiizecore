import { supabase } from "@/integrations/supabase/client";

/** Retorna se a sessão já está com 2FA confirmado e se o usuário tem 2FA ativo. */
export async function getMfaState() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const factors = await supabase.auth.mfa.listFactors();
  const totp = factors.data?.totp?.find((f) => f.status === "verified") ?? null;
  return { isAal2: data?.currentLevel === "aal2", factorId: totp?.id ?? null };
}

/** Eleva a sessão para aal2 com o código do app autenticador, se necessário. */
/** 2FA é opcional para usuários: só pede código se estiver ativado. Admin passa required=true. */
export async function ensureTwoFactor(code: string, required = false) {
  const state = await getMfaState();
  if (state.isAal2) return;
  if (!state.factorId) {
    if (!required) return;
    throw new Error("Ative a verificação em duas etapas na página Segurança.");
  }
  if (!/^\d{6}$/.test(code)) throw new Error("Informe o código de 6 dígitos do autenticador.");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code });
  if (error) throw new Error("Código de verificação inválido.");
}
