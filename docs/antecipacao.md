# Antecipação de recebíveis — WiizePay

- **Recebível**: valor de uma cobrança/parcela já paga pelo cliente final que ainda não foi liberado no saldo.
- **Cobrança criada / pendente / vencida**: não é recebível. Nunca elegível.
- **Pagamento autorizado**: não elegível automaticamente.
- **Pagamento confirmado (CONFIRMED/RECEIVED)**: elegível somente se o Asaas retornar `anticipable = true` e `anticipated = false`.
- **Recebível disponível**: já liberado (`released_at`); não há o que antecipar.
- **Recebível antecipado**: antecipação concluída pelo webhook `RECEIVABLE_ANTICIPATION_CREDITED`.
- Pix não é antecipado (liquidação imediata). Chargeback, estorno, análise de risco ou qualquer dúvida → não antecipa.

**Quem executa e calcula o valor definitivo:** Asaas (`POST /anticipations/simulate` e `POST /anticipations`).
**O que a WiizePay faz:** interface, autenticação (2FA + senha financeira), elegibilidade, simulação, confirmação explícita, solicitação idempotente, histórico e conciliação.

Taxa WiizePay = taxa comercial mensal (boleto 7,99%, cartão à vista 4,99%, parcelado 5,49%) proporcional aos dias informados pelo Asaas, nunca menor que o custo do provedor. Custo do provedor fica marcado como estimado até o webhook confirmar. Margem = taxa WiizePay − custo registrado do provedor; é transferida da subconta para a conta principal após o crédito.

Fluxo: pago → confirmado no Asaas → elegível → simulação → confirmação → solicitação → webhook → liquidação.
