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
- Every new visible PT-BR string (pages, configs, illustrations) must get an entry keyed by the PT text in `src/locales/en/ui.json` and `src/locales/es/ui.json` in the same change. Why: missing keys silently fall back to Portuguese and mix languages on the page.
- Integração Wiize usa OAuth+PKCE e APIs assinadas; tokens são criptografados e cada conexão é isolada por empresa.
- `ui_theme` é somente visual e temporário no consentimento OAuth; nunca integra state, PKCE, redirect URI ou escopos.
- Lembretes de cobrança: taxa por parcela/ciclo via RPC `dunning_charge_fee` (idempotente, sem saldo negativo); regras puras em `src/lib/dunning-rules.ts`; avisos aplicados nas notificações existentes do cliente no Asaas. Why: preço por cobrança individual, não por mensagem, e canais limitados ao plano no servidor.
- Checkout de cobrança vinculada bloqueia o pagamento até a assinatura do contratante na versão atual do contrato. Why: garantir aceite contratual sem expor links ou contratos de outro cliente.
- Payment method changes and regularization create a new `payment_attempts` row for the same `payments` row via `src/lib/payment-attempts.server.ts` (create new → cancel old → activate); webhooks for superseded attempts are discarded. Why: one permanent link and one logical charge per customer.
- Checkout appearance is versioned in `checkout_appearance_versions`; each charge stores the version used at creation, and logos live in the private `checkout-logos` bucket served by signed URL. Why: old charges must not change appearance and public buckets are blocked.
- Internal light-theme styling is scoped through `.internal-app`; public pages keep their independent visual treatment. Why: shared semantic tokens must not flatten the sales site while cleaning every authenticated page.
- MFA recovery uses one non-regenerable, single-use backup code; password recovery preserves MFA, while disabling MFA requires a fresh TOTP or that backup code. Why: an authenticated session alone must never disable the second factor.
- Public checkout follows one ordered journey: complete customer data, sign the current contract when required, then choose and complete payment. Why: customers must always understand the current step and cannot bypass prerequisites.
- Card payments in the public checkout go through `payCheckoutWithCard` (Asaas payWithCreditCard); card data is never stored or logged, only last4 in audit, and status changes only via webhook. Why: own-branded checkout without holding card data.
- Asaas decides activation approval; WiizePay creates the subaccount, sends documents and mirrors provider status; admins never approve it.
- Checkout journey is tracked in `checkout_events` (opened, data_confirmed, contract_viewed/signed, payment_viewed/submitted) and shown in Cliente 360; data confirmation + terms acceptance is always required once per charge. Why: provider sees where each customer stopped without storing sensitive data.
- Customer portal (`/portal/$key`, key = tenant id) uses email + first 6 document digits, rate-limited, with 30-min hashed sessions in `customer_portal_sessions`; every portal server fn filters by the session customer. Customer documents live only in the tenant Google Drive (`customer_documents`). Why: customers see only their own files without accounts.
- Coupons belong to one tenant; discount is computed and reserved only in the `reserve_coupon` RPC (service_role) and consumed/released by the payments status trigger. Why: zero trust in the browser and no double use.
- Internal app mounts only after onboarding completes or is skipped; skips remain recorded for Admin insights.
- Activation handoff uses a short-lived one-time token plus code; IP only audits/limits because mobile IP changes. Prevalidate document quality before private upload.
- Payout data (`bank_accounts.sensitive_enc`) and KYC form (`payment_activations.form_enc`) are encrypted server-side; plaintext columns hold masks/safe keys only. Why: payout data must not leak from a DB read.
- Environment-specific URLs (site, fallback, Wiize webhook/redirects) live only in `src/lib/deploy-config.ts`. Why: a production copy changes one file.
