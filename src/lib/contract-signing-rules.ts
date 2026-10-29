import { z } from "zod";

export const birthDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe sua data de nascimento.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10);
}, "Informe uma data de nascimento válida, não futura.");

export const signingIdentitySchema = z.object({
  signerName: z.string().trim().min(3).max(160),
  signerDocument: z.string().transform((s) => s.replace(/\D/g, "")).refine((s) => s.length === 11 || s.length === 14, "Informe um CPF ou CNPJ válido."),
  birthDate: birthDateSchema,
  signature: z.unknown(),
});
export const signingRequestSchema = signingIdentitySchema.extend({
  token: z.string().min(20).max(256),
  source: z.enum(["customer", "extra", "checkout"]),
});
export const SIGNING_CODE_TTL_SECONDS = 600;
export const SIGNING_RESEND_SECONDS = 60;
export const SIGNING_MAX_ATTEMPTS = 5;