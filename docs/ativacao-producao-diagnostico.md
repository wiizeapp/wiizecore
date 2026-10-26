# Diagnóstico inicial — ativação paga de produção

## Evidência consultada
Auditoria de código e consultas de estrutura/políticas no Lovable Cloud, sem operações financeiras ou mudança de schema. Existem três cadastros `in_progress` e nenhuma conexão Asaas registrada. Isso não comprova configuração externa ou disponibilidade de credenciais.

## Reutilização
- TanStack Start, funções internas com MFA, autorização por empresa e Admin com confirmação reforçada.
- `activation.functions.ts`, `/ativacao`, validação CPF/CNPJ, rascunho cifrado e upload privado `kyc-documents` (limite do bucket 10 MB).
- `AsaasProvider`, APIs sandbox/produção, criação de subcontas e espelhamento da análise do Asaas.
- `activation-handoff.functions.ts` para continuação temporária no celular.
- Auditoria central, notificações deduplicadas, sino/header e tela administrativa existentes.

## Lacunas e conflitos
- Não existe taxa/gate financeiro na ativação, upload ou continuação no celular.
- `ensureSubaccount` e `createAsaasSubaccount` são caminhos distintos de criação, sem trava durável contra criação externa simultânea ou timeout incerto.
- Webhook atual autentica por conexão da empresa. A taxa anterior à criação de subconta necessita cobrança na conta principal, com finalidade isolada e autenticação própria compatível com o mecanismo Asaas.
- `submit_activation` valida documentos/consentimentos, mas não pagamento. `can_receive_payments` hoje verifica somente status aprovado, sem diferenciar produção e capacidade operacional.
- RLS consultada oferece leitura a membros e exige MFA; revisar ACL das RPCs, escrita direta e storage ao inserir gate, sem enfraquecer isolamento.
- Campos financeiros da API usam número na serialização; validar a taxa em centavos/Decimal e registrar valores exatos.
- Aprovação é exclusiva do Asaas. Não implementar aprovação manual no Admin nem promessa de criação após correção.
- Não foram encontrados termos específicos aprovados para a nova taxa. Política comercial informada: não reembolsável; precisa preservar direitos legais e aprovação contratual.

## Alterações previstas
Cobrança dedicada à ativação com tentativas/eventos e operações duráveis; RLS/grants explícitos; confirmação remota e idempotente; reconciliação; gate em todas as entradas; checkout real; estados financeiros separados do cadastro; indicadores reais no Admin; documentação e testes.

## Validações ainda necessárias
Credenciais e conta principal Asaas, cadastro do webhook, comportamento oficial de recuperação após timeout, termos e política aprovados, sessões autorizadas e testes sandbox ponta a ponta. Nenhuma integração financeira foi declarada validada por esta auditoria.