# Aviso "você já tem conta no Asaas" na ativação

## Ideia
O cadastro continua igual: mesmo e-mail, mesmo CPF/CNPJ, mesmo fluxo. A única novidade é para quando o Asaas recusar o envio porque o e-mail ou o CPF/CNPJ já tem uma conta lá. Nesse caso, a WiizePay mostra um popup explicando o que fazer.

## O popup
Ele usa o mesmo visual do aviso de parceria que já existe: logo da WiizePay, logo do Asaas e o mesmo estilo de janela. O texto sugerido é:

> **Encontramos uma conta Asaas com seus dados**
> A WiizePay funciona de forma independente, em parceria com o Asaas, que cuida da parte de pagamentos. Por isso, o mesmo e-mail ou CPF/CNPJ não pode ser usado em duas contas ao mesmo tempo.
>
> **Para ativar a WiizePay, você pode:**
> 1. Informar outro e-mail na etapa de dados e reenviar. Isso resolve quando o conflito é só o e-mail.
> 2. Encerrar sua conta no Asaas e depois clicar em "Reenviar para análise". Isso é necessário quando o conflito é o CPF/CNPJ.
>
> Seus dados e documentos continuam salvos.

Botões do popup:
- **"Trocar e-mail":** leva direto ao campo de e-mail. Aparece só quando o conflito é o e-mail.
- **"Reenviar para análise".**
- **"Fechar".**

O popup abre sozinho na tela de ativação sempre que esse tipo de recusa estiver pendente. Ele também pode ser reaberto pela caixa "O que deu errado", nas etapas do envio.

## Detalhes técnicos
- `src/lib/asaas-onboarding.server.ts`: em `friendlySendError`/`sendActivationToProvider`, reconhecer recusas 4xx do Asaas que falam de e-mail ou CPF/CNPJ "já" cadastrado, utilizado ou em uso. Gravar `provider_onboarding.lastErrorCode` como `email_in_use` ou `document_in_use`, junto com a mensagem amigável.
- `src/components/partner-notice.tsx`: extrair o visual (logos + estrutura do diálogo) para um `PartnerDialog` controlado, reutilizado pelo aviso atual e pelo novo popup. O aviso atual continua igual.
- `src/routes/_authenticated/ativacao.tsx`: novo `AsaasConflictDialog`, que abre quando `lastErrorCode` indica conflito, com as ações acima. `ProcessSteps` ganha o link "Ver como resolver".
- Traduções EN/ES dos textos novos em `src/locales/{en,es}/ui.json`.
- Sem mudança no banco de dados.

## Observação
Qual opção resolve depende da regra do Asaas, e o código não tem como garantir isso. Vale confirmar com o seu gerente do Asaas se encerrar a conta antiga libera o CPF/CNPJ para a nova.
