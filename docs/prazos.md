# Prazos de liberação — WiizePay

- Fonte única: `src/lib/settlement-rules.ts` (`SETTLEMENT_RULES`, `ANTICIPATION_ANALYSIS_DAYS`, `calculateEstimatedAvailability`).
- Previsão (`payments.estimated_available_at` + `estimated_rule`): calculada no servidor ao confirmar o pagamento (`apply_payment_event`).
  - Pix: +1 dia útil. Boleto: próximo dia útil. Débito: +3 dias úteis. Crédito: +32 dias corridos, ajustado para o próximo dia útil. Parcela N: +32×N dias corridos contados a partir da operação.
- Liberação real (`actual_available_at` / `released_at`): só pelo RPC `settle_payment`, chamado quando o provedor avisa PAYMENT_RECEIVED (por webhook ou pela conferência de status). Nunca é feita pela data.
- `release_available_balances` não libera nada: registra `reconciliation_issues.kind = 'settlement_overdue'` quando a previsão vence sem liquidação. `syncBalances` confere no provedor os recebíveis com previsão vencida.
- Dias úteis: segunda a sexta, exceto feriados nacionais fixos (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12) e móveis calculados pela Páscoa (Carnaval segunda e terça, Sexta-feira Santa, Corpus Christi). Feriados estaduais e municipais não entram; nesses casos a data real vem do provedor.
- Situação (`settlement_status`): PENDING → AWAITING_SETTLEMENT → AVAILABLE. Com antecipação: ANTICIPATION_PENDING → ANTICIPATED (trigger `mark_payment_anticipated`). Também existem REFUNDED e CANCELLED.
- Antecipação: elegibilidade e simulação sempre vêm do provedor. O Pix entra só se o provedor disser que é elegível. Prazo de análise: cartão 2 dias úteis; boleto e Pix 3 dias úteis.
- Testes: `bunx vitest run settlement`.
