CREATE TABLE public.reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_name text,
  summary text,
  total_difference numeric(14,2),
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reconciliation_reports TO authenticated;
GRANT ALL ON public.reconciliation_reports TO service_role;
ALTER TABLE public.reconciliation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read reconciliation reports" ON public.reconciliation_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE INDEX reconciliation_reports_tenant_idx ON public.reconciliation_reports(tenant_id, created_at DESC);

ALTER TABLE public.pix_automatic_authorizations
  ADD COLUMN IF NOT EXISTS link_token_hash text,
  ADD COLUMN IF NOT EXISTS link_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS pix_auto_link_token_idx ON public.pix_automatic_authorizations(link_token_hash) WHERE link_token_hash IS NOT NULL;