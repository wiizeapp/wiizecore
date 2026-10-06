ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'debit_card';
ALTER TYPE public.transaction_kind ADD VALUE IF NOT EXISTS 'anticipation';
ALTER TYPE public.transaction_kind ADD VALUE IF NOT EXISTS 'anticipation_fee';

DO $$ BEGIN
  CREATE TYPE public.anticipation_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.payment_fee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method text NOT NULL,
  installment_min integer NOT NULL DEFAULT 1,
  installment_max integer NOT NULL DEFAULT 1,
  fixed_fee numeric(14,2) NOT NULL DEFAULT 0,
  percentage_fee numeric(8,4) NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  public_visible boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_fee_method_check CHECK (payment_method IN ('pix','pix_recurring','boleto','debit_card','credit_card')),
  CONSTRAINT payment_fee_installments_check CHECK (installment_min >= 1 AND installment_max >= installment_min AND installment_max <= 21),
  CONSTRAINT payment_fee_values_check CHECK (fixed_fee >= 0 AND percentage_fee >= 0 AND percentage_fee <= 100),
  CONSTRAINT payment_fee_period_check CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (payment_method, installment_min, installment_max, version)
);
GRANT SELECT ON public.payment_fee_settings TO anon, authenticated;
GRANT ALL ON public.payment_fee_settings TO service_role;
ALTER TABLE public.payment_fee_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active payment fees" ON public.payment_fee_settings
  FOR SELECT TO anon, authenticated
  USING (active AND public_visible AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now()));
CREATE INDEX payment_fee_settings_lookup_idx ON public.payment_fee_settings(payment_method, installment_min, installment_max, active, effective_from DESC);
CREATE TRIGGER payment_fee_settings_touch BEFORE UPDATE ON public.payment_fee_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.anticipation_fee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method text NOT NULL,
  monthly_percentage_fee numeric(8,4) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  public_visible boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anticipation_fee_method_check CHECK (payment_method IN ('boleto','credit_card_single','credit_card_installment')),
  CONSTRAINT anticipation_fee_value_check CHECK (monthly_percentage_fee >= 0 AND monthly_percentage_fee <= 100),
  CONSTRAINT anticipation_fee_period_check CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (payment_method, version)
);
GRANT SELECT ON public.anticipation_fee_settings TO anon, authenticated;
GRANT ALL ON public.anticipation_fee_settings TO service_role;
ALTER TABLE public.anticipation_fee_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active anticipation fees" ON public.anticipation_fee_settings
  FOR SELECT TO anon, authenticated
  USING (active AND public_visible AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now()));
CREATE INDEX anticipation_fee_settings_lookup_idx ON public.anticipation_fee_settings(payment_method, active, effective_from DESC);
CREATE TRIGGER anticipation_fee_settings_touch BEFORE UPDATE ON public.anticipation_fee_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.anticipation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  status public.anticipation_status NOT NULL DEFAULT 'pending',
  gross_amount numeric(14,2) NOT NULL,
  anticipation_fee_amount numeric(14,2) NOT NULL,
  net_amount numeric(14,2) NOT NULL,
  weighted_average_days numeric(10,2) NOT NULL DEFAULT 0,
  receivable_count integer NOT NULL,
  provider text NOT NULL DEFAULT 'asaas',
  provider_anticipation_id text,
  idempotency_key text NOT NULL,
  failure_reason text,
  processed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anticipation_request_amounts_check CHECK (gross_amount > 0 AND anticipation_fee_amount >= 0 AND net_amount >= 0 AND net_amount <= gross_amount),
  CONSTRAINT anticipation_request_count_check CHECK (receivable_count > 0),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (provider, provider_anticipation_id)
);
GRANT SELECT ON public.anticipation_requests TO authenticated;
GRANT ALL ON public.anticipation_requests TO service_role;
ALTER TABLE public.anticipation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view tenant anticipations" ON public.anticipation_requests
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX anticipation_requests_tenant_idx ON public.anticipation_requests(tenant_id, created_at DESC);
CREATE TRIGGER anticipation_requests_touch BEFORE UPDATE ON public.anticipation_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.anticipation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anticipation_request_id uuid NOT NULL REFERENCES public.anticipation_requests(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  fee_configuration_id uuid NOT NULL REFERENCES public.anticipation_fee_settings(id),
  gross_amount numeric(14,2) NOT NULL,
  anticipated_amount numeric(14,2) NOT NULL,
  original_due_date date NOT NULL,
  anticipation_date date NOT NULL,
  days_anticipated integer NOT NULL,
  monthly_rate numeric(8,4) NOT NULL,
  effective_rate numeric(10,6) NOT NULL,
  anticipation_fee_amount numeric(14,2) NOT NULL,
  net_amount numeric(14,2) NOT NULL,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anticipation_item_amounts_check CHECK (gross_amount > 0 AND anticipated_amount > 0 AND anticipated_amount <= gross_amount AND anticipation_fee_amount >= 0 AND net_amount >= 0),
  CONSTRAINT anticipation_item_days_check CHECK (days_anticipated >= 0),
  UNIQUE (anticipation_request_id, payment_id)
);
GRANT SELECT ON public.anticipation_items TO authenticated;
GRANT ALL ON public.anticipation_items TO service_role;
ALTER TABLE public.anticipation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view tenant anticipation items" ON public.anticipation_items
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX anticipation_items_request_idx ON public.anticipation_items(anticipation_request_id);
CREATE INDEX anticipation_items_payment_idx ON public.anticipation_items(payment_id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS fee_configuration_id uuid REFERENCES public.payment_fee_settings(id),
  ADD COLUMN IF NOT EXISTS fee_fixed_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_percentage numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_percentage_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS gross_margin_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_provider_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_provider_event_id text;
CREATE INDEX IF NOT EXISTS payments_fee_configuration_idx ON public.payments(fee_configuration_id);

ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS wallet_id text,
  ADD COLUMN IF NOT EXISTS subaccount_id text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS account_status text,
  ADD COLUMN IF NOT EXISTS commercial_info_status text,
  ADD COLUMN IF NOT EXISTS bank_account_info_status text,
  ADD COLUMN IF NOT EXISTS documentation_status text,
  ADD COLUMN IF NOT EXISTS general_status text,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS provider_connections_wallet_unique ON public.provider_connections(provider, wallet_id) WHERE wallet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS provider_connections_subaccount_unique ON public.provider_connections(provider, subaccount_id) WHERE subaccount_id IS NOT NULL;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_confirmed_at timestamptz;

INSERT INTO public.payment_fee_settings (payment_method, installment_min, installment_max, fixed_fee, percentage_fee, version)
VALUES
  ('pix', 1, 1, 2.99, 0, 1),
  ('pix_recurring', 1, 1, 0.49, 4.99, 1),
  ('boleto', 1, 21, 2.99, 0, 1),
  ('debit_card', 1, 1, 0.49, 4.99, 1),
  ('credit_card', 1, 1, 0.49, 5.50, 1),
  ('credit_card', 2, 6, 0.49, 5.99, 1),
  ('credit_card', 7, 12, 0.49, 6.49, 1),
  ('credit_card', 13, 21, 0.49, 6.99, 1)
ON CONFLICT (payment_method, installment_min, installment_max, version) DO NOTHING;

INSERT INTO public.anticipation_fee_settings (payment_method, monthly_percentage_fee, version)
VALUES
  ('credit_card_single', 5.99, 1),
  ('credit_card_installment', 6.49, 1),
  ('boleto', 9.99, 1)
ON CONFLICT (payment_method, version) DO NOTHING;