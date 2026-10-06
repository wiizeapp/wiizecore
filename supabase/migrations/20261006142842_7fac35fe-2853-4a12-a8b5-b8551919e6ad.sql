CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  recipient_masked text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  provider_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT ALL ON public.email_outbox TO service_role;
GRANT SELECT ON public.email_outbox TO authenticated;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own tenant email log" ON public.email_outbox
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE INDEX email_outbox_tenant_idx ON public.email_outbox (tenant_id, created_at DESC);