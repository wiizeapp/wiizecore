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

- Display identity comes from `src/lib/brand-config.ts`; preserve technical identifiers and external integration URLs/names; app-owned production URLs come from `src/lib/deploy-config.ts`. Why: rebranding must not break integrations/history.
- Keep brand and content font tokens separate; retain code/signature fonts. Why: typography changes must preserve the wordmark and functional formats.
- Official financial-provider URLs and channels live in `src/lib/financial-provider.ts`; shared branding/support render through `src/components/financial-provider.tsx`. Why: keep checkout, public site and help consistent without modifying official seals.
- Operações financeiras são autorizadas no servidor, isoladas por empresa, auditadas e idempotentes; valores monetários usam Decimal/NUMERIC.
- Asaas usa subcontas/split; liquidação só após confirmação do provedor; antecipação segue `docs/antecipacao.md`.
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
- Internal access order: login → mandatory TOTP setup/confirmation (server `requireMfaAuth` + RLS `mfa_satisfied()` require AAL2) → mandatory onboarding completed server-side (no skip) → app. Why: client gates are UX; the server enforces each step.
- `audit_logs` is append-only with a hash chain; write only through `src/lib/audit.server.ts` (sanitized metadata, failures never break operations). Why: tamper evidence without blocking financial flows.
- Activation handoff uses a short-lived one-time token plus code; IP only audits/limits because mobile IP changes. Prevalidate document quality before private upload.
- Payout data (`bank_accounts.sensitive_enc`) and KYC form (`payment_activations.form_enc`) are encrypted server-side; plaintext columns hold masks/safe keys only.
- Todo aviso à empresa passa por `src/lib/notify.server.ts` (sininho + e-mail Resend via `src/lib/email.server.ts`), com chave de deduplicação em `email_outbox`. Why: falha de e-mail nunca quebra operação financeira.
- Roles live in a separate table; server team access goes through `src/lib/member-access.server.ts` (active membership + `src/lib/permissions.ts`), max one active membership per user. Why: block ex-members and restricted roles server-side.
- External API `/api/public/v1/ext/*`: hashed `sk_` keys in `ext-auth.server.ts`; charges only via `createChargeCore`; webhooks queued via `enqueueWiizeSaleEvent`. Why: one path.

- Read subdirectories' scoped `AGENTS.md` before edits.
- Administrative data requires `assertAdminPage` after the platform role/MFA checks; only the minimal status and fresh-unlock endpoints are exempt. The page proof is volatile, bound to server-side session/credential state, and never persisted by the browser. Why: closing or reopening the Admin must require both factors again.
- PLD uses isolated encrypted case/rule modules, append-only case history and Decimal rules; observation never alters financial operations. Why: review indicators must not become payment authorization or accusations.
- PLD observation reads money as decimal strings through a service-only RPC and runs outside payment handlers; automatic batches require cron authentication and explicitly enabled rule versions. Why: preserve precision and keep review failures separate from money movement.
- Scoped rules: `src/components/AGENTS.md` (illustrations/attribution), `src/lib/AGENTS.md` (fees, help, env URLs, analytics).
- Production activation uses a dedicated fee record, server/RPC/storage gates and durable provider-operation claims; both subaccount paths call the same onboarding helper. Uncertain external creation is reconciled, never blindly repeated. Why: prevent unpaid KYC costs and duplicate external accounts.
- Chargeback evidence is server-only private storage; MFA and active charges permissions gate reads and writes. Case-locked RPCs freeze documents during defense submission, and uncertain provider replies block retries until official reconciliation. Why: prevent cross-tenant disclosure and duplicate defense submissions.
- Admin chargeback reads use explicit safe projections after assertAdminPage; checkout 3DS requires both the environment flag and a server-only durable operational gate, absent means disabled. Payment confirmation is never presented as proof of issuer authentication. Why: prevent administrative disclosure and premature activation claims.
- Security-page globe is presentation-only, loads COBE inside an effect and uses scoped CSS color tokens; it never represents live payments or coverage. Why: preserve SSR safety and avoid unsupported financial claims.
- Checkout drafts use an allowlisted, expiring tab-scoped store through useCheckoutDraft; never persist cards, signatures, consent, credentials or financial status. Checkout polling includes processing/analysis and refreshes on return; server-confirmed data and signatures remain authoritative. Why: recover interrupted input without bypassing checkout gates or declaring payments locally.
- Client IP comes only from `trustedClientIp`/`clientIpFromRequest` (`src/lib/client-ip.ts`), never the first X-Forwarded-For value; header order via `TRUSTED_CLIENT_IP_HEADERS`. Why: clients must not choose the IP used for limits or sent to Asaas.
- Rate limits go through `consumeRateLimit` → atomic `consume_rate_limit` RPC (service_role only, fails closed); card attempts are limited per charge, link, trusted IP and keyed HMAC card mark (`CARD_FINGERPRINT_KEY`, never stored with card data). Why: new charges or concurrent calls must not reset limits.
- Card checkout requires a Cloudflare Turnstile token verified server-side in `requireTurnstile` (`src/lib/turnstile.server.ts`, action `checkout_card`, hostnames from `TURNSTILE_ALLOWED_HOSTNAMES`, single-use via `consume_rate_limit`); any inconclusive Siteverify result fails closed. Why: browser-only checks and direct calls must not bypass bot protection.
