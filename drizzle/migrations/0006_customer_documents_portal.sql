CREATE TABLE public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  button_label text NOT NULL,
  file_name text NOT NULL,
  drive_file_id text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 text NOT NULL,
  visible_in_portal boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_documents_tenant_customer_idx ON public.customer_documents (tenant_id, customer_id, created_at DESC);
GRANT SELECT ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read customer documents" ON public.customer_documents FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.customer_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_portal_sessions_customer_idx ON public.customer_portal_sessions (customer_id);
GRANT ALL ON public.customer_portal_sessions TO service_role;
ALTER TABLE public.customer_portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read portal sessions" ON public.customer_portal_sessions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.customer_portal_sessions TO authenticated;