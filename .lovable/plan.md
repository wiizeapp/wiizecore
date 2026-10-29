# Plano — 3DS2 e Central de Contestações (Chargebacks)

## Diagnóstico

- O checkout com cartão já passa por `payCheckoutWithCard` → Asaas `payWithCreditCard`, com confirmação só via webhook. Hoje não existe etapa de autenticação 3DS.
- Os webhooks do Asaas já são validados, deduplicados e auditados; os eventos de chargeback já estão inscritos, mas `PAYMENT_CHARGEBACK_DISPUTE` é descartado hoje e a central de contestações não existe (o item no menu administrativo é um placeholder).
- Base reutilizável existente: notificações no sininho (`notify.server.ts`), auditoria (`audit.server.ts`), uploads privados com validação de conteúdo e URLs assinadas (padrão KYC), cron autenticado e design system interno (`src/components/ds`).
- **Dependência externa:** o 3DS precisa ser habilitado pela Asaas na conta de produção (contato com o suporte deles). Até lá, o recurso fica desligado por configuração e o checkout continua funcionando exatamente como hoje.

## Confirmado na documentação oficial do Asaas (consulta realizada)

- `POST /v3/payments/{id}/payWithCreditCard` aceita os objetos `threeDSecure` (com `callbackUrl` HTTPS, até 2000 caracteres) e `deviceInfo` (`colorDepth`, `screenHeight`, `screenWidth`, `timeZoneOffset` **em horas**, `language`, `userAgent`, `remoteIp`). Os mesmos objetos valem para `POST /v3/payments` e `POST /v3/installments`.
- Não existe rota de pagamento no nível do parcelamento: parcelamento já criado é pago por `payWithCreditCard` com o `id` da primeira parcela em aberto (`GET /v3/installments/{id}/payments` lista as parcelas).
- Resposta: `threeDSecureChallengeUrl` preenchida = redirecionar ao desafio; `null` = autenticação silenciosa (frictionless). O retorno do cliente à `callbackUrl` **nunca** confirma pagamento — só webhook ou consulta autenticada.
- **A operação de pagar com cartão não é idempotente:** em timeout ou resposta inconclusiva, consultar o estado da cobrança antes de repetir.
- Eventos oficiais do fluxo 3DS: `PAYMENT_CONFIRMED`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED`.
- Eventos oficiais de chargeback: `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE` (disputa apresentada), `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` (disputa vencida, aguardando repasse). Estornos (`PAYMENT_REFUNDED` etc.) são fluxo separado e já existem.
- Eventos de análise de risco do cartão (`PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_APPROVED_BY_RISK_ANALYSIS`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_AUTHORIZED`) serão mapeados no conversor, pois pertencem ao fluxo de cartão.
- Status oficiais do chargeback: `REQUESTED`, `IN_DISPUTE`, `DISPUTE_LOST`, `REVERSED`, `DONE`; motivos em enum oficial (ex.: `FRAUD`, `COMMERCIAL_DISAGREEMENT`) — valores preservados no banco e traduzidos só na exibição.
- Defesa: `POST /v3/chargebacks/{id}/dispute`, multipart, até 11 arquivos; `GET /v3/chargebacks` para reconciliação, com `deadlineToSendDisputeDocuments` quando disponível.
- Sandbox aprova tudo automaticamente: o desafio real só se homologa em produção com a Asaas.

## Fases

### Fase 1 — Banco de dados e webhooks (fundação)
Migração única com:
- `payment_authentications`: cada fluxo 3DS (cobrança, tentativa, modalidade avulsa/parcelada/recorrente, estado, resultado, correlação, timestamps) — sem dados de cartão.
- `chargeback_cases`: contestação central (IDs Asaas, cobrança, tenant, valor NUMERIC, motivo, status oficial, prazo).
- `chargeback_documents`: metadados de evidências (caminho privado, tipo, tamanho, estado de envio).
- `chargeback_events`: histórico imutável (append-only) por caso.
- Todas com GRANT + RLS por tenant; escrita sensível só via `service_role`/servidor.
- Bucket privado `chargeback-documents` com políticas restritas em `storage.objects`.

Webhooks (`src/routes/api/public/webhooks/asaas.ts`, `src/lib/billing.server.ts`, `src/lib/asaas.server.ts`):
- Mapear no conversor: `PAYMENT_CHARGEBACK_DISPUTE` (hoje descartado), `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED` e os quatro eventos de análise de risco.
- Eventos desconhecidos: registrar para diagnóstico (auditoria/evento persistido), sem descarte silencioso e sem quebrar o processamento.
- Processador de contestações: localiza cobrança e tenant, cria/atualiza `chargeback_cases`, grava no histórico, notifica o sininho com deduplicação, audita — reutilizando `webhook_events`, claim atômico e idempotência existentes.

