# E-mail de cadastro criado pela WiizePay + caixa da WiizePay

## A solução
- **O campo "E-mail" sai da ativação**, no computador e no celular.
- **A WiizePay cria um e-mail exclusivo para cada empresa**, por exemplo `conta-7f3a91c2@contas.wiize.com.br`. Ele é usado só no cadastro do Asaas e nunca conflita com uma conta que já exista. O CPF/CNPJ continua sendo o verdadeiro.
- **O cliente não vê esse e-mail.** Tudo o que o Asaas mandar para ele vai para **uma caixa só sua**, por exemplo `cadastros.wiizepay@gmail.com`. Inclui o e-mail de ativação.
- **Os documentos continuam indo pela WiizePay.** O cliente não precisa entrar no Asaas nem criar senha.
- **Avisos:** tudo chega pela WiizePay, no sininho, no e-mail de login e na tela "Ative seus pagamentos". Isso cobre envio, análise, pedido de correção, documento recusado e aprovação. Enquanto houver pendência, sai no máximo um lembrete por dia.
- Pendências do Asaas, como selfie ou prova de vida, aparecem em "Andamento da análise", com o botão "Concluir etapa segura".
- O texto "em parceria com o Asaas" continua como está hoje.

## O que você precisa fazer (uma vez, uns 10 minutos, de graça)
1. No painel onde está o domínio `wiize.com.br`, ative o **redirecionamento de e-mail** (por exemplo, o "Email Routing" da Cloudflare).
2. Crie a regra **"pega-tudo"**: tudo que chegar em `*@contas.wiize.com.br` vai para a sua caixa de cadastros.
3. Me diga qual caixa você escolheu, que eu deixo anotada na configuração.

Depois de pronto, eu te passo o passo a passo detalhado do painel que você usa.

Se o Asaas pedir alguma ação pelo e-mail de ativação, ela chega nessa caixa e você resolve pelo cliente.

## Detalhes técnicos
- `src/lib/deploy-config.ts`: `providerSignupEmailDomain` (padrão `contas.wiize.com.br`).
- `src/lib/asaas-onboarding.server.ts`:
  - `ensureSubaccount` envia `email: conta-<HMAC curto do tenantId>@<domínio>` e guarda o endereço nos dados da conexão, para auditoria.
  - `syncProviderOnboarding` avisa o cliente por `notifyTenant` quando surge uma pendência ou recusa nova, com chave de deduplicação por item e status.
- `src/routes/api/public/cron/notifications.ts`: lembrete diário da pendência de ativação, com deduplicação por dia.
- `src/lib/activation.functions.ts`, `src/lib/activation-validation.ts` e `src/lib/activation-handoff.functions.ts`: o e-mail deixa de ser obrigatório e de ser validado.
- `src/routes/_authenticated/ativacao.tsx` e `src/routes/ativacao-celular.$token.tsx`: remover o campo e mostrar o texto "Avisaremos tudo por aqui e no seu e-mail de acesso".
- Traduções EN/ES dos textos novos.
- Sem mudança no banco de dados.

## Observação
O resultado só se confirma com um cadastro real em produção, depois que o redirecionamento estiver ativo.
