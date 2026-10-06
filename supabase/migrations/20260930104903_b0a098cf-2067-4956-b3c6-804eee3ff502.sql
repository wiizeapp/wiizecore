CREATE TABLE public.wiize_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wiize_organization_id text,
  wiize_organization_name text,
  wiize_account_name text,
  wiize_email_masked text,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'disconnected',
  connected_by uuid,
  connected_at timestamptz,
  revoked_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
CREATE UNIQUE INDEX wiize_connections_pair ON public.wiize_connections (wiize_organization_id, tenant_id) WHERE wiize_organization_id IS NOT NULL;
GRANT SELECT ON public.wiize_connections TO authenticated;
GRANT ALL ON public.wiize_connections TO service_role;
ALTER TABLE public.wiize_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read wiize connection" ON public.wiize_connections FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER wiize_connections_touch BEFORE UPDATE ON public.wiize_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.wiize_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE,
  code_verifier_enc text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  purpose text NOT NULL DEFAULT 'connect',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wiize_oauth_states TO service_role;
ALTER TABLE public.wiize_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wiize_tokens (
  connection_id uuid PRIMARY KEY REFERENCES public.wiize_connections(id) ON DELETE CASCADE,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wiize_tokens TO service_role;
ALTER TABLE public.wiize_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wiize_customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wiize_customer_id text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  match_method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wiize_customer_id),
  UNIQUE (tenant_id, customer_id)
);
GRANT SELECT ON public.wiize_customer_links TO authenticated;
GRANT ALL ON public.wiize_customer_links TO service_role;
ALTER TABLE public.wiize_customer_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read customer links" ON public.wiize_customer_links FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.integration_idempotency (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  operation text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
GRANT ALL ON public.integration_idempotency TO service_role;
ALTER TABLE public.integration_idempotency ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wiize_outbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wiize_outbound_pending ON public.wiize_outbound_events (status, next_attempt_at);
GRANT ALL ON public.wiize_outbound_events TO service_role;
ALTER TABLE public.wiize_outbound_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wiize_inbound_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wiize_inbound_events TO service_role;
ALTER TABLE public.wiize_inbound_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.integration_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  outcome text NOT NULL DEFAULT 'success',
  details jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_audit_log TO authenticated;
GRANT ALL ON public.integration_audit_log TO service_role;
ALTER TABLE public.integration_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read integration audit" ON public.integration_audit_log FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id, ARRAY['owner','admin']::tenant_role[]));