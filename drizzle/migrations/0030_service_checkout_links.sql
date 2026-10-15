CREATE TABLE public.service_checkout_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id)
);
GRANT SELECT ON public.service_checkout_links TO authenticated;
GRANT ALL ON public.service_checkout_links TO service_role;
ALTER TABLE public.service_checkout_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read service checkout links" ON public.service_checkout_links FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.service_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.service_checkout_links(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  charge_group_id uuid,
  method text,
  installments integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_checkout_sessions_link_customer ON public.service_checkout_sessions(link_id, customer_id);
GRANT SELECT ON public.service_checkout_sessions TO authenticated;
GRANT ALL ON public.service_checkout_sessions TO service_role;
ALTER TABLE public.service_checkout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read service checkout sessions" ON public.service_checkout_sessions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));