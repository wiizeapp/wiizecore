CREATE TABLE public.pix_automatic_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  provider_authorization_id text,
  status text NOT NULL DEFAULT 'pending',
  value numeric(14,2) NOT NULL,
  frequency billing_frequency NOT NULL DEFAULT 'monthly',
  qr_payload text,
  qr_image text,
  start_on date NOT NULL,
  last_checked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pix_automatic_authorizations TO authenticated;
GRANT ALL ON public.pix_automatic_authorizations TO service_role;
ALTER TABLE public.pix_automatic_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem autorizações Pix Automático" ON public.pix_automatic_authorizations
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER pix_auto_touch BEFORE UPDATE ON public.pix_automatic_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.reconciliation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  kind text NOT NULL,
  expected numeric(14,2),
  actual numeric(14,2),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, kind)
);
GRANT ALL ON public.reconciliation_issues TO service_role;
ALTER TABLE public.reconciliation_issues ENABLE ROW LEVEL SECURITY;