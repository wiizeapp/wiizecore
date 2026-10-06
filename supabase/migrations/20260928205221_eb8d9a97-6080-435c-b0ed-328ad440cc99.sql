CREATE TABLE public.fiscal_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  portal text NOT NULL DEFAULT 'municipal' CHECK (portal IN ('municipal','national')),
  email text,
  municipal_inscription text,
  simples_nacional boolean,
  cultural_projects_promoter boolean NOT NULL DEFAULT false,
  cnae text,
  special_tax_regime text,
  service_list_item text,
  nbs_code text,
  rps_serie text,
  rps_number integer,
  lote_number integer,
  national_portal_tax_calculation_regime text,
  credentials_configured boolean NOT NULL DEFAULT false,
  municipal_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_status text NOT NULL DEFAULT 'pending' CHECK (config_status IN ('pending','configured','attention')),
  missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_issue boolean NOT NULL DEFAULT false,
  auto_issue_rule text NOT NULL DEFAULT 'ON_PAYMENT_CONFIRMATION' CHECK (auto_issue_rule IN ('ON_PAYMENT_CONFIRMATION','ON_PAYMENT_DUE_DATE','BEFORE_PAYMENT_DUE_DATE','ON_DUE_DATE_MONTH','ON_NEXT_MONTH')),
  auto_issue_days integer CHECK (auto_issue_days IS NULL OR auto_issue_days IN (5,10,15,30,60)),
  default_fiscal_service_id uuid,
  default_observations text,
  production_confirmed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fiscal_settings TO authenticated;
GRANT ALL ON public.fiscal_settings TO service_role;
ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_settings_member_read" ON public.fiscal_settings FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER fiscal_settings_touch BEFORE UPDATE ON public.fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.fiscal_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  municipal_service_id text,
  municipal_service_code text,
  municipal_service_name text,
  iss numeric(7,4),
  retain_iss boolean NOT NULL DEFAULT false,
  taxes jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (municipal_service_id IS NOT NULL OR municipal_service_code IS NOT NULL)
);
CREATE UNIQUE INDEX fiscal_services_service_unique ON public.fiscal_services(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX fiscal_services_tenant_idx ON public.fiscal_services(tenant_id);
GRANT SELECT ON public.fiscal_services TO authenticated;
GRANT ALL ON public.fiscal_services TO service_role;
ALTER TABLE public.fiscal_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_services_member_read" ON public.fiscal_services FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER fiscal_services_touch BEFORE UPDATE ON public.fiscal_services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.fiscal_settings ADD CONSTRAINT fiscal_settings_default_service_fk FOREIGN KEY (default_fiscal_service_id) REFERENCES public.fiscal_services(id) ON DELETE SET NULL;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  fiscal_service_id uuid REFERENCES public.fiscal_services(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  charge_group_id uuid,
  origin text NOT NULL CHECK (origin IN ('payment','installment','standalone','automatic')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SCHEDULED','SYNCHRONIZED','AUTHORIZED','PROCESSING_CANCELLATION','CANCELED','CANCELLATION_DENIED','ERROR')),
  value numeric(14,2) NOT NULL CHECK (value > 0),
  deductions numeric(14,2) NOT NULL DEFAULT 0,
  service_description text NOT NULL,
  observations text,
  effective_date date NOT NULL,
  municipal_service_code text,
  municipal_service_name text,
  number text,
  validation_code text,
  pdf_url text,
  xml_url text,
  provider text NOT NULL DEFAULT 'asaas',
  provider_invoice_id text UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox',
  error_message text,
  last_provider_event_id text,
  requested_by uuid,
  authorized_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invoices_active_payment_unique ON public.invoices(payment_id) WHERE payment_id IS NOT NULL AND status NOT IN ('ERROR','CANCELED');
CREATE UNIQUE INDEX invoices_active_installment_unique ON public.invoices(charge_group_id) WHERE origin = 'installment' AND status NOT IN ('ERROR','CANCELED');
CREATE INDEX invoices_tenant_created_idx ON public.invoices(tenant_id, created_at DESC);
CREATE INDEX invoices_customer_idx ON public.invoices(customer_id);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_member_read" ON public.invoices FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  message text,
  provider_event_id text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invoice_events_provider_unique ON public.invoice_events(invoice_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX invoice_events_invoice_idx ON public.invoice_events(invoice_id, created_at);
GRANT SELECT ON public.invoice_events TO authenticated;
GRANT ALL ON public.invoice_events TO service_role;
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_events_member_read" ON public.invoice_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));