# E-mail de cadastro automático na ativação de pagamentos

## O problema
O Asaas não aceita um e-mail que já tenha conta lá. Clientes que vieram do Asaas travam na ativação.

## A solução
- **O campo "E-mail" sai da ativação**, no computador e no celular.
- **A WiizePay cria sozinha um e-mail exclusivo de cadastro** para cada empresa, por exemplo `conta-7f3a91c2@contas.wiize.com.br`. Ele é usado só no cadastro do Asaas, é sempre o mesmo para aquela empresa e nunca dá conflito.
- **O cliente não vê esse e-mail.** Todos os avisos (enviado, em análise, aprovado, correção pedida) chegam pela WiizePay: no sininho e no e-mail de login da conta.
- **O texto da parceria continua:** "análise em parceria com o Asaas" segue aparecendo como hoje.
- Pendências que o Asaas pedir, como uma etapa segura de selfie, aparecem na tela "Andamento da análise", com botão. O cliente não depende de nenhum e-mail do Asaas.

## Redirecionamento de e-mails: não é necessário
Os e-mails que o Asaas mandar para o endereço de cadastro não chegam a ninguém. Isso não atrapalha: a WiizePay consulta a situação direto no Asaas e avisa o cliente sozinha.

## CPF/CNPJ que já tem conta no Asaas
Aceitar ou não um CPF/CNPJ que já tem conta lá depende de uma liberação na sua conta principal do Asaas. Isso deve ser pedido ao gerente ou ao suporte do Asaas. Enquanto não for liberado, quem for recusado por esse motivo vê uma mensagem clara pedindo para falar com o suporte WiizePay, e o botão "Reenviar para análise" continua disponível.

## Detalhes técnicos
- `src/lib/deploy-config.ts`: nova configuração `providerSignupEmailDomain`, com padrão `contas.wiize.com.br`.
- `src/lib/asaas-onboarding.server.ts`:
  - Em `ensureSubaccount`, o `email` da subconta passa a ser `conta-<HMAC curto do tenantId>@<domínio>`, sempre igual para a mesma empresa. O endereço fica guardado nos dados da conexão, para auditoria.
  - `friendlySendError` ganha uma mensagem própria para CPF/CNPJ já cadastrado.
- `src/lib/activation.functions.ts`: tirar `email` dos campos obrigatórios. Os avisos usam o e-mail de login da empresa, que `notify.server.ts` já usa.
- `src/routes/_authenticated/ativacao.tsx` e `src/routes/ativacao-celular.$token.tsx`: remover o campo de e-mail.
- `src/lib/activation-validation.ts`: deixar de exigir e validar o e-mail.
- Traduções EN/ES dos textos novos.
- Sem mudança no banco de dados.
