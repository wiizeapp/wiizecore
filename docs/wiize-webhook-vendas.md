# Prompt para o Wiize – receber vendas da WiizePay

Cole o texto abaixo no projeto Wiize (LB2):

---

Implemente o recebimento dos avisos de venda da WiizePay e use-os para alimentar Vendas e Receita (MRR, receita recebida, inadimplência).

## 1. Endpoint
Use o endpoint de webhook WiizePay que já existe (o mesmo configurado na integração). Ele recebe `POST` com JSON.

Cabeçalhos:
- `X-Wiize-Pay-Timestamp`: segundos Unix
- `X-Wiize-Pay-Nonce`: texto aleatório
- `X-Wiize-Pay-Signature`: `sha256=` + HMAC-SHA256 hex de `${timestamp}.${nonce}.${corpoBruto}` com o segredo do webhook
- `Idempotency-Key`: igual ao `event_id`

Validação obrigatória, nesta ordem:
1. Ler o corpo bruto (antes de converter em JSON) e recusar se tiver mais de 64 KB.
2. Recusar com 401 se o horário tiver mais de 5 minutos de diferença ou se a assinatura não bater. Compare em tempo constante.
3. Recusar nonce repetido. Guarde os nonces por 10 minutos.
4. Gravar `event_id` numa tabela de eventos com índice único. Se já existir, responder 200 sem processar.
5. Responder 2xx rápido. Qualquer outra resposta faz a WiizePay tentar de novo em 1 min, 5 min, 30 min, 2 h e 12 h.

## 2. Formato
```json
{
  "event_id": "sevt_...",
  "type": "sale.created | sale.updated | sale.payment_received | sale.overdue | sale.cancelled | sale.refunded",
  "occurred_at": "2026-10-08T13:20:00Z",
  "data": {
    "sale_id": "uuid (id estável da venda na WiizePay)",
    "organization_id": "código da conta no Wiize (null se a empresa não conectou a sincronização de clientes)",
    "tenant_id": "uuid da empresa na WiizePay",
    "customer": { "source": "wiize", "wiize_customer_id": "id do lead/cliente no Wiize" }
             /* ou */ { "source": "wiizepay", "name": "Fulano", "document": "12345678901", "email": "a@b.com" },
    "type": "one_time | installment | recurring",
    "type_label": "À vista | Parcelado | Recorrente",
    "total_amount": 350.00,
    "installment_amount": 350.00,
    "installments": 1,              // null = indeterminado (recorrente)
    "recurrence_frequency": "monthly", // weekly, biweekly, monthly, quarterly, semiannual, yearly; null se não recorrente
    "starts_on": "2026-10-10",
    "expires_on": "2027-10-10",     // null = indeterminado
    "status": "awaiting_first_payment | active | paid | overdue_installment | expired | cancelled | refunded",
    "status_label": "Aguardando 1º pagamento",
    "paid_installments": 0,
    "amount_received": 0.00,
    "last_paid_at": null,
    "next_due_on": "2026-10-10",
    "payment_method": "pix | boleto | credit_card",
    "description": "texto",
    "service": { "id": "uuid", "name": "Consultoria" },
    "contract_id": "uuid ou null",
    "currency": "BRL"
  }
}
```
Os valores vêm em reais, com 2 casas decimais. Guarde-os como NUMERIC/Decimal, nunca como float.

Regras dos campos:
- **total_amount**: à vista = valor cobrado; parcelado = soma das parcelas; recorrente = valor de um ciclo.
- **installment_amount**: parcelado = valor da parcela; recorrente = valor do ciclo; à vista = valor total.
- **expires_on**: fim do contrato. Sem contrato, no parcelado é o início + 30 dias × parcelas. Nos outros casos vem `null` (indeterminado).

## 3. Cliente
- `source = "wiize"`: vincule ao cliente/lead com aquele `wiize_customer_id`.
- `source = "wiizepay"`: procure pelo CPF/CNPJ (`document`) na organização. Se não achar, crie o cliente com nome, documento e e-mail.

## 4. Tabela de vendas
Faça upsert por `(organization_id, wiizepay_sale_id = data.sale_id)`. Cada evento traz a foto completa e atual da venda, então substitua os campos. Não some valores.

Colunas sugeridas: `wiizepay_sale_id`, `customer_id`, `sale_type`, `total_amount`, `installment_amount`, `installments` (nulo = indeterminado), `recurrence_frequency`, `starts_on`, `expires_on`, `status`, `paid_installments`, `amount_received`, `last_paid_at`, `next_due_on`, `service_name`, `last_event_at`.

Ignore um evento cujo `occurred_at` seja mais antigo que `last_event_at`, porque eventos podem chegar fora de ordem.

## 5. Receita
- Em `sale.payment_received`, registre uma entrada de receita com chave única `(wiizepay_sale_id, paid_installments)`. O valor é `installment_amount` (ou `total_amount` no à vista) e a data é `last_paid_at`. Assim o mesmo pagamento nunca é contado duas vezes.
- Em `sale.refunded`, lance o estorno negativo ou marque as receitas da venda como estornadas.

## 6. Métricas
- **MRR**: some as vendas `recurring` com status `active`, `overdue_installment` ou `awaiting_first_payment` (este último opcional, como "MRR contratado"), convertidas para valor mensal:
  weekly × 4,33; biweekly × 2,17; monthly × 1; quarterly ÷ 3; semiannual ÷ 6; yearly ÷ 12.
  Vendas `cancelled`, `refunded` ou `expired` saem do MRR.
- **Receita recebida no período**: soma das entradas de receita pela data do pagamento.
- **Receita a receber**: parcelado = `total_amount − amount_received`; recorrente = próximo ciclo.
- **Inadimplência**: vendas com status `overdue_installment` ou `expired`.
- **Churn de MRR**: MRR das vendas recorrentes que mudaram para `cancelled` no período.

Mostre `status_label` na interface, já em português.
