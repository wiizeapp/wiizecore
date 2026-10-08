# E-mail de cadastro automático (sem mostrar a parceira)

## O problema
Para aprovar os recebimentos, a WiizePay abre uma conta na parceira de pagamentos. Esse cadastro precisa de um e-mail que ainda não exista lá. Clientes que já tinham conta na parceira travam nesse passo. Além disso, o cliente não deve ficar sabendo da parceira.

## A solução
A WiizePay cria sozinha, para cada empresa, um **e-mail exclusivo de cadastro** no domínio da WiizePay. Exemplo: `conta-7f3a91c2@contas.wiize.com.br`. Esse e-mail é usado apenas no cadastro da parceira.

- O cliente continua digitando o próprio e-mail normalmente. Ele é usado no login, nos avisos e no contato.
- O cliente nunca vê o e-mail de cadastro nem o nome da parceira.
- Como esse e-mail é único e novo, nunca dá conflito, mesmo para quem já tinha conta na parceira.

## Textos sem o nome da parceira
- Na tela de ativação, nas etapas e nos erros, "Asaas" vira "análise da WiizePay" ou "instituição de pagamento".
  - Exemplo: "Conta criada na instituição de pagamento" passa a ser "Cadastro registrado".
  - Exemplo: "Análise do Asaas" passa a ser "Análise de segurança".
- Mensagens de recusa que vêm da parceira são reescritas antes de aparecer para o cliente. Nomes e links da parceira são removidos.
- Isso também vale para o sininho e para o e-mail de "Cadastro enviado para análise".

## O que você precisa fazer (uma vez)
A parceira manda para o e-mail de cadastro algumas mensagens importantes, como confirmações e avisos da conta. Para você recebê-las, é preciso criar no seu provedor de e-mail um **redirecionamento "pega-tudo"**:

- Tudo que chegar em `*@contas.wiize.com.br` vai para uma caixa da WiizePay, por exemplo `wiizepay@gmail.com`.
- Dá para fazer isso de graça, por exemplo com o redirecionamento de e-mail da Cloudflare ou com o painel do seu domínio.
- Sem esse redirecionamento, o cadastro funciona, mas você não recebe essas mensagens.

O domínio usado vai ficar num único lugar de configuração, para você poder trocar depois.

## Observação
O cliente informa o próprio celular, CPF/CNPJ e documentos. Isso continua igual, porque a parceira exige essas informações para aprovar. Por isso, o CPF/CNPJ continua precisando ser único. Quem já tem conta na parceira com o mesmo CPF/CNPJ ainda pode ser recusado. Nesse caso, a mensagem pede para falar com o suporte WiizePay, sem citar a parceira.

## Detalhes técnicos
- `src/lib/deploy-config.ts`: nova configuração `providerSignupEmailDomain` (padrão `contas.wiize.com.br`).
- `src/lib/asaas-onboarding.server.ts`, em `ensureSubaccount`:
  - O `email` da subconta passa a ser `conta-<8 primeiros caracteres do hash HMAC do tenantId>@<domínio>`, sempre o mesmo para a empresa.
  - O e-mail do cliente vai como `email` apenas se o provedor exigir. Caso contrário, vai só para o contato interno.
  - O alias fica gravado em `provider_connections` (campo de metadados existente) para auditoria.
  - `friendlySendError` filtra menções a "Asaas" e URLs do provedor e trata o erro de documento duplicado com uma mensagem própria.
- `src/lib/activation.functions.ts`: textos do aviso de envio sem o nome da parceira.
- `src/routes/_authenticated/ativacao.tsx`: rótulos das etapas, `NextSteps`, `StatusCard` e `ProviderPanel` sem o nome da parceira.
- Traduções EN/ES em `src/locales/{en,es}/ui.json`.
- Sem mudança no banco de dados.
