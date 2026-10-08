# Popup de e-mail alternativo na ativação

## A ideia
O cadastro continua igual: e-mail e CPF/CNPJ reais do cliente. Se o Asaas recusar o envio porque **o e-mail já tem conta lá**, aparece um popup pedindo um e-mail alternativo. O cliente digita e reenvia ali mesmo. O CPF/CNPJ continua o mesmo.

## O popup
O visual é o mesmo do aviso de parceria que já existe, com as logos da WiizePay e do Asaas. Texto sugerido:

> **Este e-mail já tem uma conta no Asaas**
> A WiizePay funciona de forma independente, em parceria com o Asaas. Para ativar seus pagamentos, use outro e-mail. Sua conta atual no Asaas continua funcionando normalmente.
>
> Você vai receber nesse novo e-mail o convite para criar sua senha na área de pagamentos.
>
> [ campo: novo e-mail ]
> Dica: no Gmail você pode usar seuemail+wiizepay@gmail.com. As mensagens chegam na mesma caixa.

Botões:
- **"Usar uma variação do meu e-mail":** preenche sozinho o formato com `+wiizepay`.
- **"Salvar e reenviar para análise":** troca o e-mail do cadastro e reenvia.
- **"Agora não".**

Funcionamento:
- O popup abre sozinho na tela de ativação enquanto essa recusa estiver pendente.
- Ele também pode ser aberto pela caixa "O que deu errado", nas etapas do envio.
- O e-mail de login da WiizePay não muda. Os avisos da WiizePay continuam indo para ele.
- Se a recusa for por outro motivo, como CPF/CNPJ, continua aparecendo a mensagem atual com o botão "Reenviar para análise".

## Detalhes técnicos
- `src/lib/asaas-onboarding.server.ts`: reconhecer a recusa 4xx do Asaas por e-mail já em uso, quando a mensagem fala de "email" com "já"/"utiliz"/"cadastr"/"em uso". Nesse caso, gravar `provider_onboarding.lastErrorCode = "email_in_use"`.
- `src/lib/activation.functions.ts`: novo `resubmitWithEmail`, com membro dono ou admin ativo e e-mail validado por zod. Ele grava o novo e-mail no formulário criptografado (`sealForm`), deixa um registro de auditoria e chama o mesmo envio de `submitActivation`, incluindo a regra de 1 aviso por envio.
- `src/components/partner-notice.tsx`: extrair um `PartnerDialog` controlado, com o mesmo visual. O aviso atual não muda.
- `src/routes/_authenticated/ativacao.tsx`: novo `EmailConflictDialog`, ligado a `lastErrorCode`, e o link "Resolver agora" em `ProcessSteps`.
- Traduções EN/ES em `src/locales/{en,es}/ui.json`.
- Sem mudança no banco de dados.

## Observação
Isso segue o que a documentação do Asaas descreve para subcontas comuns. O resultado final só se confirma com um envio real em produção, de um cliente que já tenha conta no Asaas.
