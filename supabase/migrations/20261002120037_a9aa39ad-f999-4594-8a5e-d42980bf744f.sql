ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS late_fees_configured_at timestamptz;

ALTER TABLE public.tenant_settings
  ALTER COLUMN late_fine_enabled SET DEFAULT true,
  ALTER COLUMN late_interest_enabled SET DEFAULT true;

UPDATE public.tenant_settings
SET late_fine_enabled = true,
    late_fine_percent = 2.00,
    late_interest_enabled = true,
    late_interest_percent = 1.00,
    updated_at = now()
WHERE late_fees_configured_at IS NULL;