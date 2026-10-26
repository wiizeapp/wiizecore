# Fase 4 e 5 — Conta Global Rapyd (modo de testes, USD e EUR)

## Aviso importante
Sem contrato com a Rapyd, tudo roda só em **modo de testes**. As cobranças da tela Global serão de teste, com cartões fictícios. Nenhum dinheiro real entra ou sai. O modo real só será ligado depois do contrato, com aprovação da Rapyd.

## O que você vai ver
- No seletor Brasil/Global, a área **Global** passa a funcionar, com o selo "Modo de testes".
- As mesmas telas do Brasil, mas separadas: Ativação, Clientes, Cobranças, Pagamentos, Saldo e Saques.
- Os valores aparecem só em Dólar (US$) ou Euro (€). Moedas nunca se misturam, e não há conversão para reais.

## Etapas

### Etapa 1 — Conexão com a Rapyd (testes)
- Conectar com as chaves guardadas, assinando cada pedido como a Rapyd exige.
- Fazer uma verificação de saúde que mostre "Conectada (testes)" na tela.
- Registrar um endereço seguro para receber os avisos da Rapyd, conferindo a assinatura de cada aviso.

### Etapa 2 — Ativação Global (igual à subconta Asaas)
- A empresa preenche os dados de recebimento internacional e cria uma carteira própria na Rapyd.
- Pedir senha financeira e confirmação em duas etapas.
- A aprovação é sempre da Rapyd, e a WiizeCore só mostra a situação.

### Etapa 3 — Clientes Global
- Clientes internacionais com país, e-mail e moeda preferida (USD ou EUR).
- Separados dos clientes do Brasil.

### Etapa 4 — Cobranças e pagamento
- Criar uma cobrança em USD ou EUR e gerar um link de pagamento da Rapyd com cartão.
- O status só muda quando chega o aviso confirmado da Rapyd.
- Cancelamento e reembolso com proteção contra repetição.

### Etapa 5 — Saldo e saques Global
- Saldo próprio por moeda, separado do saldo em reais.
- Saque para conta bancária no exterior, com senha financeira e confirmação em duas etapas.
- Nunca deixar o saldo negativo.

### Etapa 6 — Taxas
- Taxa da WiizeCore por moeda, seguindo as configurações de taxas que já existem.
- Você me informa os valores, ou fica 0% até lá.

## Fora desta fase
- Pix, boleto, notas fiscais, lembretes e coproduções na operação Global.
- Conversão entre moedas.
- Modo real (depende do contrato com a Rapyd).

## Detalhes técnicos
- `src/lib/rapyd.server.ts`: cliente HMAC-SHA256 (salt + timestamp; access_key/secret_key), usando a Web Crypto do runtime Worker e a base sandbox `sandboxapi.rapyd.net`.
- Rota `src/routes/api/public/webhooks/rapyd.ts`: confere a assinatura e o timestamp, faz deduplicação por evento com namespace de conexão e responde de forma idempotente.
- Migração aditiva: `global_customers`, `global_payments`, `global_payment_attempts`, `global_withdrawals` e `global_wallet_ledger`, tudo em NUMERIC, com CHECK de moeda em ('USD','EUR'), RLS por empresa e GRANT; ativação dos saldos Global já existentes, limitada a USD/EUR.
- Ativação: Rapyd Wallet (ewallet) + identity/KYC; o status vem dos webhooks da Rapyd.
- Cobranças: Rapyd Checkout Page (`/v1/checkout`). Status por webhook `PAYMENT_COMPLETED` / `PAYMENT_FAILED`.
- Saques: Rapyd Payouts (`/v1/payouts`), com reserva de saldo antes do envio e liberação só quando a Rapyd confirma ou recusa.
- Permissões via `member-access.server.ts`; auditoria via `logAudit`; senha financeira e AAL2 via `finance.server.ts`.
- Testes: assinatura Rapyd, bloqueio de moeda fora de USD/EUR, ledger sem saldo negativo e idempotência do webhook.
- Traduções PT/EN/ES para cada texto novo.
- Entrega em etapas, com verificação no modo de testes ao fim de cada uma.
