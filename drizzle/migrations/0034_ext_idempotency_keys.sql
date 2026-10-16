CREATE TABLE public.ext_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL DEFAULT 'in_progress',
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (integration_id, idempotency_key)
);
GRANT ALL ON public.ext_idempotency_keys TO service_role;
ALTER TABLE public.ext_idempotency_keys ENABLE ROW LEVEL SECURITY;