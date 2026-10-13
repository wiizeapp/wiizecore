# Library rules

- Security headers belong only in `security-headers.ts`; attack alerts use `security-alerts.server.ts`, fired from audit helpers and grouped per 30 minutes. Why: centralize protections and avoid duplicate alerts.
- Dashboard MRR projections and monthly issued-net series use pure helpers in `dashboard-mrr.ts`; money typography uses `src/components/dashboard/money-value.tsx` without replacing locale/privacy formatting. Why: keep projections distinct from received revenue and prevent duplicated calculations.