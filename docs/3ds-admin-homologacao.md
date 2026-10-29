# 3DS e contestações — Admin e homologação

## Estado atual
Implementação administrativa preparada. O módulo **não está homologado nem concluído em produção**. Não foi executada cobrança, disputa, desafio real ou publicação nesta etapa.

O ambiente de testes Asaas não reproduz o desafio 3DS. Testes automatizados e sandbox não substituem um teste real na conta de produção habilitada pelo Asaas.

## Operação no Admin
Em `/nimda?secao=chargebacks`, consultar casos paginados por empresa e status, valor, cobrança vinculada, motivo, prazo informado e estado da defesa. O histórico exibe origem, tipo de evento e data; não retorna metadados brutos, arquivos privados ou credenciais.

A lista das últimas 25 tentativas 3DS exibe modalidade e evidência disponível. O valor histórico `authenticated` é tratado como **pagamento confirmado, autenticação não comprovada**: o evento financeiro sozinho não atesta autenticação pelo emissor, liability shift ou proteção contra contestação.

Todos os endpoints passam por `requireMfaAuth` e `assertAdminPage`: papel administrativo, AAL2, nova confirmação de 2FA e senha financeira, prova temporária vinculada à sessão/credenciais. A prova não é persistida pelo navegador. Não se reutilizam funções de defesa/upload da empresa na visão Admin.

## Configuração
- `CHECKOUT_3DS_ENABLED`: flag server-side por ambiente. Manter `false` até habilitação Asaas e teste autorizado. A configuração Vercel não foi alterada ou verificada nesta etapa.
- `checkout_3ds_control`: controle operacional durável somente no servidor, ausente/desligado por padrão; acessos diretos anon/authenticated revogados. Para enviar 3DS, tanto flag quanto liberação operacional precisam estar ligados.
- O Admin pode desativar mesmo com flag desligado. Para liberar teste, precisa de flag ativo, acesso Admin recém-confirmado e declaração explícita de habilitação Asaas/teste autorizado. Essa declaração não representa validação automática pelo provedor.
- Não há consulta administrativa de segredos nem acionamento automático de cobrança real. Ao manter flag false, o checkout não consulta o controle adicional.

## Endpoints Asaas utilizados
- `POST /v3/payments/{id}/payWithCreditCard`: `threeDSecure.callbackUrl`, `deviceInfo` (inclui `timeZoneOffset` em horas e IP obtido no servidor), credencial da conexão original.
- `GET /v3/payments/{id}`: consultar estado em resposta inconclusiva; não presumir que timeout equivale a recusa.
- `GET /v3/chargebacks`: consulta de status, prazo e IDs oficiais.
- `POST /v3/chargebacks/{id}/dispute`: multipart de até 11 arquivos; confirmação de recebimento não significa reversão.

URL de desafio retornada pelo Asaas leva ao banco emissor; retorno ao checkout não confirma pagamento. Status financeiro continua dependente de webhook confiável. Frictionless e ausência de URL não são garantia universal de autenticação.

## Roteiro obrigatório de homologação real
1. Obter confirmação Asaas de habilitação da conta de produção e autorização do teste. Definir valor, cartão e responsável com consentimento; não transmitir cartão/CVV em chat ou logs.
2. Conferir callback HTTPS e inscrição dos eventos oficiais; configurar flag no ambiente certo e liberar operacionalmente o teste pelo Admin. Não assumir que preview e Vercel compartilham configurações.
3. Testar compra avulsa, parcelamento e início de recorrência separadamente, conforme orientação Asaas. Registrar IDs de correlação em área protegida e evidência do provedor — sem PAN/CVV.
4. Exercitar desafio concluído, cancelado/falho, autenticação sem desafio e recusa de captura quando viáveis. Confirmar que o retorno nunca aprova pagamento sozinho.
5. Verificar webhook autêntico, atualização real da cobrança e leitura no Admin/empresa. Confirmar evento duplicado/atrasado e isolamento das contas. Não atribuir liability shift sem evidência explícita.
6. Validar timeout/consulta antes de repetir; cenários de criação concorrente de autenticação e reconciliação de resposta incerta ainda exigem validação integrada.
7. Validar documentos e defesa com caso elegível real autorizado, confirmação Asaas, limites e reserva de envio. Não criar contestação financeira fictícia para teste.
8. Desativar após teste até aprovação operacional; só declarar concluído quando evidências dos cenários exigidos estiverem documentadas.

## Verificações desta fase e limitações
- Testes automatizados cobrem controle combinado, acesso Admin, projeções seguras/filtro de empresa, auditoria sem cartão/CVV/token, eventos repetidos, proteção contra reabertura por eventos atrasados, modalidades e limites de anexos.
- Página pública conferida em tela larga e estreita, sem rolagem horizontal; informa integração preparada e homologação pendente, sem declarar ativação ou liderança de mercado não comprovadas.
- Não foi possível exercitar o Admin autenticado: não havia sessão correspondente ao solicitante. Ao abrir sem sessão, a rota Admin ocultou o conteúdo como página não encontrada; foi observada divergência de renderização do estado não encontrado existente. Esse estado não comprova o fluxo Admin autenticado nem exposição de dados.
- RLS/isolamento com duas sessões reais, concorrência de webhook/criação, upload/defesa reais e desafio 3DS de produção **não validados**. Testes de mocks não substituem esses cenários.
- Pendências anteriores da fase 3: indicadores agregados, aviso na cobrança e reconciliação/alertas periódicos.

## Arquivos
Novos: `admin-chargebacks.{functions,server}.ts`, `admin-chargebacks.test.ts`, `three-ds-policy.ts`, `three-ds-policy.test.ts`, `threeds-webhook.test.ts`, `three-ds-audit.test.ts`, `components/admin/admin-chargebacks.tsx`, este documento; controles no banco via migrations 0048/0049.
Alterados: `nimda.tsx`, `seguranca-e-confianca.tsx`, `threeds.server.ts`, `checkout.functions.ts`, `chargebacks.server.ts`, `chargebacks.test.ts`, `admin-finance.tsx`, traduções EN/ES, `AGENTS.md`, `roadmap.md`.

## Referências
- https://docs.asaas.com/docs/3d-secure
- https://docs.asaas.com/reference/list-chargebacks
- https://docs.asaas.com/reference/create-a-chargeback-dispute