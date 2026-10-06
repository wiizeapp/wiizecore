ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS late_fine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_fine_percent numeric(6,2) NOT NULL DEFAULT 2.00 CHECK (late_fine_percent >= 0 AND late_fine_percent <= 10),
  ADD COLUMN IF NOT EXISTS late_interest_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_interest_percent numeric(6,2) NOT NULL DEFAULT 1.00 CHECK (late_interest_percent >= 0 AND late_interest_percent <= 10);
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS fine_percent numeric(6,2),
  ADD COLUMN IF NOT EXISTS interest_percent numeric(6,2);