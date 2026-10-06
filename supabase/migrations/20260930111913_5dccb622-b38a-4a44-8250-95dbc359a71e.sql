CREATE TABLE public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  previous_secret_hash text,
  previous_secret_expires_at timestamptz,
  name text NOT NULL,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  allowed_scopes text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_clients TO service_role;
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  code_challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_authorization_codes TO service_role;
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text UNIQUE,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT '{}',
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  rotated_from uuid,
  family_id uuid NOT NULL,
  code_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_tokens_family_idx ON public.oauth_tokens(family_id);
CREATE INDEX oauth_tokens_tenant_idx ON public.oauth_tokens(tenant_id, client_id);
GRANT ALL ON public.oauth_tokens TO service_role;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wiize_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  idempotency_key text NOT NULL,
  checksum text,
  external_reference text NOT NULL,
  charge_group_id uuid,
  customer_id uuid,
  service_id uuid,
  status text NOT NULL DEFAULT 'pending',
  amount_cents bigint NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX wiize_charges_group_idx ON public.wiize_charges(charge_group_id);
GRANT ALL ON public.wiize_charges TO service_role;
ALTER TABLE public.wiize_charges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wiize_pay_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  charge_id uuid NOT NULL REFERENCES public.wiize_charges(id) ON DELETE CASCADE,
  type text NOT NULL,
  body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wiize_pay_webhooks_queue_idx ON public.wiize_pay_webhooks(status, next_attempt_at);
GRANT ALL ON public.wiize_pay_webhooks TO service_role;
ALTER TABLE public.wiize_pay_webhooks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER oauth_clients_touch BEFORE UPDATE ON public.oauth_clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER wiize_charges_touch BEFORE UPDATE ON public.wiize_charges FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();