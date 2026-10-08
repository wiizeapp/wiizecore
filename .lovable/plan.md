# E-mail de cadastro criado pela WiizePay

## A solução
- **O campo "E-mail" sai da ativação**, no computador e no celular.
- **A WiizePay cria um e-mail exclusivo de cadastro para cada empresa**, por exemplo `conta-7f3a91c2@contas.wiize.com.br`. Ele é usado só no cadastro do Asaas, é sempre o mesmo para aquela empresa e nunca conflita com uma conta que já exista.
- **O cliente não vê esse e-mail.** O CPF/CNPJ continua sendo o verdadeiro dele.
- **Avisos:** tudo chega pela WiizePay, no sininho, no e-mail de login da conta e na tela "Ative seus pagamentos". Isso inclui envio, análise, pedido de correção, documento recusado e aprovação.
- **Pendências do Asaas**, como selfie ou prova de vida, aparecem em "Andamento da análise" com o botão "Concluir etapa segura". O cliente nunca depende de um e-mail do Asaas.
- O texto "em parceria com o Asaas" continua como está hoje.

## Avisos novos
- **Documento recusado ou etapa pendente:** quando a atualização da situação encontrar algo novo, sai um aviso no sininho e por e-mail, com o que corrigir.
- **Lembrete diário:** enquanto houver pendência há mais de 24 horas, o cliente recebe no máximo um lembrete por dia.

## Atenção (precisa confirmar com o Asaas)
Na subconta **comum**, o Asaas manda um e-mail de ativação para o endereço do cadastro. Nesse e-mail, o titular cria a senha e envia os documentos. Com o e-mail criado pela WiizePay, ninguém recebe essa mensagem. Por isso, este plano depende de a sua conta usar o modelo **BaaS**, em que os documentos vão pela própria WiizePay, como o sistema já faz hoje.

Pergunte ao seu gerente do Asaas se as subcontas da sua conta são BaaS. Se não forem, o cadastro pode não ser aprovado.

## Detalhes técnicos
- `src/lib/deploy-config.ts`: `providerSignupEmailDomain`, com padrão `contas.wiize.com.br`.
- `src/lib/asaas-onboarding.server.ts`:
  - `ensureSubaccount` passa a enviar `email: conta-<HMAC curto do tenantId>@<domínio>` e guarda o endereço nos dados da conexão, para auditoria.
  - `syncProviderOnboarding` avisa por `notifyTenant` quando aparecer uma pendência ou recusa nova, com chave de deduplicação por item e status.
- `src/routes/api/public/cron/notifications.ts`: lembrete diário de pendência da ativação, deduplicado por dia.
- `src/lib/activation.functions.ts`, `src/lib/activation-validation.ts` e `src/lib/activation-handoff.functions.ts`: o e-mail deixa de ser obrigatório e validado.
- `src/routes/_authenticated/ativacao.tsx` e `src/routes/ativacao-celular.$token.tsx`:
  - remover o campo de e-mail;
  - incluir o texto "Avisaremos tudo por aqui e no seu e-mail de acesso".
- Traduções EN/ES dos textos novos.
- Sem mudança no banco de dados.
