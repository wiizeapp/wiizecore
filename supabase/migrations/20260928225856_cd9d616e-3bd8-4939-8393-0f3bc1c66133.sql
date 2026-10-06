ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS duration_months integer;

CREATE TABLE public.contract_services (
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, service_id)
);
GRANT SELECT ON public.contract_services TO authenticated;
GRANT ALL ON public.contract_services TO service_role;
ALTER TABLE public.contract_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read contract services" ON public.contract_services FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.contract_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_events_contract_idx ON public.contract_events(contract_id, created_at);
GRANT SELECT ON public.contract_events TO authenticated;
GRANT ALL ON public.contract_events TO service_role;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read contract events" ON public.contract_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

INSERT INTO public.contract_services (contract_id, service_id, tenant_id)
SELECT id, service_id, tenant_id FROM public.contracts WHERE service_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.contract_events (tenant_id, contract_id, event, created_at)
SELECT tenant_id, id, 'created', created_at FROM public.contracts;
INSERT INTO public.contract_events (tenant_id, contract_id, event, actor, created_at)
SELECT tenant_id, contract_id, 'signed_' || signer_role, signer_name, signed_at FROM public.contract_signatures;