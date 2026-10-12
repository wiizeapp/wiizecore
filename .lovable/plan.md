# Integração Externa (API para SaaS) — plano em fases

Cada fase é entregue, testada e só então a próxima começa. Nada muda nos fluxos de cobrança atuais: a API externa usa o mesmo motor de cobranças, o mesmo checkout e os mesmos avisos do Asaas que já existem.

## Fase 1 — Integrações e chaves de acesso
- Nova página "Integração Externa" no menu de Integrações, com abas: Visão geral, Credenciais, Serviços, Webhooks, Eventos, Logs, Documentação e Guia com IA (as últimas abas aparecem com conteúdo nas fases seguintes).
- Criar integração com nome e permissões (somente: ver serviços, criar/ver clientes, criar/ver cobranças e assinaturas, criar sessão de checkout).
- Chave pública (`pk_live_` / `pk_test_`) e chave secreta (`sk_live_` / `sk_test_`): a secreta aparece inteira uma única vez; depois só mascarada. Guardamos apenas a impressão digital (hash), nunca o texto.
- Criar, girar e revogar chaves exige 2FA (o mesmo usado em saques). Somente dono/administrador.
- Status: ativa, suspensa, revogada; data de criação e último uso.

## Fase 2 — API v1 para o SaaS
Rotas novas em `/api/public/v1/ext/...`, autenticadas por `Authorization: Bearer sk_...`, sempre filtradas pela empresa da chave:
- `GET services` (com `service_id` estável, já existente), `GET payment-methods`
- `POST customers` (procura por `external_customer_id` ou CPF/CNPJ antes de criar), `GET customers/{id}`
- `POST charges` (à vista/parcelado) e `POST subscriptions` (recorrente) — preço, tipo e periodicidade vêm SEMPRE do serviço cadastrado; serviço inativo é recusado.
- `GET charges/{id}`, `GET subscriptions/{id}`
- `POST checkout-sessions` → link do checkout hospedado com validade.
- Cabeçalho `Idempotency-Key` obrigatório nas criações (reaproveita a tabela de idempotência existente), limite de requisições por chave, erros sem dados sensíveis, logs sem CPF completo nem chaves.
- Ambiente de teste: chaves `sk_test_` só funcionam em empresas conectadas ao sandbox do Asaas; chaves `sk_live_` só em produção. Nunca se misturam.

## Fase 3 — Checkout hospedado
- Reutiliza o checkout público atual (dados → contrato, se houver → pagamento), já com os dados enviados pela API preenchidos e pedindo confirmação.
- Métodos: os que o checkout já suporta hoje (Pix, boleto e cartão via Asaas). Confirmação de pagamento vem só do aviso do Asaas.
- Página de sucesso/expiração e `success_url` / `cancel_url` de retorno ao SaaS (apenas para navegação, não confirma pagamento).

## Fase 4 — Webhooks para o SaaS
- Cadastro de uma ou mais URLs (HTTPS), escolha de eventos, segredo próprio por URL (`whsec_`), girar segredo, pausar, excluir e "Enviar teste".
- Fila durável com retentativas crescentes (mesmo padrão já usado para a Wiize), histórico de entregas com código HTTP, botão reenviar.
- Assinatura `WiizePay-Signature: t=timestamp,v1=hmac` sobre `timestamp.corpo`, janela de 5 minutos, `event.id` único para o SaaS ignorar repetidos.
- Eventos reais suportados: `customer.created`, `checkout.session.created`, `payment.created`, `payment.confirmed`, `payment.overdue`, `payment.cancelled`, `payment.refunded`, `payment.failed`, `subscription.created`, `subscription.renewed`, `subscription.overdue`, `subscription.cancelled`. Sempre com `external_customer_id` e `external_subscription_id`.

## Fase 5 — Painel, logs e documentação
- Visão geral com contagens (cobranças, pagas, pendentes, atrasadas, assinaturas ativas), última atividade e alertas.
- Logs paginados com filtros (período, tipo, status, cobrança).
- Documentação gerada a partir das rotas reais, exemplos em Node/TypeScript, verificação de assinatura, checklist de segurança.
- Gerador de prompt para IA (nome do SaaS, linguagem, banco, hospedagem, serviços, métodos, eventos) com botão Copiar.

## Checkout personalizado (estilo Stripe Elements)
O Asaas não oferece um componente oficial de cartão para embutir em sites de terceiros. Por segurança, nesta entrega o checkout personalizado fica **documentado como limitação**: o SaaS pode montar sua própria tela de resumo e mandar o comprador ao checkout hospedado (ou exibir Pix/boleto gerados pela API). Cartão embutido fica para quando houver suporte oficial.

## Detalhes técnicos
- Tabelas novas (com RLS por empresa e GRANTs): `ext_integrations`, `ext_api_keys` (hash + prefixo + últimos 4), `ext_customer_links` (integração ↔ cliente ↔ `external_customer_id`), `ext_checkout_sessions`, `ext_webhook_endpoints` (segredo criptografado com `crypto.server`), `ext_webhook_deliveries`, `ext_request_logs`. Cobranças/assinaturas reaproveitam `payments`/`subscriptions` com coluna `ext_integration_id` e `external_subscription_id`.
- Criação de cobranças passa por `charges-core.server.ts` (mesma validação, taxas e split).
- Eventos são enfileirados a partir dos mesmos pontos que hoje alimentam `wiize_sale_events`; entrega por rota de cron `/api/public/ext/deliver` protegida.
- Testes (vitest): autenticação de chave, isolamento entre empresas, permissões, idempotência, serviço inativo, assinatura e janela de tempo dos webhooks, retentativa; regressão rodando a suíte atual.
- Nenhuma secret nova é necessária no início; para produção, apenas agendar o cron de entrega.
