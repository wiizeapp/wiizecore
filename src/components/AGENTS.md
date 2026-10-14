- Checkout colors map through `checkoutAppearanceVars` only: background = whole page (summary/footer via `checkout-panel`), header = top bar (`checkout-header`, text contrast auto-fixed), surface = cards. Why: real checkout and preview must react identically to each color.
- Public motion keeps hero, CTA and footer static; feature cards alternate sideways and other cards rise subtly.
- Dashboard screenshot fixtures are local presentation-only, account-gated and opt-in; never cache/persist them or enable navigation, exports or financial actions while active. Why: mockups must not contaminate real account data.

- Institutional dashboard and portal illustrations remain presentation-only and reuse public semantic tokens. Why: previews must never access live financial operations.
- Institutional metric sources live in `institutional/infrastructure-data.ts`. Why: shared attribution.
- The landing's connected journey is a presentation-only home component with an inert illustrative URL and SVG connections; its outer surface follows the ComparisonSection page-background token while the capsule uses section-specific global semantic tokens. Why: visual storytelling must not imply an active checkout or change other public sections.
