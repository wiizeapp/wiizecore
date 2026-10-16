import { DEPLOY_CONFIG } from "./deploy-config";
import { EXT_API_BASE, EXT_DOCS_SNIPPETS, EXT_ENDPOINTS, EXT_EVENT_NAMES } from "./ext-docs";

/** Fonte única da documentação pública da API (página /desenvolvedores, llms-api.txt e prompt para IA). */
export const DOCS_URL = `${DEPLOY_CONFIG.publicSiteUrl}/desenvolvedores`;
export const LLMS_API_URL = `${DEPLOY_CONFIG.publicSiteUrl}/llms-api.txt`;

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; label?: string; code: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string };
export type DocSection = { id: string; group: string; title: string; blocks: DocBlock[] };

const ep = (path: string, method: string) => EXT_ENDPOINTS.find((e) => e.path === path && e.method === method)!;

export const DOC_SECTIONS: DocSection[] = [
  { id: "introducao", group: "Começo", title: "Introdução", blocks: [
    { kind: "p", text: "A API da Wiize Core permite que o seu sistema (SaaS, app ou site) crie cobranças, abra o checkout hospedado, acompanhe pagamentos e assinaturas e receba avisos automáticos (webhooks) quando algo muda." },
    { kind: "p", text: "Você não precisa recriar login, clientes ou cadastros: os seus usuários continuam no seu sistema; a Wiize Core cuida da cobrança e do recebimento." },
    { kind: "list", items: [
      `URL base: ${EXT_API_BASE}`,
      "Formato: JSON (UTF-8) em todas as requisições e respostas.",
      "Comunicação somente por HTTPS e sempre a partir do seu servidor.",
      "Não existe SDK oficial: use qualquer cliente HTTP (fetch, axios, curl, requests).",
    ] },
  ] },
  { id: "inicio-rapido", group: "Começo", title: "Início rápido em 5 passos", blocks: [
    { kind: "list", items: [
      "1. Entre na Wiize Core e abra Integrações → API e desenvolvedores.",
      "2. Escolha o ambiente Teste no menu lateral e clique em Nova chave (pede a sua senha financeira).",
      "3. Copie a chave secreta sk_test_… e guarde como variável de ambiente do servidor (ex.: WIIZE_SECRET_KEY).",
      "4. Cadastre um serviço com valor fixo em Serviços e pegue o service_id (GET /services).",
      "5. Chame POST /checkout-sessions, redirecione o comprador para a url devolvida e configure um webhook para saber quando foi pago.",
    ] },
    { kind: "code", label: "Primeira chamada", code: EXT_DOCS_SNIPPETS.curl },
  ] },
  { id: "ambientes", group: "Começo", title: "Ambientes: Teste e Produção", blocks: [
    { kind: "table", head: ["", "Teste", "Produção"], rows: [
      ["Prefixo da chave", "sk_test_ / pk_test_", "sk_live_ / pk_live_"],
      ["Dinheiro", "Nenhum. Pagamentos simulados", "Real"],
      ["Checkout", "Página de teste com botões de simulação", "Checkout oficial (Pix, boleto, cartão)"],
      ["Campo livemode", "false", "true"],
    ] },
    { kind: "p", text: "As chaves são separadas: uma chave de teste nunca vê dados de produção e vice-versa. Comece sempre pelo ambiente de testes." },
  ] },
  { id: "autenticacao", group: "Fundamentos", title: "Autenticação", blocks: [
    { kind: "p", text: "Envie a chave secreta no cabeçalho Authorization de todas as chamadas." },
    { kind: "code", code: "Authorization: Bearer sk_test_SUA_CHAVE" },
    { kind: "list", items: [
      "A chave completa aparece uma única vez, na criação. Guardamos somente um resumo criptográfico (hash).",
      "Nunca coloque a chave no navegador, no aplicativo, no repositório ou em logs.",
      "Gerar nova chave invalida a anterior na hora. Suspender pausa o acesso; revogar é definitivo.",
      "Criar chaves e webhooks exige login de dono ou administrador, senha financeira e, se ativada, a verificação em duas etapas.",
      "Nenhuma chave dá acesso a saldo, saques, contas bancárias ou configurações da empresa.",
    ] },
  ] },
  { id: "permissoes", group: "Fundamentos", title: "Permissões (escopos)", blocks: [
    { kind: "table", head: ["Escopo", "Permite"], rows: [
      ["services:read", "Listar serviços"], ["customers:read", "Consultar clientes"], ["customers:write", "Cadastrar clientes"],
      ["charges:read", "Consultar cobranças"], ["charges:write", "Criar cobranças"], ["subscriptions:read", "Consultar assinaturas"],
      ["subscriptions:write", "Cancelar assinaturas"], ["checkout_sessions:write", "Abrir checkout"],
    ] },
    { kind: "p", text: "Chamada sem o escopo necessário recebe 403 insufficient_scope." },
  ] },
  { id: "idempotencia", group: "Fundamentos", title: "Idempotência", blocks: [
    { kind: "p", text: "Operações que criam ou alteram algo exigem (ou aceitam) o cabeçalho Idempotency-Key. Ele evita cobranças duplicadas se a sua requisição for repetida por falha de rede." },
    { kind: "list", items: [
      "Formato: 8 a 128 caracteres [A-Za-z0-9_.:-]. Use algo estável, como pedido-123.",
      "Mesma chave + mesmo corpo: devolve o mesmo resultado, sem criar nada novo.",
      "Mesma chave + corpo diferente: 409 idempotency_key_reused.",
      "Requisição igual ainda em andamento: 409 idempotency_in_progress (tente de novo em instantes).",
    ] },
  ] },
  { id: "erros", group: "Fundamentos", title: "Erros e limites", blocks: [
    { kind: "code", code: EXT_DOCS_SNIPPETS.errors },
    { kind: "code", label: "Exemplo de erro", code: `{\n  "error": "insufficient_scope",\n  "error_detail": { "code": "insufficient_scope", "request_id": "req_..." },\n  "request_id": "req_..."\n}` },
    { kind: "p", text: "Toda resposta traz request_id e o cabeçalho X-Request-Id. Informe esse código ao suporte para diagnóstico. Ao receber 429, aguarde 60 segundos." },
  ] },
  { id: "servicos", group: "Endpoints", title: "Serviços", blocks: [
    { kind: "p", text: `GET /services — ${ep("/services", "GET").summary}` },
    { kind: "p", text: "Só serviços com valor fixo maior que zero e com forma de pagamento podem ser usados no checkout (checkout_supported: true). O preço sempre vem do serviço; a API não aceita valor enviado pelo seu sistema." },
    { kind: "code", code: `{\n  "object": "list",\n  "data": [{\n    "id": "uuid", "object": "service", "name": "Plano Pro", "description": null,\n    "amount": "99.90", "currency": "BRL", "charge_type": "recurring", "frequency": "monthly",\n    "max_installments": null, "payment_methods": ["pix","boleto","credit_card"],\n    "checkout_supported": true, "updated_at": "..."\n  }]\n}` },
  ] },
  { id: "checkout", group: "Endpoints", title: "Criar checkout", blocks: [
    { kind: "p", text: `POST /checkout-sessions — ${ep("/checkout-sessions", "POST").summary}` },
    { kind: "table", head: ["Campo", "Obrigatório", "Descrição"], rows: [
      ["service_id", "Sim", "UUID do serviço"],
      ["customer.name", "Sim", "Nome do comprador"],
      ["customer.document", "Sim", "CPF ou CNPJ válido (só números)"],
      ["customer.email / phone", "Não", "Contato do comprador"],
      ["customer.external_customer_id", "Não", "ID do usuário no seu sistema (recomendado)"],
      ["payment_method", "Não", "pix, boleto ou credit_card"],
      ["installments", "Não", "2 a 21 (serviços parcelados)"],
      ["external_subscription_id", "Não", "ID da assinatura no seu sistema"],
      ["success_url / cancel_url", "Não", "Endereços https públicos de retorno"],
    ] },
    { kind: "code", label: "Node.js", code: EXT_DOCS_SNIPPETS.node },
    { kind: "code", label: "Resposta 201", code: EXT_DOCS_SNIPPETS.response },
    { kind: "note", text: "Voltar pela success_url NÃO confirma o pagamento. Libere acesso somente pelo webhook payment.confirmed ou consultando a cobrança." },
  ] },
  { id: "cobrancas", group: "Endpoints", title: "Cobranças", blocks: [
    { kind: "p", text: `GET /charges — ${ep("/charges", "GET").summary}` },
    { kind: "code", code: `GET ${EXT_API_BASE}/charges?status=paid&limit=20\nGET ${EXT_API_BASE}/charges?external_customer_id=cli_42\nGET ${EXT_API_BASE}/charges?created_before=2026-10-01T00:00:00Z` },
    { kind: "p", text: `GET /charges/{id} — ${ep("/charges/{id}", "GET").summary}` },
    { kind: "code", code: `{\n  "id": "charge_id", "object": "charge", "livemode": true, "status": "paid",\n  "charge_type": "one_time", "amount": "99.90", "currency": "BRL", "payment_method": "pix",\n  "service_id": "...", "checkout_session_id": "...", "external_customer_id": "cli_42",\n  "checkout_url": "...", "portal_url": "...", "receipt_url": "...",\n  "payments": [{ "id": "...", "status": "paid", "amount": "99.90", "due_on": "2026-10-20", "paid_at": "...", "installment_number": 1, "installment_count": 1, "method": "pix" }]\n}` },
    { kind: "table", head: ["Status", "Significado"], rows: [
      ["created / awaiting_payment / pending", "Aguardando pagamento"], ["processing / in_analysis", "Em processamento"],
      ["paid", "Pago (confirmado pelo provedor)"], ["overdue", "Vencido"], ["failed", "Recusado"],
      ["cancelled", "Cancelado"], ["refunded", "Estornado"],
    ] },
  ] },
  { id: "assinaturas", group: "Endpoints", title: "Assinaturas", blocks: [
    { kind: "p", text: "Serviços do tipo recorrente geram uma assinatura no primeiro checkout. As próximas cobranças são criadas automaticamente." },
    { kind: "p", text: `GET /subscriptions/{id} — ${ep("/subscriptions/{id}", "GET").summary}` },
    { kind: "p", text: `POST /subscriptions/{id}/cancel — ${ep("/subscriptions/{id}/cancel", "POST").summary}` },
    { kind: "code", code: `curl -X POST ${EXT_API_BASE}/subscriptions/SUB_ID/cancel \\\n  -H "Authorization: Bearer sk_test_..." \\\n  -H "Idempotency-Key: cancelar-sub-42"` },
    { kind: "p", text: "Status possíveis: pending, active, overdue, cancelled." },
  ] },
  { id: "clientes", group: "Endpoints", title: "Clientes", blocks: [
    { kind: "p", text: `GET /customers/{external_customer_id} — ${ep("/customers/{external_customer_id}", "GET").summary}` },
    { kind: "p", text: "O cliente é criado (ou reaproveitado pelo CPF/CNPJ) automaticamente no checkout. portal_url leva à Central do cliente, onde ele vê cobranças, recibos e documentos entrando com e-mail e CPF/CNPJ." },
  ] },
  { id: "webhooks", group: "Webhooks", title: "Configurar webhooks", blocks: [
    { kind: "p", text: "Webhooks são avisos que a Wiize Core envia ao seu servidor quando algo acontece. Cadastre o endereço em API e desenvolvedores → sua chave → Webhooks." },
    { kind: "list", items: [
      "O endereço precisa ser https e público (sem IP ou rede interna).",
      "Ao criar, você recebe o segredo whsec_… uma única vez. Guarde como WIIZE_WEBHOOK_SECRET.",
      "Responda 2xx rapidamente e processe depois. Sem resposta 2xx, reenviamos com espera crescente (até 12 tentativas).",
      "Use o botão Enviar teste para conferir a sua rota.",
    ] },
  ] },
  { id: "eventos", group: "Webhooks", title: "Eventos e formato", blocks: [
    { kind: "list", items: EXT_EVENT_NAMES.map((e) => e) },
    { kind: "code", code: `{\n  "id": "evt_...", "object": "event", "type": "payment.confirmed", "livemode": true, "created": 1760000000,\n  "data": { "charge_id": "...", "checkout_session_id": "...", "service_id": "...", "charge_type": "one_time",\n    "external_customer_id": "cli_42", "external_subscription_id": null, "payments": [ ... ] }\n}` },
    { kind: "list", items: [
      "Eventos podem chegar repetidos ou fora de ordem: guarde event.id e ignore repetidos.",
      "Em caso de dúvida, consulte GET /charges/{charge_id}.",
    ] },
  ] },
  { id: "assinatura-webhook", group: "Webhooks", title: "Verificar a assinatura", blocks: [
    { kind: "p", text: "Cada aviso traz o cabeçalho WiizePay-Signature: t=<unix>,v1=<hex>. v1 = HMAC-SHA256(segredo, \"t.corpo_bruto\"). Rejeite se a diferença de tempo passar de 5 minutos." },
    { kind: "code", label: "Node.js", code: EXT_DOCS_SNIPPETS.verify },
  ] },
  { id: "testes", group: "Guias", title: "Testes (sandbox)", blocks: [
    { kind: "p", text: "Com uma chave sk_test_, o checkout abre uma página de teste. Ali, ou em API e desenvolvedores → Testes, você simula pagamento, vencimento, recusa, estorno, renovação e cancelamento. Os mesmos webhooks são enviados, com livemode: false." },
    { kind: "note", text: "Nada no ambiente de testes movimenta dinheiro, emite nota fiscal ou aparece no seu financeiro." },
  ] },
  { id: "producao", group: "Guias", title: "Ir para produção", blocks: [
    { kind: "list", items: [
      "Conta de pagamentos ativada na Wiize Core.",
      "Chave sk_live_ criada e guardada no servidor de produção.",
      "Webhook de produção cadastrado e testado.",
      "Liberação de acesso só por payment.confirmed / subscription.renewed.",
      "Rotina que consulta GET /charges/{id} para pedidos pendentes há muito tempo.",
    ] },
  ] },
  { id: "seguranca", group: "Guias", title: "Boas práticas de segurança", blocks: [
    { kind: "list", items: [
      "Nunca registre em log a chave secreta, o segredo do webhook, CPF/CNPJ completo ou dados de cartão.",
      "Guarde valores como decimal (ex.: \"99.90\"), nunca como número de ponto flutuante.",
      "Troque a chave imediatamente se suspeitar de vazamento (Gerar nova chave).",
      "Use uma chave por sistema, com somente as permissões necessárias.",
    ] },
  ] },
  { id: "ia", group: "Guias", title: "Integração com IA e llms.txt", blocks: [
    { kind: "p", text: `Copie o guia pronto no topo desta página e cole na sua ferramenta de programação com IA. A versão para máquinas desta documentação fica em ${LLMS_API_URL}.` },
  ] },
];

