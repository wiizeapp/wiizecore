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
- Papéis ficam em tabela separada; permissões de equipe usam `src/lib/permissions.ts` e validação server-side.
- Área interna usa `src/components/ds` e estados de `src/components/states`; nunca mostrar valores falsos durante carregamento.
- PT-BR/EN/ES usam `src/locales`; PT-BR é padrão/fallback e a moeda permanece BRL.
- Every new visible PT-BR string gets an entry keyed by the PT text in `src/locales/{en,es}/ui.json` in the same change. Why: missing keys mix languages.
- Integração Wiize usa OAuth+PKCE e APIs assinadas; tokens são criptografados e cada conexão é isolada por empresa.
- `ui_theme` é somente visual e temporário no consentimento OAuth; nunca integra state, PKCE, redirect URI ou escopos.
- Lembretes de cobrança: taxa por parcela/ciclo via RPC `dunning_charge_fee` (idempotente, sem saldo negativo); regras puras em `src/lib/dunning-rules.ts`; avisos aplicados nas notificações existentes do cliente no Asaas. Why: preço por cobrança individual, não por mensagem, e canais limitados ao plano no servidor.
- Public checkout order: customer data → sign current contract version (if linked) → payment; no step can be bypassed. Why: clear steps and guaranteed contract acceptance.
- Payment method changes and regularization create a new `payment_attempts` row for the same `payments` row via `src/lib/payment-attempts.server.ts` (create new → cancel old → activate); webhooks for superseded attempts are discarded. Why: one permanent link and one logical charge per customer.
- Checkout appearance is versioned in `checkout_appearance_versions`; each charge stores the version used at creation, and logos live in the private `checkout-logos` bucket served by signed URL. Why: old charges must not change appearance and public buckets are blocked.
- Internal light-theme styling is scoped through `.internal-app`; public pages keep their own look. Why: shared tokens must not flatten the sales site.
- MFA recovery uses one non-regenerable, single-use backup code; password recovery preserves MFA, while disabling MFA requires a fresh TOTP or that backup code. Why: an authenticated session alone must never disable the second factor.
- Card payments in the public checkout go through `payCheckoutWithCard` (Asaas payWithCreditCard); card data is never stored or logged, only last4 in audit, and status changes only via webhook. Why: own-branded checkout without holding card data.
- Asaas decides activation approval; WiizePay creates the subaccount, sends documents and mirrors provider status; admins never approve it.
- Checkout journey steps are logged in `checkout_events` and shown in Cliente 360; data + terms confirmation required once per charge. Why: see where customers stop without sensitive data.
- Customer portal (`/portal/$key`) uses email + 6 document digits, rate-limited, 30-min hashed sessions; every portal fn filters by session customer; documents live in the tenant Google Drive. Why: own files only, no accounts.
- Coupons belong to one tenant; discount is computed and reserved only in the `reserve_coupon` RPC (service_role) and consumed/released by the payments status trigger. Why: zero trust in the browser and no double use.
- Internal app mounts only after onboarding completes or is skipped; skips remain recorded for Admin insights.
- Activation handoff uses a short-lived one-time token plus code; IP only audits/limits because mobile IP changes. Prevalidate document quality before private upload.
- Payout data (`bank_accounts.sensitive_enc`) and KYC form (`payment_activations.form_enc`) are encrypted server-side; plaintext columns hold masks/safe keys only. Why: payout data must not leak from a DB read.
- Environment-specific URLs (site, fallback, Wiize webhook/redirects) live only in `src/lib/deploy-config.ts`. Why: a production copy changes one file.
- Todo aviso à empresa passa por `src/lib/notify.server.ts` (sininho + e-mail Resend via `src/lib/email.server.ts`), com chave de deduplicação em `email_outbox`. Why: um envio por evento e falha de e-mail nunca quebra a operação financeira.
- Coproduction (`src/lib/coproduction.server.ts`, math in `src/lib/coproduction-math.ts`) belongs only to a charge; checkout stays blocked until all accept and the split is registered in Asaas; participant amounts are recorded only from the split Asaas returns on a confirmed payment via `apply_coproduction_split`; refunds send proportional `splitRefunds` and sync cumulatively from Asaas `refundedSplits`. Why: never credit or debit estimated money.
