import { DEPLOY_CONFIG } from "./deploy-config";
const SITE_URL = DEPLOY_CONFIG.publicSiteUrl;

/** Lista para telas (sem dependências de servidor). Deve bater com EXT_EVENTS — garantido por teste. */
export const EXT_EVENT_NAMES = [
  "checkout.session.created", "payment.created", "payment.updated", "payment.confirmed", "payment.overdue",
  "payment.cancelled", "payment.refunded", "subscription.created", "subscription.renewed", "subscription.overdue",
  "subscription.cancelled",
] as const;

export const EXT_API_BASE = `${SITE_URL}/api/public/v1/ext`;

export const EXT_DOCS_SNIPPETS = {
  curl: `curl -X POST ${EXT_API_BASE}/checkout-sessions \\
  -H "Authorization: Bearer sk_test_..." \\
  -H "Idempotency-Key: pedido-12345" \\
  -H "Content-Type: application/json" \\
  -d '{
    "service_id": "UUID_DO_SERVICO",
    "payment_method": "pix",
    "customer": { "name": "Maria Silva", "document": "12345678909", "email": "maria@exemplo.com", "external_customer_id": "cli_42" },
    "success_url": "https://seusistema.com/obrigado",
    "cancel_url": "https://seusistema.com/carrinho"
  }'`,
  node: `// Node.js / TypeScript (servidor)
const res = await fetch("${EXT_API_BASE}/checkout-sessions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.WIIZEPAY_SECRET_KEY}\`,
    "Idempotency-Key": \`pedido-\${order.id}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    service_id: process.env.WIIZEPAY_SERVICE_ID,
    customer: { name: order.name, document: order.cpf, external_customer_id: String(order.userId) },
  }),
});
const session = await res.json();
if (!res.ok) throw new Error(session.error);
redirect(session.url);`,
  response: `{
  "id": "…",
  "object": "checkout_session",
  "livemode": false,
  "charge_id": "…",
  "status": "awaiting_payment",
  "url": "${SITE_URL}/pagar/…",
  "expires_at": "2026-11-11T23:59:59Z",
  "external_customer_id": "cli_42",
  "external_subscription_id": null
}`,
  verify: `// Cabeçalho: WiizePay-Signature: t=1760000000,v1=<hmac>
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWiizePay(secret: string, header: string, rawBody: string) {
  const p = Object.fromEntries(header.split(",").map((x) => x.split("=")));
  const t = Number(p.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // janela de 5 minutos
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(p.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
// Responda 2xx rápido. Guarde event.id e ignore repetidos.`,
  errors: `400 idempotency_key_required | invalid_json
401 invalid_key        403 insufficient_scope
404 service_not_found  409 account_not_ready | environment_mismatch | idempotency_key_reused
413 payload_too_large  422 invalid_body | payment_method_not_allowed
429 rate_limited (60 por minuto)   502 provider_unavailable`,
};

export type AiPromptInput = { saas: string; language: string; database: string; hosting: string; services: string; methods: string };

const clean = (v: string, fb: string) => v.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || fb;

export function buildExtAiPrompt(i: AiPromptInput) {
  return `Você é um desenvolvedor sênior. Integre o sistema "${clean(i.saas, "meu SaaS")}" à WiizePay (pagamentos).

Contexto do meu sistema:
- Linguagem: ${clean(i.language, "a definir")}
- Banco de dados: ${clean(i.database, "a definir")}
- Hospedagem: ${clean(i.hosting, "a definir")}
- O que vendo: ${clean(i.services, "serviços cadastrados na WiizePay")}
- Formas de pagamento: ${clean(i.methods, "Pix, boleto e cartão")}

API da WiizePay:
- Base: ${EXT_API_BASE}
- Autenticação: header "Authorization: Bearer <WIIZEPAY_SECRET_KEY>" (variável de ambiente do servidor; nunca no navegador).
- Toda criação exige header "Idempotency-Key" (8–128 caracteres, único por pedido; repetir devolve o mesmo resultado).
- POST /checkout-sessions com JSON:
  { service_id (uuid), payment_method? ("pix"|"boleto"|"credit_card"), installments? (2–21),
    external_subscription_id?, success_url? (https), cancel_url? (https),
    customer: { name, document (CPF/CNPJ), email?, phone?, external_customer_id? } }
  Resposta: { id, charge_id, status, url, expires_at, external_customer_id, external_subscription_id }.
  Redirecione o comprador para "url". Preço e tipo vêm do serviço na WiizePay; não envie valor.
- Erros: ${EXT_DOCS_SNIPPETS.errors.replace(/\s+/g, " ")}

Webhooks (avisos):
- Crie um endpoint HTTPS que leia o corpo BRUTO e verifique o header "WiizePay-Signature: t=<unix>,v1=<hex>":
  HMAC-SHA256(segredo whsec_, "<t>.<corpo>") em hex, comparação em tempo constante, rejeite se |agora − t| > 300 s.
- Guarde event.id e ignore repetidos. Responda 2xx rápido e processe em fila.
- Eventos: ${EXT_EVENT_NAMES.join(", ")}.
- Só marque como pago ao receber payment.confirmed. O retorno via success_url NÃO confirma pagamento.

Entregue:
1. Tabela de pedidos/pagamentos com charge_id, status e event_ids processados (valores em decimal, nunca float).
2. Função que cria a sessão de checkout com Idempotency-Key estável.
3. Endpoint de webhook com verificação de assinatura e idempotência.
4. Atualização de status do pedido por evento e testes da verificação de assinatura.
Nunca registre em log a chave secreta, o segredo do webhook ou CPF completo.`;
}
