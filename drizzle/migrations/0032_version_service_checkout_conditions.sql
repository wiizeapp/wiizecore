CREATE TABLE public.service_checkout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  link_id uuid NOT NULL REFERENCES public.service_checkout_links(id),
  service_id uuid NOT NULL REFERENCES public.services(id),
  token_hash text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  charge_type text NOT NULL CHECK (charge_type IN ('one_time','installment','recurring')),
  frequency text,
  max_installments integer NOT NULL DEFAULT 21 CHECK (max_installments BETWEEN 1 AND 21),
  accepted_methods text[] NOT NULL,
  service_name text NOT NULL,
  description text,
  cycles integer,
  due_days integer NOT NULL DEFAULT 5,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_checkout_versions TO authenticated;
GRANT ALL ON public.service_checkout_versions TO service_role;
ALTER TABLE public.service_checkout_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read service checkout versions" ON public.service_checkout_versions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
ALTER TABLE public.service_checkout_links ADD COLUMN current_version_id uuid REFERENCES public.service_checkout_versions(id);
ALTER TABLE public.service_checkout_sessions ADD COLUMN version_id uuid REFERENCES public.service_checkout_versions(id);
INSERT INTO public.service_checkout_versions (tenant_id, link_id, service_id, token_hash, token_ciphertext, amount, charge_type, frequency, accepted_methods, service_name, description, cycles, due_days, created_by)
SELECT l.tenant_id, l.id, s.id, l.token_hash, l.token_ciphertext, s.amount, s.type::text, s.frequency::text, s.accepted_methods::text[], s.name, s.description, s.cycles, COALESCE(s.due_days,5), l.created_by
FROM public.service_checkout_links l JOIN public.services s ON s.id=l.service_id AND s.tenant_id=l.tenant_id WHERE s.amount > 0 AND NOT s.custom_amount AND NOT s.flexible_type;
UPDATE public.service_checkout_links l SET current_version_id=v.id FROM public.service_checkout_versions v WHERE v.link_id=l.id;
UPDATE public.service_checkout_sessions s SET version_id=l.current_version_id FROM public.service_checkout_links l WHERE s.link_id=l.id;
CREATE INDEX service_checkout_versions_link_idx ON public.service_checkout_versions(link_id);
COMMENT ON TABLE public.service_checkout_versions IS 'Immutable server-authorized prices and billing conditions; older issued tokens keep their conditions. Link active flag revokes all its versions.';
CREATE FUNCTION public.prevent_service_checkout_version_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Checkout conditions are immutable; issue a new version'; END; $$;
CREATE TRIGGER service_checkout_versions_immutable BEFORE UPDATE ON public.service_checkout_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_service_checkout_version_update();