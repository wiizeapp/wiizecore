CREATE TABLE public.ext_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url LIKE 'https://%' AND char_length(url) <= 500),
  events text[] NOT NULL DEFAULT '{}',
  secret_enc text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  timeout_ms integer NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 2000 AND 15000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ext_webhook_endpoints TO service_role;
ALTER TABLE public.ext_webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role all ext endpoints" ON public.ext_webhook_endpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX ext_webhook_endpoints_integration_idx ON public.ext_webhook_endpoints (integration_id);

CREATE TABLE public.ext_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.ext_webhook_endpoints(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  type text NOT NULL,
  charge_group_id uuid,
  body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_id)
);
GRANT ALL ON public.ext_webhook_deliveries TO service_role;
ALTER TABLE public.ext_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role all ext deliveries" ON public.ext_webhook_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX ext_webhook_deliveries_pending_idx ON public.ext_webhook_deliveries (status, next_attempt_at);
CREATE INDEX ext_webhook_deliveries_endpoint_idx ON public.ext_webhook_deliveries (endpoint_id, created_at DESC);