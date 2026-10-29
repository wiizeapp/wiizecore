# Plano — 3DS2 e Central de Contestações (Chargebacks)

## Contexto do diagnóstico

- O checkout com cartão já passa por `payCheckoutWithCard` → `payWithCreditCard` do Asaas, com confirmação só via webhook. Hoje não existe nenhuma etapa de autenticação 3DS.
- Os webhooks do Asaas já são validados, deduplicados e auditados, e os eventos `PAYMENT_CHARGEBACK_REQUESTED` e `PAYMENT_CHARGEBACK_DISPUTE` já estão inscritos — mas `DISPUTE` é descartado hoje e nenhuma central de contestações existe (o item no menu administrativo é um placeholder).
- Já existem base reutilizável: notificações no sininho (`notify.server.ts`), auditoria (`audit.server.ts`), uploads privados com validação de conteúdo e URLs assinadas (padrão do KYC), cron autenticado e o design system interno (`src/components/ds`).
- **Dependência externa:** o 3DS precisa ser habilitado pela Asaas na conta de produção (contato com o suporte deles). Sem isso, o recurso fica desligado por configuração e o checkout continua funcionando como hoje.

## Fases

### Fase 1 — Banco de dados e webhooks (fundação)
Migração única com:
- `payment_authentications`: registro de cada fluxo 3DS (cobrança, tentativa, estado, resultado, correlação, timestamps) — sem dados de cartão.
- `chargeback_cases`: contestação central (IDs Asaas, cobrança, tenant, valor NUMERIC, motivo, status oficial, prazo).
- `chargeback_documents`: metadados de evidências (caminho privado, tipo, tamanho, estado de envio).
- `chargeback_events`: histórico imutável (append-only) por caso.
- Todas com GRANT + RLS por tenant; `service_role` para escrita via servidor.
- Bucket privado `chargeback-documents` com políticas restritas.

Webhooks (`src/routes/api/public/webhooks/asaas.ts` + `asaas.server.ts`):
- Mapear `PAYMENT_CHARGEBACK_DISPUTE` (hoje descartado) e `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` no conversor de eventos.
- Processador de contestações: localiza cobrança/tenant, cria/atualiza `chargeback_cases`, grava evento no histórico, notifica o sininho com deduplicação, audita.
- Mapear `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` e `PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED` para o fluxo 3DS.
- Reutilizar infraestrutura existente: persistência em `webhook_events`, claim atômico, idempotência, descarte de tentativas substituídas. Sem arquitetura paralela.

### Fase 2 — 3DS2 no checkout com cartão
- Adaptador Asaas: enviar `threeDSecure.callbackUrl` + `deviceInfo` em `payWithCreditCard` (cobrança avulsa e parcelada, via `POST /payments/{id}/payWithCreditCard`).
- Checkout: coletar dados do dispositivo no navegador (profundidade de cor, tela, fuso em horas, idioma, user-agent); IP real no backend.
- Resposta com `threeDSecureChallengeUrl` → redirecionar o cliente ao desafio do banco; página de retorno (`/checkout/retorno-3ds`) com estado "aguardando confirmação" — nunca confirmar pagamento pelo retorno, só por webhook/consulta autenticada.
- Estados visuais: preparando, aguardando banco, autenticado, confirmado, não concluído, recusado.
- Registrar cada fluxo em `payment_authentications` + auditoria; idempotência (uma autenticação por tentativa de pagamento, não por clique/recarga).
- Flag de configuração por ambiente: 3DS desligado até a Asaas habilitar; com o flag desligado o fluxo atual continua idêntico. Estados de configuração (não configurado / aguardando Asaas / habilitado / indisponível) na área administrativa.
- Recorrência/renovações: não abrir desafio em cobranças automáticas; se a renovação exigir autenticação, registrar pendência e oferecer regularização segura.

### Fase 3 — Central de Contestações (área interna)
- Rota `_authenticated/contestacoes`: dashboard com indicadores reais (abertas, valor contestado, documentos pendentes, prazos próximos, revertidas), tabela com busca/filtros/paginação usando `src/components/ds`.
- Rota de detalhes da contestação: cabeçalho (valor, cliente, cobrança, status, prazo), linha do tempo (eventos Asaas × ações do usuário), seção "O que precisa ser enviado".
- Upload de evidências: validação de tipo/tamanho/conteúdo no servidor, bucket privado, URL assinada curta, remoção antes do envio.
- Envio da defesa: `POST /v3/chargebacks/{id}/dispute` (multipart, até 11 arquivos) pelo backend com a credencial da conta correta; confirmação antes do envio; estado só muda com resposta confirmada; erro mantém documentos e permite nova tentativa sem duplicar.
- Aviso da contestação dentro da página de detalhes da cobrança + seção "Segurança e autenticação" (status do 3DS).
- Notificações no sininho para novos eventos, prazos próximos e mudanças de estado, com deduplicação.
- Rotina de reconciliação via `GET /v3/chargebacks` em cron autenticado (agendamento fica pendente de configuração).

### Fase 4 — Área administrativa e testes
- Substituir o placeholder "Chargebacks" do admin pela visão operacional (todas as contas, com `assertAdminPage`).
- Configuração administrativa do 3DS (consultar estado, habilitar/desabilitar tentativa, últimas tentativas).
- Testes automatizados: conversor de eventos (incl. `DISPUTE`), idempotência de webhook duplicado/fora de ordem, isolamento entre contas (RLS), validação de upload, estados do fluxo 3DS, máscara de dados sensíveis.
- Documentação em `docs/` com endpoints usados, variáveis novas e etapas de homologação.

## Fora do escopo / limitações
- Sandbox da Asaas aprova tudo automaticamente: o desafio 3DS real só pode ser homologado em produção após a Asaas habilitar o recurso.
- Não há garantia de reversão de chargeback; o sistema acompanha e envia defesa, quem decide é o processador.
- Nenhuma credencial nova é exposta no frontend; segredos novos (se houver) ficam só no backend.

## Detalhes técnicos
- Dinheiro em NUMERIC/Decimal; status de pagamento só muda por webhook confiável; enums do Asaas preservados e traduzidos só na exibição.
- Novas strings visíveis em PT-BR com chaves em `en/es` `ui.json` na mesma alteração.
- Tabelas novas seguem a regra: CREATE TABLE → GRANT → ENABLE RLS → POLICIES na mesma migração.
- Logs sem PAN/CVV; apenas last4 onde já permitido.
- Reuso: `notify.server.ts`, `audit.server.ts`, `cron-auth.server.ts`, padrão de upload do KYC, `webhook_events`, `payment_attempts`.
