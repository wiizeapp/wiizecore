CREATE TABLE public.ext_sandbox_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  public_token text NOT NULL UNIQUE,
  service_id uuid NOT NULL,
  service_name text NOT NULL,
  charge_type text NOT NULL,
  frequency text,
  amount numeric(14,2) NOT NULL,
  payment_method text,
  customer_name text NOT NULL,
  customer_email text,
  document_last4 text,
  external_customer_id text,
  external_subscription_id text,
  success_url text,
  cancel_url text,
  status text NOT NULL DEFAULT 'awaiting_payment',
  subscription_status text,
  cycles_paid integer NOT NULL DEFAULT 0,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, idempotency_key)
);
CREATE INDEX ext_sandbox_charges_tenant_idx ON public.ext_sandbox_charges (tenant_id, created_at DESC);
GRANT ALL ON public.ext_sandbox_charges TO service_role;
ALTER TABLE public.ext_sandbox_charges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ext_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  environment text,
  request_id text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL,
  duration_ms integer NOT NULL,
  auth_result text NOT NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ext_request_logs_tenant_idx ON public.ext_request_logs (tenant_id, created_at DESC);
GRANT ALL ON public.ext_request_logs TO service_role;
ALTER TABLE public.ext_request_logs ENABLE ROW LEVEL SECURITY;