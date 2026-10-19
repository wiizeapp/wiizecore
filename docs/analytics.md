# Analytics WiizeCore

Status: **Fase 1 implementada** (base segura no navegador). Fases 2 a 5 estão em `.lovable/plan/analytics-wiizecore-plano-em-fases-2026-10-19.md`.

## Arquitetura (Fase 1)

- `src/lib/analytics/index.ts` é o único ponto de envio no navegador (`trackPage`, `track`, `configureAnalytics`).
- `src/lib/analytics/paths.ts` normaliza as rotas e define os grupos de página e as páginas sem medição de clique.
- `src/lib/analytics/params.ts` é o filtro final, que descarta dados pessoais, tokens e URLs.
- `src/lib/analytics/attribution.ts` cuida do primeiro e do último toque.
- `src/components/cookies/cookie-consent.tsx` lê `tracking_settings` (configurado no Admin → Rastreamento) e repassa ao SDK a configuração e a escolha de cookies.
- O Consent Mode v2 continua em `src/lib/consent.ts`: tudo começa negado.

## Provedores (sem duplicação)

| Configuração | Comportamento |
|---|---|
| GTM preenchido | Carrega **só** o GTM. Todos os eventos vão para a `dataLayer`. O GA4 deve ser configurado dentro do GTM. |
| Só GA4 | Carrega o gtag com `send_page_view: false`. O SDK envia as page views. |
| Meta Pixel | Só com consentimento de marketing. Envia `PageView` a cada rota. |

No GTM, a tag de configuração do GA4 deve **desligar a page view automática** e o "histórico do navegador" da medição otimizada. A page view deve vir do evento `page_view` da dataLayer, usando os parâmetros `page_location` e `page_path` dela (que já são seguros).

## Eventos da Fase 1

| Evento | Gatilho | Origem | Parâmetros |
|---|---|---|---|
| `page_view` | mudança real de rota (template diferente) | navegador | page_location, page_path, page_template, page_group, previous_page_path, language, device_category, auth_state |
| `cta_clicked`, `navigation_clicked`, `pricing_plan_selected`, `modal_opened`, `tab_selected`, `filter_applied`, `feature_used`, `contact_clicked` | clique em elemento com `data-analytics-event` | navegador | element_name, placement, element_type, destination (rota normalizada ou domínio externo), interaction_type |

Para marcar um elemento, use `data-analytics-event="cta_clicked" data-analytics-name="signup" data-analytics-location="home_hero"`. Para excluir uma região, use `data-analytics-ignore`. Os nomes que não estão na lista `CLICK_EVENTS` são ignorados.

Elementos marcados até agora: os botões de cadastro da home (topo, destaque e chamada final), "Acessar" no menu (computador e celular) e o link de Taxas no rodapé.

## Regras de privacidade

- Nada é enviado sem consentimento de **análise**. Antes da decisão, a page view fica pendente e sai uma única vez após o aceite.
- Rotas com códigos são enviadas como template: `/pagar/:token`, `/checkout/:token`, `/c/:token`, `/portal/:key`, `/convite/:token`, `/assinar/:token`, `/autorizar/:token`, `/verificar/:code`, `/ativacao-celular/:token`, `/teste-checkout/:token`, `/clientes/:id`, `/contratos/:id`, `/coproducoes/:id`, `/notas-fiscais/:id`. Segmentos que parecem ID ou token (UUID, ou 16+ caracteres com número) viram `:id`.
- `page_location` contém só a origem, a rota normalizada e os parâmetros `utm_*`, `gclid`, `gbraid` e `wbraid` (mais `fbclid`, somente com consentimento de marketing). O `page_referrer` é enviado vazio.
- Nunca enviar: e-mail, telefone, CPF/CNPJ, nomes, razão social, senhas, tokens, dados de cartão, chave Pix, dados bancários, endereços, mensagens ou textos digitados. O filtro descarta as chaves proibidas e os valores com cara de e-mail, documento, telefone ou URL.
- Não há medição de cliques em pagar, checkout, c, portal, ativação, assinar, autorizar, teste-checkout, reset-password e oauth.
- A prova de consentimento (`cookie_consents.page_url`) passou a guardar só a rota normalizada.
- Não há fingerprinting, gravação de sessão nem captura de teclas.

## Atribuição

- A janela é de **90 dias**. O primeiro toque é gravado uma vez por janela.
- O último toque é atualizado por visitas com origem identificada. Acesso direto não sobrescreve.
- Origem, na ordem: `utm_source`/`utm_medium`; depois gclid/gbraid/wbraid (google/cpc) ou fbclid (facebook/paid_social); depois o domínio do referenciador (organic, social ou referral); por fim `(direct)`.
- Do clique, guardamos só o **tipo** do identificador, nunca o valor.
- Fica em `localStorage` (`wz_attribution`), somente com consentimento de análise, e é apagado na revogação.
- É uma atribuição aproximada: bloqueadores, troca de dispositivo e cookies recusados tornam o dado incompleto. Não deve ser apresentada como certeza.

## Validação

- **GA4 DebugView**: instale a extensão "Google Analytics Debugger" ou use o modo de visualização do GTM, aceite os cookies e navegue. A page view deve mostrar `page_location` sem códigos.
- **GTM Preview**: confira na aba Data Layer os eventos `page_view` e `cta_clicked` com os parâmetros acima.
- **Evento ausente?** Confira: consentimento de análise aceito; Rastreamento ativo no Admin; código correto; bloqueador desligado; e, no GTM, se há gatilho para o evento personalizado.

## Testes

`src/lib/analytics/analytics.test.ts` cobre: normalização de rotas com códigos, grupos, page_location seguro, filtro de dados pessoais, atribuição (UTM, gclid, referenciador, direto e expiração), GTM+GA4 sem duplicar, consentimento negado/concedido/revogado, page view única e cliques permitidos e bloqueados.

## Pendente (próximas fases)

Funil de cadastro e onboarding, login, uso de funcionalidades, erros, eventos do servidor (`purchase`/`refund` com a tarifa WiizeCore, somente após o webhook confirmar o pagamento), fila com idempotência, reconciliação, painel Analytics no Admin e atualização da política de cookies.
