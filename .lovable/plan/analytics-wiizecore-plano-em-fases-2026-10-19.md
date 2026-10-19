# Analytics WiizeCore — plano em fases

## O que a auditoria encontrou

- **Configuração já existe**: o Admin tem uma tela "Rastreamento", onde se cadastram o código do GTM, do GA4 e do Meta Pixel (cada código é validado e só admins da plataforma podem alterar). Ela será mantida e ampliada; não haverá segunda instalação.
- **Aviso de cookies já existe**: categorias necessário/funcional/analytics/marketing, Google Consent Mode v2 começando com tudo negado e registro da escolha no banco. Também será mantido.
- **Problemas atuais**:
  1. GTM e GA4 podem carregar juntos, o que conta tudo em dobro se o GTM também tiver GA4.
  2. A página vista é enviada com o endereço completo, incluindo os parâmetros da URL. Isso vaza os códigos de `/pagar/…`, `/checkout/…`, `/portal/…`, `/convite/…`, `/assinar/…` e de redefinição de senha.
  3. Não existe padrão de eventos: há chamadas soltas e nenhum evento de cadastro, onboarding ou funil.
  4. Não existe captura de origem (UTM/gclid) nem atribuição.
- **Fontes reais de negócio** (já confiáveis): conta e empresa criadas, onboarding (com etapas e "pulou"), ativação aprovada pelo Asaas, cobranças, pagamentos confirmados por webhook, reembolsos, assinaturas, convites de equipe, contratos, notas fiscais, links de serviço e cupons.
- **Receita da WiizeCore**: a WiizeCore não vende planos mensais. Ela ganha com tarifas por cobrança paga, lembretes, notas fiscais e antecipação. Por isso, a "compra" no analytics será a **tarifa efetivamente recebida pela WiizeCore** depois do pagamento confirmado, e não o valor que a empresa cobra do cliente dela (esse é volume de pagamentos, o TPV). O MRR será marcado como "indisponível", porque não há assinatura da plataforma.

## Fase 1 — Base segura (navegador)

- Módulo único de analytics com eventos tipados, um único ponto de envio, sem duplicação de page view, falha silenciosa e respeito ao consentimento.
- Regra de provedor: **se houver GTM, tudo vai só pela dataLayer** (o GA4 direto fica desligado e o Admin avisa). Sem GTM, usa o GA4 direto.
- Endereços normalizados, por exemplo `/pagar/:token` e `/clientes/:id`, sem parâmetros. Lista do que nunca é enviado: e-mail, telefone, CPF/CNPJ, nomes, códigos e valores de terceiros.
- Categorias de página adaptadas às rotas reais: institucional, preços, cadastro/login, onboarding, painel, clientes, cobranças, finanças, contratos/notas, checkout público, portal, configurações, ajuda, documentação da API e admin.
- Cliques só em elementos marcados (`data-analytics-*`) e páginas sensíveis excluídas (checkout com cartão, portal, ativação).
- Origem do visitante (UTM/gclid/gbraid/wbraid/referrer/página de entrada): primeiro e último toque, janela de 90 dias, sem sobrescrever com acesso direto. Só é guardada com consentimento de analytics e nunca usa fingerprinting.

## Fase 2 — Funil, login e uso do produto

- Cadastro: página vista → iniciado → enviado → `sign_up`, somente quando o backend confirma a conta → e-mail verificado → onboarding (etapa a etapa, concluído ou pulado) → primeira ação de valor (primeira cobrança criada).
- Login, falha de login (só a categoria), saída, redefinição de senha e convite aceito.
- Uso das funcionalidades: cliente, cobrança, link de serviço, contrato, nota fiscal, integração conectada ou com falha, membro convidado, exportação e busca (com espera para não disparar a cada letra).
- Erros: falha de chamada, erro da aplicação e permissão negada, só com categoria, código e rota normalizada.
- ID de usuário opaco (gerado por hash no servidor e diferente do ID interno), enviado somente com consentimento.

## Fase 3 — Eventos do servidor e receita real

- Fila persistente de eventos de analytics, isolada e só do servidor. Cada evento tem uma chave única por origem (por exemplo `purchase:<id da tentativa de pagamento>`), então webhooks repetidos não duplicam nada.
- Eventos gravados a partir das operações reais: conta criada, ativação aprovada, cobrança criada (não é receita), pagamento confirmado → `purchase` com a tarifa WiizeCore em BRL, reembolso confirmado → `refund`, assinatura criada ou cancelada, cobrança vencida.
- Envio ao GA4 pelo servidor (Measurement Protocol) a cada minuto, aproveitando a rotina programada existente, com tentativas limitadas e alerta no sininho do admin em falhas persistentes. Falhas **nunca** afetam o pagamento.
- O navegador nunca dispara `purchase`.
- Reconciliação: pagamentos confirmados versus eventos enviados.

## Fase 4 — Painel Analytics no Admin

- Nova aba "Analytics" no Admin com dados **do banco interno**, sempre identificados como tais: cadastros, onboarding, ativação, funil com taxas e abandono, empresas pagantes, tarifa recebida por período e por tipo, reembolsos, uso de funcionalidades, origem dos cadastros (quando houver consentimento) e qualidade dos dados (último evento, falhas, duplicados barrados, pagamentos não reconciliados).
- Filtros: hoje, ontem, 7, 30 e 90 dias e período personalizado.
- Visitantes, sessões e page views do Google **não** aparecem como dados oficiais, porque isso exige a API de relatórios do GA4. A tela mostra "disponível no GA4". CAC fica indisponível enquanto não houver custo de mídia cadastrado.

## Fase 5 — Testes e documentação

- Testes de: page view única, rotas com códigos normalizadas, consentimento negado/concedido/revogado, ausência de dados pessoais, atribuição, `sign_up` só após sucesso, `purchase` idempotente (webhook repetido), falha no envio ao GA4, configuração inválida e GTM+GA4 duplicados.
- `docs/analytics.md`: eventos, gatilhos, fonte da verdade, deduplicação, consentimento, dados proibidos, fórmulas, uso do DebugView/GTM Preview, reconciliação e limites da atribuição.
- Atualização da política de cookies e privacidade com finalidades e provedores.

## O que vai depender de você

- Os códigos reais de GA4/GTM no Admin.
- Uma **chave secreta do Measurement Protocol** do GA4 (pedirei de forma segura na Fase 3).
- No GTM, as tags lendo a dataLayer documentada.
- Validação real no GA4 DebugView. Eu só consigo testar localmente com simulações; não enviarei compras de teste para a produção.

## Detalhes técnicos

- Arquivos principais: `src/lib/analytics/*` (novo SDK, normalização de rotas, atribuição e regras puras testáveis), `src/components/cookies/cookie-consent.tsx` (passa a delegar ao SDK), `src/lib/consent.ts` (mantido), `src/components/admin/admin-tracking.tsx` (aviso de duplicação), `src/lib/analytics-events.server.ts` + migração `analytics_outbox` (RLS só service_role), ganchos em `billing.server.ts`, `payment-attempts.server.ts`, `onboarding.functions.ts`, nova rota de envio programado em `src/routes/api/public/cron/` e `src/components/admin/admin-analytics.tsx`.
- Sugestão: aprovar e executar uma fase por vez, começando pela Fase 1, que já corrige o vazamento de códigos nas URLs.
