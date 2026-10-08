# E-mail de cadastro automático na ativação de pagamentos

## O problema
O Asaas não aceita um e-mail que já tenha conta lá. Clientes que vieram do Asaas travam na ativação.

## A solução
- **O campo "E-mail" sai da ativação**, tanto no computador quanto no celular.
- **A WiizePay cria sozinha um e-mail exclusivo de cadastro** para cada empresa, por exemplo `conta-7f3a91c2@contas.wiize.com.br`. Ele é usado apenas no cadastro do Asaas e é sempre o mesmo para aquela empresa. Como é novo, nunca dá conflito.
- **O cliente não vê esse e-mail.** Todos os avisos (enviado, em análise, aprovado, correção pedida) chegam pela WiizePay: no sininho e no e-mail de login da conta.
- **O texto da parceria continua:** "análise em parceria com o Asaas" segue aparecendo na ativação, como hoje.
- Pendências que o Asaas pede, como uma etapa segura de selfie, continuam aparecendo na tela "Andamento da análise", com botão. O cliente não depende de nenhum e-mail do Asaas.

## O que você precisa fazer (uma vez)
O Asaas manda alguns e-mails ao endereço de cadastro, como confirmações e avisos. Para não perder nada, crie no seu domínio um **redirecionamento "pega-tudo"**: tudo que chegar em `*@contas.wiize.com.br` vai para a caixa da WiizePay, por exemplo `wiizepay@gmail.com`. Dá para fazer isso de graça, por exemplo com o redirecionamento de e-mail da Cloudflare. O domínio fica num único lugar de configuração.

## Observação
O CPF/CNPJ continua precisando ser único no Asaas. Quem já tem conta lá com o mesmo documento ainda pode ser recusado. Nesse caso, a tela mostra uma mensagem clara e o botão de reenviar.

## Detalhes técnicos
- `src/lib/deploy-config.ts`: nova configuração `providerSignupEmailDomain`, com padrão `contas.wiize.com.br`.
- `src/lib/asaas-onboarding.server.ts`: em `ensureSubaccount`, o `email` da subconta passa a ser `conta-<HMAC curto do tenantId>@<domínio>`, sempre igual para a mesma empresa. O alias fica guardado nos dados da conexão, para auditoria. `friendlySendError` ganha uma mensagem específica para documento já cadastrado.
- `src/lib/activation.functions.ts`: remover `email` dos campos obrigatórios no envio. Os avisos usam o e-mail de login da empresa, como já é feito em `notify.server.ts`.
- `src/routes/_authenticated/ativacao.tsx` e `src/routes/ativacao-celular.$token.tsx`: remover o campo de e-mail.
- `src/lib/activation-validation.ts` e `activation-handoff.functions.ts`: deixar de exigir e validar o e-mail.
- Traduções EN/ES dos textos novos.
- Sem mudança no banco de dados.
