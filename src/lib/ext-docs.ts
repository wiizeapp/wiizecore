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
  errors: `400 idempotency_key_required | invalid_idempotency_key | invalid_json
401 invalid_api_key    403 insufficient_scope
404 service_not_found | not_found
409 account_not_ready | environment_mismatch | idempotency_key_reused | idempotency_in_progress | invalid_transition | conflict
413 payload_too_large  422 invalid_body | invalid_query | payment_method_not_allowed
429 rate_limited (60/min no checkout, 120/min nas consultas)   500 internal_error   502 provider_unavailable
Formato: { "error": "codigo", "error_detail": { "code", "request_id" }, "request_id" } + cabeçalho X-Request-Id`,
};

export type AiPromptInput = { saas: string; language: string; database: string; hosting: string; services: string; methods: string };

const clean = (v: string, fb: string) => v.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || fb;

export function buildExtAiPrompt(i: AiPromptInput) {
  return `Você é um desenvolvedor sênior. Integre o sistema "${clean(i.saas, "meu SaaS")}" à Wiize Core (pagamentos).

Contexto do meu sistema:
- Linguagem: ${clean(i.language, "a definir")}
- Banco de dados: ${clean(i.database, "a definir")}
- Hospedagem: ${clean(i.hosting, "a definir")}
- O que vendo: ${clean(i.services, "serviços cadastrados na Wiize Core")}
- Formas de pagamento: ${clean(i.methods, "Pix, boleto e cartão")}

API da Wiize Core:
- Base: ${EXT_API_BASE}
- Autenticação: header "Authorization: Bearer <WIIZEPAY_SECRET_KEY>" (variável de ambiente do servidor; nunca no navegador).
- Toda criação exige header "Idempotency-Key" (8–128 caracteres, único por pedido; repetir devolve o mesmo resultado).
- POST /checkout-sessions com JSON:
  { service_id (uuid), payment_method? ("pix"|"boleto"|"credit_card"), installments? (2–21),
    external_subscription_id?, success_url? (https), cancel_url? (https),
    customer: { name, document (CPF/CNPJ), email?, phone?, external_customer_id? } }
  Resposta: { id, charge_id, status, url, expires_at, external_customer_id, external_subscription_id }.
  Redirecione o comprador para "url". Preço e tipo vêm do serviço na Wiize Core; não envie valor.
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

/** Endpoints realmente implementados (fonte única para documentação e prompts). */
export const EXT_ENDPOINTS = [
  { method: "POST", path: "/checkout-sessions", scopes: ["checkout_sessions:write", "charges:write"], summary: "Cria cliente (ou reaproveita), cobrança e link do checkout hospedado. Exige Idempotency-Key." },
  { method: "GET", path: "/services", scopes: ["services:read"], summary: "Lista os serviços ativos (preço, tipo, periodicidade e formas de pagamento)." },
  { method: "GET", path: "/charges", scopes: ["charges:read"], summary: "Lista cobranças da integração (filtros: external_customer_id, status, limit até 50, created_before para paginar)." },
  { method: "GET", path: "/charges/{id}", scopes: ["charges:read"], summary: "Consulta a cobrança (id = charge_id): status, parcelas, checkout_url, portal_url e receipt_url." },
  { method: "GET", path: "/subscriptions/{id}", scopes: ["subscriptions:read"], summary: "Consulta a assinatura: status, periodicidade, ciclos pagos e histórico." },
  { method: "POST", path: "/subscriptions/{id}/cancel", scopes: ["subscriptions:write"], summary: "Encerra os próximos ciclos. Ciclos já pagos não são estornados. Aceita Idempotency-Key; repetir devolve o mesmo resultado." },
  { method: "GET", path: "/customers/{external_customer_id}", scopes: ["customers:read"], summary: "Vínculo do cliente pelo seu ID externo, último charge_id e link da central do cliente." },
] as const;

export const AI_TOOLS = [
  { id: "lovable", name: "Lovable", hint: "Cole no chat do seu projeto. Guarde a chave em Secrets e use funções de servidor." },
  { id: "codex", name: "OpenAI Codex", hint: "Use como tarefa no repositório. Ele lê o código antes de alterar." },
  { id: "claude", name: "Claude", hint: "Funciona no Claude Code ou em projetos com o repositório anexado." },
  { id: "base44", name: "Base44", hint: "Use as funções de backend da Base44 para guardar a chave e receber avisos." },
  { id: "cursor", name: "Cursor", hint: "Cole no modo Agent com o projeto aberto." },
  { id: "other", name: "Outros agentes", hint: "Prompt neutro para qualquer agente de código." },
] as const;
export type AiToolId = (typeof AI_TOOLS)[number]["id"];

const TOOL_NOTES: Record<AiToolId, string> = {
  lovable: "Ferramenta: Lovable. Guarde WIIZE_SECRET_KEY e WIIZE_WEBHOOK_SECRET como secrets do projeto. Chame a API só em funções/rotas de servidor; o webhook deve ser uma rota pública de servidor que lê o corpo bruto.",
  codex: "Ferramenta: OpenAI Codex. Antes de editar, leia a estrutura do repositório e descreva o plano. Use variáveis de ambiente do servidor e rode os testes ao final.",
  claude: "Ferramenta: Claude. Explore o repositório primeiro, proponha o plano, implemente em passos pequenos e rode os testes após cada passo.",
  base44: "Ferramenta: Base44. Use funções de backend para chamar a API e para receber o webhook; nunca chame a API pelo navegador. Guarde a chave nos secrets do app.",
  cursor: "Ferramenta: Cursor (modo Agent). Leia os arquivos relevantes antes de alterar, use variáveis de ambiente do servidor e rode os testes ao final.",
  other: "Siga as convenções do projeto existente.",
};

/** Prompt completo e seguro para a ferramenta escolhida. Nunca inclui chaves reais. */
export function buildToolPrompt(tool: AiToolId, env: "test" | "live" = "test") {
  const prefix = env === "live" ? "sk_live_" : "sk_test_";
  return `Integre este projeto à API de billing da Wiize Core (checkout hospedado, cobranças, assinaturas e webhooks).
${TOOL_NOTES[tool]}

REGRAS
1. Examine a arquitetura existente (autenticação, modelos de dados, rotas de servidor) antes de programar. Não reconstrua o login nem duplique modelos.
2. Crie um adaptador único (ex.: wiize-client) para todas as chamadas. Não existe SDK oficial: use HTTP com fetch.
3. A chave secreta (${prefix}...) fica SOMENTE no servidor, em variável de ambiente WIIZE_SECRET_KEY. Nunca no navegador, no repositório ou em logs.
4. Comece pelo ambiente de testes (chave sk_test_). Só use sk_live_ após validação explícita do responsável.
5. Use somente os endpoints listados abaixo. Não invente endpoints ou campos.

API
Base: ${EXT_API_BASE}
Cabeçalho: Authorization: Bearer <WIIZE_SECRET_KEY>
${EXT_ENDPOINTS.map((e) => `- ${e.method} ${e.path} (escopos: ${e.scopes.join(", ")}) — ${e.summary}`).join("\n")}

POST /checkout-sessions
Cabeçalhos: Idempotency-Key (8–128 caracteres [A-Za-z0-9_.:-], estável por pedido), Content-Type: application/json
Corpo: { service_id (uuid), payment_method? ("pix"|"boleto"|"credit_card"), installments? (2–21),
  external_subscription_id?, success_url? (https, domínio público), cancel_url? (https),
  customer: { name, document (CPF/CNPJ válido), email?, phone?, external_customer_id? } }
Não envie valor: o preço vem do serviço cadastrado na Wiize Core.
Resposta: { id, object:"checkout_session", livemode, sandbox?, charge_id, status, url, expires_at, external_customer_id, external_subscription_id, request_id }
Redirecione o comprador para "url". Mesma Idempotency-Key + mesmo corpo = mesma sessão; corpo diferente = 409.

Erros:
${EXT_DOCS_SNIPPETS.errors}

WEBHOOKS
- Endpoint HTTPS no servidor que lê o corpo BRUTO.
- Cabeçalho WiizePay-Signature: t=<unix>,v1=<hex>. v1 = HMAC-SHA256(segredo whsec_, "<t>.<corpo bruto>"). Compare em tempo constante; rejeite se |agora − t| > 300 s.
- Corpo: { id, object:"event", type, livemode, created, data: { charge_id, checkout_session_id, service_id, charge_type, external_customer_id, external_subscription_id, payments[] } }
- Eventos: ${EXT_EVENT_NAMES.join(", ")}.
- Idempotência: grave event.id numa tabela com chave única e ignore repetidos. Responda 2xx rapidamente (o tempo limite é configurado no endpoint) e processe depois.
- Eventos podem chegar fora de ordem ou repetidos: em caso de dúvida consulte GET /charges/{charge_id}.
- Falhas recebem novas tentativas com espera crescente (até 12).

REGRAS DE NEGÓCIO
- Libere acesso só com payment.confirmed ou subscription.renewed (ou status "paid" na consulta). O retorno via success_url NÃO confirma pagamento.
- payment.overdue / subscription.overdue: aplique sua regra de carência ou suspensão.
- payment.cancelled / subscription.cancelled / payment.refunded: revogue ou ajuste o acesso conforme sua regra.
- Para cancelar uma assinatura, chame POST /subscriptions/{id}/cancel.

ENTREGUE
1. Tabela com: usuário/cliente (external_customer_id estável), checkout_session_id, charge_id, subscription_id, status, checkout_url, portal_url, valores em decimal (nunca float).
2. Tabela de eventos processados (event.id único).
3. Função de criar checkout com Idempotency-Key estável e redirecionamento.
4. Rota de webhook com verificação de assinatura, idempotência e atualização de acesso.
5. Rotina de conciliação que consulta GET /charges/{id} para pendentes.
6. Testes automatizados: assinatura válida, inválida, expirada, evento duplicado e liberação/suspensão de acesso.
7. Roteiro de validação no ambiente de testes antes de produção.
Nunca registre em log a chave secreta, o segredo do webhook, CPF/CNPJ completo ou dados de cartão.`;
}
