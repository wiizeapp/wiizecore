ALTER TABLE public.payment_activations ADD COLUMN IF NOT EXISTS provider_onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.payment_activations ADD COLUMN IF NOT EXISTS provider_synced_at timestamptz;
REVOKE EXECUTE ON FUNCTION public.admin_review_activation(uuid, uuid, activation_status, text) FROM PUBLIC, anon, authenticated;