### Fase 2 — 3DS2 no checkout com cartão (desligado por padrão)
- Configuração: flag por ambiente + estados de habilitação (não configurado / aguardando Asaas / habilitado / indisponível / erro). **Desligado por padrão** até a habilitação e validação da conta de produção; com o flag desligado, o fluxo atual permanece byte a byte o mesmo.
- Adaptador Asaas: enviar `threeDSecure.callbackUrl` + `deviceInfo` em `payWithCreditCard`; `remoteIp` obtido no backend (cabeçalhos confiáveis de proxy); `timeZoneOffset` em horas.
- Checkout: coletar dados do dispositivo no navegador; se vier `threeDSecureChallengeUrl`, redirecionar ao desafio do banco; página pública de retorno `/checkout/retorno-3ds` mostrando "aguardando confirmação" e consultando o status — nunca confirmar pelo retorno.
- Fluxos separados: avulso, parcelado e recorrente cada um com sua própria autenticação vinculada à transação correspondente; nenhuma autenticação é reutilizada entre compras. Renovações automáticas não abrem desafio; se uma renovação exigir autenticação, registrar pendência e oferecer regularização segura (conforme as regras oficiais de recorrência do Asaas).
- Uma autenticação por tentativa de pagamento (não por clique/recarga/webhook repetido); em resposta inconclusiva, consultar o estado da cobrança antes de repetir.
- Estados visuais: preparando, aguardando banco, autenticação concluída, confirmado, não concluído, recusado, não foi possível confirmar.
- Nada é apresentado como "autenticado" ou "protegido" sem evidência real retornada pelo processador.

### Fase 3 — Central de Contestações (área interna)
- Rota `_authenticated/contestacoes`: indicadores reais (abertas, valor contestado, documentos pendentes, prazos próximos, revertidas) e tabela com busca/filtros/paginação via `src/components/ds`; zero ou estado vazio quando não houver dados.
- Detalhes da contestação: cabeçalho (valor, cliente, cobrança, status, prazo quando informado pelo Asaas), linha do tempo (eventos Asaas × ações do usuário), seção "O que precisa ser enviado" com instruções reais — sem lista fictícia de documentos obrigatórios.
- Upload de evidências: validação de tipo/tamanho/conteúdo no servidor, bucket privado, URL assinada curta, remoção antes do envio.
- Envio da defesa: `POST /v3/chargebacks/{id}/dispute` pelo backend com a credencial da conta correta; verificação de propriedade e prazo no servidor; confirmação antes do envio; **estado só muda para "defesa enviada" após resposta confirmada da API**; erro mantém documentos e permite nova tentativa sem duplicar.
- Aviso da contestação na página da cobrança + seção "Segurança e autenticação" (status 3DS quando houver evidência).
- Sininho: novos eventos, prazos próximos, mudanças de estado, com deduplicação.
- Reconciliação periódica via `GET /v3/chargebacks` em cron autenticado (agendamento configurado depois).

### Fase 4 — Admin e testes
- Substituir o placeholder "Chargebacks" do admin pela visão operacional com `assertAdminPage`; configuração administrativa do 3DS (estado, habilitar/desabilitar, últimas tentativas).
- Testes automatizados: conversor de eventos (incluindo os novos), idempotência de webhook duplicado/fora de ordem, isolamento entre contas (RLS), validação de upload, estados do fluxo 3DS com o flag ligado e desligado, ausência de dados sensíveis nos logs.
- Documentação em `docs/`: endpoints usados, variáveis novas (sem valores), etapas de homologação.

## Antes de alterar o checkout (Fase 2), será apresentado
A lista de arquivos e funções a modificar, as migrações envolvidas e os testes previstos, para conferência.

## Fora do escopo / limitações
- O módulo 3DS só será considerado concluído após validação da integração real e dos cenários de autenticação na conta de produção habilitada pela Asaas.
- Não há garantia de reversão de chargeback: quem decide é o processador; o sistema acompanha e envia a defesa.
- Nenhuma credencial nova no frontend; segredos novos ficam só no backend.

## Detalhes técnicos
- Dinheiro em NUMERIC/Decimal; status de pagamento só muda por webhook confiável; enums do Asaas preservados e traduzidos só na exibição.
- Strings novas em PT-BR com chaves em `en/es` `ui.json` na mesma alteração.
- Migrações seguem: CREATE TABLE → GRANT → ENABLE RLS → POLICIES na mesma migração.
- Logs sem PAN/CVV; apenas last4 onde já permitido.
