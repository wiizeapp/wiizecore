import { z } from "zod";
import { validCnpj, validCpf } from "./doc-validation";
import { isSafeReturnUrl } from "./ext-sandbox";

/** Corpo aceito em POST /api/public/v1/ext/checkout-sessions. Preço e tipo vêm sempre do serviço. */
export const extCheckoutBody = z.object({
  service_id: z.string().uuid(),
  payment_method: z.enum(["pix", "boleto", "credit_card"]).optional(),
  installments: z.number().int().min(2).max(21).optional(),
  external_subscription_id: z.string().trim().min(1).max(128).optional(),
  success_url: z.string().url().startsWith("https://").max(500).refine(isSafeReturnUrl, "unsafe_url").optional(),
  cancel_url: z.string().url().startsWith("https://").max(500).refine(isSafeReturnUrl, "unsafe_url").optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    document: z.string().transform((v) => v.replace(/\D/g, "")).refine((d) => (d.length === 11 && validCpf(d)) || (d.length === 14 && validCnpj(d)), "invalid_document"),
    email: z.string().trim().toLowerCase().email().max(160).optional(),
    phone: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length >= 10 && v.length <= 13, "invalid_phone").optional(),
    external_customer_id: z.string().trim().min(1).max(128).optional(),
  }),
}).strict();
export type ExtCheckoutBody = z.infer<typeof extCheckoutBody>;

export const IDEMPOTENCY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

/** Assinatura estável do pedido: mesma chave + corpo diferente = conflito. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Erros internos viram códigos genéricos; nada de dados sensíveis na resposta. */
export function mapCoreError(message: string): { status: number; code: string } {
  if (/Serviço não encontrado|inativo/i.test(message)) return { status: 404, code: "service_not_found" };
  if (/Ative sua conta|não pode receber|ativação/i.test(message)) return { status: 409, code: "account_not_ready" };
  if (/forma de pagamento|não está disponível|parcelas|valor/i.test(message)) return { status: 422, code: "invalid_request" };
  return { status: 502, code: "provider_unavailable" };
}
