# Central de Contestações — fase 3

## Entrega
- Banco recuperado: migrations `0046_chargebacks_and_payment_authentications.sql` e `0047_chargeback_defense_guards.sql` aplicadas no Lovable Cloud.
- Bucket privado `chargeback-documents`, limite local de 5 MB por arquivo. PDF/JPG/PNG são limites próprios da WiizePay; a referência do endpoint Asaas não especifica MIME/tamanho.
- `/contestacoes` no grupo Cobranças: lista paginada, busca/filtro na página, detalhes, motivo/status/prazo oficiais, documentos e histórico.
- Consulta pontual `GET /v3/chargebacks?limit=100&offset=...`, conta original da cobrança; correspondência por IDs oficiais payment/installment e chargeback.
- Defesa `POST /v3/chargebacks/{id}/dispute` com FormData `files`, até 11 anexos. Confirmação validada por `chargebackId`, `status` e `files` da resposta oficial HTTP 200. Recebimento não significa reversão ou aprovação.
- MFA + membro ativo + `charges.view` para consulta e `charges.edit` para alterações/envio, sempre no servidor. Leitura direta das quatro tabelas por authenticated revogada. Upload/download de arquivos somente no servidor; download assinado por 60 segundos.
- RPCs com bloqueio do caso impedem alteração simultânea de documentos e envio duplicado. Resposta incerta conserva reserva e documentos: não repetir automaticamente. Consulta oficial confirma apenas evidência disponível; ausência de evidência não libera a reserva.

## Configuração
`CHECKOUT_3DS_ENABLED=false` na Vercel até a habilitação e homologação Asaas. Não foi alterada configuração da Vercel nesta etapa. Nenhuma cobrança, disputa real ou publicação foi disparada.

## Arquivos desta etapa
Criados: `src/lib/chargeback-rules.ts`, `src/lib/chargeback-rules.test.ts`, `src/lib/chargeback-center.server.ts`, `src/lib/chargeback-center.functions.ts`, `src/lib/chargeback-center.test.ts`, `src/routes/_authenticated/contestacoes.tsx`, este documento e as migrations 0046/0047 (ferramenta oficial).
Editados: `src/lib/asaas.server.ts`, `src/lib/permissions.ts`, `src/components/app-shell.tsx`, traduções EN/ES `ui.json`, `AGENTS.md`, `roadmap.md`. Tipos do banco regenerados automaticamente.

## Pendências do plano
- Validar upload, remoção e envio reais com conta autorizada e contestação elegível; não fabricar caso financeiro para validar.
- Indicadores agregados de todas as contestações, aviso vinculado na cobrança e seção de autenticação; a lista atual mostra dados reais paginados, sem totais financeiros presumidos.
- Reconciliação periódica e alertas de prazo (cron), integração na Vercel; consulta pontual disponível.
- Fase 4 Admin com desbloqueio obrigatório, configuração operacional 3DS e testes integrados de concorrência/RLS.
- 3DS permanece não homologado: verificar cenário real e evidência do processador, avulso/parcelado/recorrente, falha/desafio/timeout, antes de habilitar.

## Fontes oficiais
- https://docs.asaas.com/reference/listar-chargebacks
- https://docs.asaas.com/reference/list-chargebacks
- https://docs.asaas.com/reference/criar-disputa-de-chargeback
- https://docs.asaas.com/reference/create-a-chargeback-dispute
- https://docs.asaas.com/docs/chargeback