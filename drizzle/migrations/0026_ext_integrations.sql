CREATE TABLE public.ext_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test','live')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  scopes text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ext_integrations TO authenticated;
GRANT ALL ON public.ext_integrations TO service_role;
ALTER TABLE public.ext_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read integrations" ON public.ext_integrations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service role all integrations" ON public.ext_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX ext_integrations_tenant_idx ON public.ext_integrations (tenant_id, created_at DESC);

CREATE TABLE public.ext_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.ext_integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  public_key text NOT NULL UNIQUE,
  secret_hash text NOT NULL UNIQUE,
  secret_prefix text NOT NULL,
  secret_last4 text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ext_api_keys TO service_role;
ALTER TABLE public.ext_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role all keys" ON public.ext_api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX ext_api_keys_integration_idx ON public.ext_api_keys (integration_id, created_at DESC);