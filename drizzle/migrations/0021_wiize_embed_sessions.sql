CREATE TABLE public.embed_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hash text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contract','service','charge')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.embed_tickets TO service_role;
ALTER TABLE public.embed_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.embed_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hash text NOT NULL UNIQUE,
  ticket_id uuid NOT NULL REFERENCES public.embed_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.embed_sessions TO service_role;
ALTER TABLE public.embed_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX embed_tickets_exp_idx ON public.embed_tickets(expires_at);
CREATE INDEX embed_sessions_exp_idx ON public.embed_sessions(expires_at);