function blockText(b: DocBlock): string {
  switch (b.kind) {
    case "p": case "note": return b.text;
    case "list": return b.items.map((i) => `- ${i}`).join("\n");
    case "code": return "```\n" + b.code + "\n```";
    case "table": return [b.head.join(" | "), ...b.rows.map((r) => r.join(" | "))].join("\n");
  }
}

/** Documentação completa em texto (llms-api.txt e prompt de IA). */
export function docsAsText() {
  return DOC_SECTIONS.map((s) => `## ${s.title}\n\n${s.blocks.map(blockText).join("\n\n")}`).join("\n\n");
}

/** Guia único para qualquer IA de programação. Nunca contém chaves reais. */
export function buildUniversalAiGuide() {
  return `Você é um desenvolvedor sênior. Integre este projeto à API de pagamentos da Wiize Core (checkout hospedado, cobranças, assinaturas e webhooks).

COMO TRABALHAR
1. Leia a estrutura do projeto antes de alterar (autenticação, banco, rotas de servidor). Não reconstrua login nem duplique modelos.
2. Proponha um plano curto e implemente em passos pequenos.
3. Crie um adaptador único (ex.: wiize-client) para todas as chamadas HTTP.
4. Guarde WIIZE_SECRET_KEY e WIIZE_WEBHOOK_SECRET como variáveis de ambiente/secrets do SERVIDOR. Nunca no navegador, no repositório ou em logs.
5. Comece com a chave sk_test_. Só use sk_live_ após validação do responsável.
6. Use somente os endpoints e campos documentados abaixo. Não invente nada.

ENTREGUE
- Tabela de pedidos/assinaturas com external_customer_id, checkout_session_id, charge_id, subscription_id, status e valores em decimal.
- Tabela de eventos processados (event.id único).
- Função que cria o checkout com Idempotency-Key estável e redireciona para "url".
- Rota pública de webhook que lê o corpo bruto, verifica WiizePay-Signature e atualiza o acesso.
- Liberação de acesso apenas com payment.confirmed ou subscription.renewed.
- Rotina de conciliação com GET /charges/{id} e testes automatizados da assinatura do webhook.

Documentação online: ${DOCS_URL}
Versão para IA: ${LLMS_API_URL}

# DOCUMENTAÇÃO COMPLETA

${docsAsText()}`;
}
