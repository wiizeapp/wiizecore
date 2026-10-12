<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Marca visível sempre “WiizePay”; dados públicos/jurídicos vêm de `src/lib/brand-config.ts`.
- Operações financeiras são autorizadas no servidor, isoladas por empresa, auditadas e idempotentes; valores monetários usam Decimal/NUMERIC.
- Asaas usa subcontas/split; liquidação só após confirmação do provedor; antecipação segue `docs/antecipacao.md`.
- Taxas e custos ficam nas configurações versionadas; cálculos em `src/lib/fee-math.ts`; totais em `src/lib/financial-summary.ts`.
- Área interna usa `src/components/ds` e estados de `src/components/states`; nunca mostrar valores falsos durante carregamento.
- PT-BR (default/fallback, BRL)/EN/ES in `src/locales`; every new visible PT string gets a PT-keyed entry in `{en,es}/ui.json` in the same change.
- Wiize: OAuth+PKCE, APIs assinadas, tokens criptografados, isolado por empresa; `ui_theme` só visual, fora de state/PKCE/redirect/escopos.
- Lembretes de cobrança: taxa por parcela/ciclo via RPC `dunning_charge_fee` (idempotente, sem saldo negativo); regras puras em `src/lib/dunning-rules.ts`; avisos aplicados nas notificações existentes do cliente no Asaas. Why: preço por cobrança, canais limitados no servidor.
- Public checkout order: customer data → sign current contract version (if linked) → payment; no step can be bypassed.
- Payment method changes and regularization create a new `payment_attempts` row for the same `payments` row via `src/lib/payment-attempts.server.ts` (create new → cancel old → activate); webhooks for superseded attempts are discarded.
- Checkout appearance is versioned in `checkout_appearance_versions`; each charge stores the version used at creation, and logos live in the private `checkout-logos` bucket served by signed URL. Why: old charges keep their look.
- Internal light-theme styling is scoped through `.internal-app`; public pages keep their own look. Why: shared tokens must not flatten the sales site.
- MFA recovery uses one non-regenerable, single-use backup code; password recovery preserves MFA, while disabling MFA requires a fresh TOTP or that backup code. Why: an authenticated session alone must never disable the second factor.
- Card payments in the public checkout go through `payCheckoutWithCard` (Asaas payWithCreditCard); card data is never stored or logged, only last4 in audit, and status changes only via webhook.
- Asaas decides activation approval; WiizePay creates the subaccount, sends documents and mirrors provider status; admins never approve it.
- Checkout journey steps are logged in `checkout_events` and shown in Cliente 360; data + terms confirmation required once per charge.
- Customer portal (`/portal/$key`): email + full CPF/CNPJ, rate-limited, 30-min hashed sessions, every fn filtered by session customer; docs in tenant Drive.
- Coupons belong to one tenant; discount is computed and reserved only in the `reserve_coupon` RPC (service_role) and consumed/released by the payments status trigger.
- Internal app mounts only after onboarding completes or is skipped; skips remain recorded for Admin insights.
- Activation handoff uses a short-lived one-time token plus code; IP only audits/limits because mobile IP changes. Prevalidate document quality before private upload.
- Payout data (`bank_accounts.sensitive_enc`) and KYC form (`payment_activations.form_enc`) are encrypted server-side; plaintext columns hold masks/safe keys only.
- Environment-specific URLs (site, fallback, Wiize webhook/redirects) live only in `src/lib/deploy-config.ts`. Why: a production copy changes one file.
- Todo aviso à empresa passa por `src/lib/notify.server.ts` (sininho + e-mail Resend via `src/lib/email.server.ts`), com chave de deduplicação em `email_outbox`. Why: falha de e-mail nunca quebra operação financeira.
- Coproduction (`src/lib/coproduction.server.ts`, math in `src/lib/coproduction-math.ts`) belongs only to a charge; checkout stays blocked until all accept and the split is registered in Asaas; amounts come only from Asaas-confirmed splits.
- Security headers only in `src/lib/security-headers.ts`.
- Roles live in a separate table; server team access goes through `src/lib/member-access.server.ts` (active membership + `src/lib/permissions.ts`), max one active membership per user. Why: block ex-members and restricted roles server-side.
- Attack alerts go via `src/lib/security-alerts.server.ts`, fired from audit helpers, grouped per 30 min.
- New-account launch promo (0% percentage on single cash Pix/boleto, fixed fee kept) is decided only in `calculatePaymentFee` via `launch-promotion.server.ts` from DB-locked `tenants.created_at`.
- One-time charges deduct the Asaas cost (subaccount fees API incl. still-valid promo price with safety margin, `src/lib/provider-fee-quote.ts`) from the WiizePay split, stored in `payments.provider_fee_covered_amount`; only the uncovered rest is reimbursed. Why: no round-trip transfer.
- Wiize `/embed/*`: one-time 2-min hash ticket → 30-min in-memory session (`embed-session.server.ts`); framing only for `wiizeEmbedOrigins`. Why: no 3rd-party cookies/token logs.
- External SaaS API (`/api/public/v1/ext/*`) authenticates `sk_` keys via `src/lib/ext-auth.server.ts` (hash only, scope + env check) and creates charges only through `createChargeCore`; idempotency per integration in `ext_checkout_sessions`. Why: one charge path, no cross-tenant access.
