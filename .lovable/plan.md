# E-mail já usado no Asaas na ativação de pagamentos

## O problema
Para aprovar a conta de recebimentos, a WiizePay cria um cadastro no Asaas usando o e-mail informado na ativação. O Asaas não aceita um e-mail que já tenha conta lá. Por isso, quem veio do Asaas trava nesse passo.

O e-mail de **login** na WiizePay não muda e pode continuar o mesmo. Só o **e-mail da conta de recebimentos**, enviado ao Asaas, precisa ser diferente.

## O que muda para o usuário
1. **Na etapa de dados**, o campo "E-mail" passa a se chamar **"E-mail da conta de recebimentos"**. Embaixo dele aparece este aviso:
   > Este e-mail é usado para criar sua conta na nossa parceira Asaas. Se você já tem conta no Asaas com este e-mail, use outro. Dica: no Gmail você pode usar seuemail+wiizepay@gmail.com, e as mensagens continuam chegando na mesma caixa.
2. **Botão "Usar uma variação do meu e-mail":** preenche sozinho o formato `seuemail+wiizepay@...`. Esse formato funciona no Gmail e no Outlook.
3. **Se o Asaas recusar por e-mail já cadastrado**, o envio para e mostra uma mensagem clara:
   > Este e-mail já está vinculado a uma conta na nossa parceira Asaas e não pode ser usado de novo. Informe outro e-mail da conta de recebimentos e reenvie.
   Ao lado, aparecem um botão que leva direto ao campo do e-mail e o botão "Reenviar para análise". Dados e documentos continuam salvos.
4. **O mesmo vale para o celular:** a ativação pelo QR Code ganha o mesmo nome do campo, o mesmo aviso e o mesmo botão.

## O que não muda
- O login e o e-mail de acesso à WiizePay.
- Os avisos da WiizePay continuam indo para o e-mail de login da empresa.

## Detalhes técnicos
- `src/lib/asaas-onboarding.server.ts`: em `friendlySendError`, reconhecer o erro de e-mail duplicado do Asaas (status 400 com "email" e "já"/"utilizado"/"cadastrado"/"in use"). Nesse caso, gravar `provider_onboarding.lastErrorCode = "email_in_use"` e usar a mensagem amigável.
- `src/routes/_authenticated/ativacao.tsx`: novo nome do campo, aviso, botão da variação de e-mail e tratamento de `lastErrorCode === "email_in_use"` em `ProcessSteps`, com o botão "Corrigir e-mail", que abre a etapa de dados com o campo em foco.
- `src/routes/ativacao-celular.$token.tsx`: mesmo nome do campo, mesmo aviso e mesmo botão.
- `src/lib/activation.functions.ts`: validar o formato do e-mail antes do envio. Sem mudança no banco: o campo de e-mail continua criptografado no formulário.
- Traduções EN/ES para os textos novos em `src/locales/{en,es}/ui.json`.
