CREATE TABLE public.wiize_sale_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  charge_group_id uuid NOT NULL,
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
GRANT ALL ON public.wiize_sale_events TO service_role;
ALTER TABLE public.wiize_sale_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.wiize_sale_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX wiize_sale_events_pending_idx ON public.wiize_sale_events (status, next_attempt_at);
CREATE INDEX wiize_sale_events_group_idx ON public.wiize_sale_events (tenant_id, charge_group_id, created_at);