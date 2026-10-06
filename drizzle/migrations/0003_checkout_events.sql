CREATE TABLE public.checkout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  charge_group_id uuid NOT NULL,
  payment_link_id uuid,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkout_events_customer_idx ON public.checkout_events (tenant_id, customer_id, created_at DESC);
CREATE INDEX checkout_events_group_idx ON public.checkout_events (charge_group_id, event);
GRANT SELECT ON public.checkout_events TO authenticated;
GRANT ALL ON public.checkout_events TO service_role;
ALTER TABLE public.checkout_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read checkout events" ON public.checkout_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));