import { z } from "zod";
import { passwordProblems } from "./password-policy";
import type { TurnstileFailure } from "./turnstile";

/** Limites de cadastro (generosos para redes compartilhadas; ajustáveis aqui). */
export const SIGNUP_LIMITS = {
  ip: { maxAttempts: 10, windowSeconds: 3600, blockSeconds: 3600 },
  email: { maxAttempts: 3, windowSeconds: 3600, blockSeconds: 3600 },
} as const;

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome completo.").max(120).regex(/^[^<>{}]*$/, "Nome inválido."),
  email: z.string().trim().email("E-mail inválido.").max(254),
  password: z.string().max(200).refine((v) => passwordProblems(v).length === 0, "A senha não atende aos requisitos."),
});

export const SIGNUP_TURNSTILE_MESSAGES: Record<TurnstileFailure, string> = {
  missing_token: "Conclua a verificação de segurança antes de criar a conta.",
  invalid_token: "A verificação de segurança não foi aceita. Tente novamente.",
  expired_or_reused: "A verificação de segurança expirou. Faça a verificação novamente.",
  hostname_mismatch: "Verificação de segurança inválida para este endereço.",
  action_mismatch: "Verificação de segurança inválida para esta operação.",
  not_configured: "Cadastro temporariamente indisponível.",
  unavailable: "Não conseguimos confirmar a verificação de segurança agora. Tente novamente em instantes.",
};
