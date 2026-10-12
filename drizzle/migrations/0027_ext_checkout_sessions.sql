CREATE TABLE public.ext_customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  external_customer_id text NOT NULL CHECK (char_length(external_customer_id) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_customer_id)
);
GRANT ALL ON public.ext_customer_links TO service_role;
ALTER TABLE public.ext_customer_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role all ext links" ON public.ext_customer_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX ext_customer_links_customer_idx ON public.ext_customer_links (tenant_id, customer_id);

CREATE TABLE public.ext_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  service_id uuid NOT NULL REFERENCES public.services(id),
  charge_group_id uuid NOT NULL,
  payment_link_id uuid,
  external_customer_id text,
  external_subscription_id text,
  success_url text,
  cancel_url text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, idempotency_key)
);
GRANT ALL ON public.ext_checkout_sessions TO service_role;
GRANT SELECT ON public.ext_checkout_sessions TO authenticated;
ALTER TABLE public.ext_checkout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role all ext sessions" ON public.ext_checkout_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "members read ext sessions" ON public.ext_checkout_sessions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX ext_checkout_sessions_tenant_idx ON public.ext_checkout_sessions (tenant_id, integration_id, created_at DESC);
CREATE INDEX ext_checkout_sessions_group_idx ON public.ext_checkout_sessions (charge_group_id);