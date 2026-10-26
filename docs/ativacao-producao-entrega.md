# Ativação de produção — entrega parcial e evidências

## Estado operacional
**Não concluída e não liberada para produção.** Cobrança permanece desativada (`ACTIVATION_FEE_ENABLED` não configurado). Nenhuma cobrança, subconta ou publicação foi executada. Migrações 0044 e 0045 foram aplicadas ao banco compartilhado: a regra passa a bloquear alterações de ativação não paga inclusive no aplicativo anteriormente publicado.

## Cadastros existentes
Consultas antes/depois confirmaram três registros `in_progress`, preservados sem pagamento fabricado, exclusão ou exceção. Permanecem consultáveis como histórico conforme autorização existente; não podem salvar novas etapas, enviar documentos ou criar subconta sem a taxa confirmada. Após pagamento no mesmo ambiente, retomam os dados existentes.

## Implementado
- Taxa separada do cadastro, 1.990 centavos BRL; cliente não fornece valor/status financeiro.
- Checkout próprio em `/ativacao`, Pix via provedor existente, apresentação voluntária, identificação mínima do pagador e consulta autenticada de estado.
- Gate nas funções existentes, upload comum/celular, triggers de ativação, documentos, handoffs, conexões Asaas e objetos KYC. Escrita direta de KYC negada ao usuário; bucket permanece privado.
- Operações externas duráveis com claim serializado. Caminho manual e caminho do cadastro usam `ensureSubaccount`. Operação incerta só consulta o provedor, sem nova criação cega. Resposta da criação cifrada para recuperar falha de gravação posterior.
- GET da cobrança na conta principal; origem conferida por `/wallets`, ambiente, cliente, referência/finalidade, PIX, R$19,90 e estado `RECEIVED`. Asaas não fornece campo explícito moeda nesse contrato: BRL é fixado pelo produto/API doméstica, sem aceitar outra moeda.
- Eventos de webhook próprios sem payload pessoal, confirmação idempotente via RPC e endpoint de reconciliação. Notificação deduplicada pela infraestrutura existente.
- Documento reenviado preserva versão anterior; pagamento não aprova cadastro. Produção exige aprovação e estados operacionais de conexão em ambiente production.
- Indicador no header, copy contextual no sino e listagem de taxa no Admin protegido existente.

## Migrações e permissões
0044: `activation_fee_payments`, `activation_fee_events`, `activation_provider_operations`, índices de reconciliação, funções de gate/claim/confirmação e restrições.
0045: gate KYC no storage, política restritiva por pasta/empresa, `superseded_at`, histórico documental e escopo de leitura da função de pagamento.
RLS habilitado nas três tabelas novas. Verificação `has_table_privilege`: anon SELECT=false, authenticated INSERT=false, service_role INSERT=true nas três. RPCs de claim/confirmação privadas ao servidor. `activation_fee_paid` acessível ao autenticado somente retorna verdadeiro com vínculo da empresa.

## Endpoints
- Funções internas: `getActivationFee`, `prepareActivationPix`, `refreshActivationFee`, `listAdminActivationFees`; MFA e vínculo ativo, Admin também `assertAdminPage`.
- `/api/public/webhooks/activation-fee`: autenticação Asaas pelo token exclusivo, validação de formato, limite de corpo, evento e reconciliação remota.
- `/api/public/cron/activation-fee`: segredo de tarefas existente; não há agendamento criado.
- Webhook de operações das empresas preservado; nenhuma nova Edge Function.

## Configurações
Reutilizadas: ASAAS_MASTER_API_KEY, ASAAS_ENVIRONMENT, ASAAS_MASTER_WALLET_ID, WISE_PAY_ENCRYPTION_KEY e segredo de cron existente.
Necessárias antes de liberação: `ASAAS_ACTIVATION_WEBHOOK_SECRET` compartilhado com cadastro do webhook principal e `ACTIVATION_FEE_ENABLED` após homologação/termos. Nenhuma secret foi criada/alterada. Configurar webhook na conta principal com URL publicada; não reutilizar API key como autenticação do webhook.

## Evidência real executada
- Asaas sandbox `GET /wallets`: HTTP 200 e wallet configurada correspondente.
- Asaas production `GET /wallets` com credencial disponível: HTTP 401. **Produção não validada.** Ambiente configurado: sandbox.
- Seis arquivos de regressão: 77 testes aprovados. Dois arquivos novos, repetição final: seis testes aprovados. Testes unitários usam entradas sintéticas/mocks, não comprovam integração financeira.
- Sem login `/ativacao` redirecionou para `/auth?modo=entrar`.
- Webhook falso: HTTP 503 por falta de configuração do segredo, sem processamento; não é teste de validação positiva nem comprova resposta 401 com serviço configurado.
- Compilação automática OK após correção do skeleton da tabela.

## Pendências impeditivas
- Sessão solicitante indisponível; fluxo autenticado/visual completo não exercitado. Entrar na prévia com conta autorizada para prosseguir.
- Não executados: emissão/pagamento Pix sandbox real, webhook válido e duplicado, requisições simultâneas reais, falha de banco pós-pagamento, timeout externo de subconta, isolamento com duas contas e arquivos maliciosos.
- Não configurar produção com credencial sandbox. Validar credencial production, conta principal e contrato antes de liberar.
- Recuperação de API key perdida em timeout de subconta requer endpoint/condições oficiais adicionais: listagem encontra conta, mas não revela secret original; manter operação incerta bloqueada até recuperação autorizada.
- Regeneração de cobrança vencida, incidente de pagamento duplicado, reembolso autorizado completo, ações administrativas de recuperação e indicadores agregados completos ainda não implementados.
- Upload mantém assinatura/tamanho e pré-validação existentes; isso não equivale a antivírus/inspeção completa. Histórico e documentos atuais precisam teste integrado.
- Condições da taxa não reembolsável e direitos legais precisam validação jurídica/contratual e publicação nos termos antes de ativar cobrança. Não há promessa de aprovação garantida.

## Homologação e implantação
Manter cobrança fechada; validar sessão, dados sintéticos isolados, Pix sandbox real, webhook oficial e cenários de falha/concorrência. Verificar os três cadastros e histórico antes/depois. Somente após aprovação dos testes e termos preparar production e publicar por solicitação explícita.

## Rollback
Não apagar tabelas, cobranças ou cadastros. Desativar criação de cobranças, preservar eventos e operar recuperação/reconciliação. Reversão de gatilhos/permissões exige migração específica e avaliação de segurança; não restaurar bypass de taxa implicitamente. Aplicativo anterior não conhece os novos gates, portanto reverter código isoladamente não restaura o fluxo antigo.

## Inventário
Novos: activation-fee-policy.ts/.test.ts, activation-fee-security.test.ts, activation-fee.server.ts, activation-fee.functions.ts, admin-activation-fee.functions.ts; activation-fee-checkout.tsx, activation-production-indicator.tsx, admin/activation-fee-table.tsx; rotas de webhook e cron activation-fee; diagnóstico e este relatório; migrações 0044/0045.
Alterados: activation.functions.ts, activation-upload.server.ts, activation-handoff.functions.ts, provider.functions.ts, asaas-onboarding.server.ts, asaas.server.ts, routes/_authenticated/ativacao.tsx, activation-notice.tsx, app-shell.tsx, admin-activations.tsx, traduções en/es/ui.json, AGENTS.md e roadmap.md. Tipos do banco regenerados automaticamente. Configuração e valores secretos não alterados.