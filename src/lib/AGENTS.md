# Library rules

- Public contract capabilities require tenant-consistent resolution and scoped public queries; cash receipts are rejected before financial side effects, including legacy queued reconciliations. Why: block cross-tenant links and credit without provider-held funds.

- Export user-authored cells through `safeSpreadsheetRows`; URL logo imports require exact server-approved hosts and bounded streams. Why: prevent formulas in exports and arbitrary outbound fetches without affecting file uploads.

- Financial records bind to their original provider connection via `financial-origin.server.ts`; authenticated Asaas event IDs are namespaced by connection and all external-ID queries scope tenant and connection. Why: prevent cross-account processing and silent use of a replacement account.
- Financial-password counters are serialized by `record_financial_password_check`; money-routing confirmations require server AAL2 and financial password. Payment-attempt activation uses a locked database RPC; uncertain provider cancellation/transfer keeps its reservation. Why: prevent lost increments, bypasses and duplicate money movement.

- Resend inbound uses `resend-inbound.server.ts` with Standard Webhooks verification over the raw body; acknowledge only stored messages, retry failed fetches, and log codes/status only. Why: avoid forged events, lost content and private email leaks.

- Brand and checkout share versioned appearance; `brandColor` is independent of surfaces and reminder previews read saved settings through `getCheckoutAppearance`. Why: avoid duplicate storage and preserve historical charges.

- Security headers belong only in `security-headers.ts`; attack alerts use `security-alerts.server.ts`, fired from audit helpers and grouped per 30 minutes. Why: centralize protections and avoid duplicate alerts.
- Dashboard MRR projections and monthly issued-net series use pure helpers in `dashboard-mrr.ts`; money typography uses `src/components/dashboard/money-value.tsx` without replacing locale/privacy formatting. Why: keep projections distinct from received revenue and prevent duplicated calculations.
- Coproduction (`src/lib/coproduction.server.ts`, math in `src/lib/coproduction-math.ts`) belongs only to a charge; checkout stays blocked until all accept and the split is registered in Asaas; amounts come only from Asaas-confirmed splits.
- New-account launch promo (0% percentage on single cash Pix/boleto, fixed fee kept) is decided only in `calculatePaymentFee` via `launch-promotion.server.ts` from DB-locked `tenants.created_at`.
- One-time charges deduct the Asaas cost (subaccount fees API incl. still-valid promo price with safety margin, `src/lib/provider-fee-quote.ts`) from the WiizePay split, stored in `payments.provider_fee_covered_amount`; only the uncovered rest is reimbursed. Why: no round-trip transfer.
- Open service checkout uses immutable tenant-scoped `service_checkout_versions` for seller-defined price and billing conditions; sessions bind to a version, and `createChargeCore` reloads that version before creating a charge. Buyer input never overrides its price. Why: issued links and existing charges keep their agreed conditions.
- Service checkout share URLs use the request's site origin for navigation only; financial callbacks remain in deploy-config and billing helpers. Why: copying a link must not point at an obsolete preview or alter provider destinations.
- External API endpoints wrap handlers in `withExtApi` (`ext-api.server.ts`) for request id, key/scope check, rate limit and secret-free request logs; test keys without a sandbox payment account use the isolated simulator (`ext_sandbox_charges`, rules in `ext-sandbox.ts`) and never touch `payments`. Why: sandbox must never create or confirm real money movement.
- Developer docs and AI prompts derive from `EXT_ENDPOINTS`/`buildToolPrompt` in `ext-docs.ts` only. Why: one versioned source prevents contradictory docs.
- Webhook docs, AI prompts and the webhooks panel must always state signature verification as mandatory and mention confirming via GET /charges/{id}. Why: a client SaaS that skips verification lets buyers forge payment.confirmed and self-approve.

- Taxas e custos ficam nas configurações versionadas; cálculos em `src/lib/fee-math.ts`; totais em `src/lib/financial-summary.ts`.
- Environment URLs live in `src/lib/deploy-config.ts`; payment-only share metadata in `src/lib/payment-share.ts`. Why: isolate hosts and previews.
- Help Center content lives in `src/lib/help-content.ts` (no fee values; fee/settlement widgets read live config) and suggestions in `feature_suggestions` via `help-center.functions.ts` (admin notes in a separate admin-only table). Why: docs never drift from checkout rates.
- Browser analytics goes only through `src/lib/analytics` (normalized paths, param filter, consent-gated; GTM present → dataLayer only). Why: one source per event, no PII/token leaks; see docs/analytics.md.
