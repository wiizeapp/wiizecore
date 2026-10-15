# Library rules

- Security headers belong only in `security-headers.ts`; attack alerts use `security-alerts.server.ts`, fired from audit helpers and grouped per 30 minutes. Why: centralize protections and avoid duplicate alerts.
- Dashboard MRR projections and monthly issued-net series use pure helpers in `dashboard-mrr.ts`; money typography uses `src/components/dashboard/money-value.tsx` without replacing locale/privacy formatting. Why: keep projections distinct from received revenue and prevent duplicated calculations.
- Coproduction (`src/lib/coproduction.server.ts`, math in `src/lib/coproduction-math.ts`) belongs only to a charge; checkout stays blocked until all accept and the split is registered in Asaas; amounts come only from Asaas-confirmed splits.
- New-account launch promo (0% percentage on single cash Pix/boleto, fixed fee kept) is decided only in `calculatePaymentFee` via `launch-promotion.server.ts` from DB-locked `tenants.created_at`.
- One-time charges deduct the Asaas cost (subaccount fees API incl. still-valid promo price with safety margin, `src/lib/provider-fee-quote.ts`) from the WiizePay split, stored in `payments.provider_fee_covered_amount`; only the uncovered rest is reimbursed. Why: no round-trip transfer.
- Open service checkout (`/checkout/$token`, `src/lib/service-checkout.functions.ts`): buyer data creates/reuses the customer by CPF/CNPJ, method/installment rules live in `service-checkout-rules.ts`, the charge is created only via `createChargeCore` then the buyer continues in `/pagar`. Why: price always comes from the saved service.
