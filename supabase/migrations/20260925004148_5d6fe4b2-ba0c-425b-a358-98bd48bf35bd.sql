-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('platform_admin','support','user');
CREATE TYPE public.tenant_role AS ENUM ('owner','admin','finance','viewer');
CREATE TYPE public.customer_type AS ENUM ('individual','company');
CREATE TYPE public.customer_status AS ENUM ('active','inactive','overdue','suspended','closed');
CREATE TYPE public.service_type AS ENUM ('one_time','installment','recurring');
CREATE TYPE public.billing_frequency AS ENUM ('weekly','biweekly','monthly','quarterly','semiannual','yearly');
CREATE TYPE public.contract_status AS ENUM ('draft','awaiting_customer','awaiting_provider','signed','cancelled','expired');
CREATE TYPE public.payment_method AS ENUM ('pix','credit_card','boleto');
CREATE TYPE public.payment_status AS ENUM ('created','awaiting_payment','processing','paid','overdue','cancelled','refunded','in_analysis','failed');
CREATE TYPE public.withdrawal_status AS ENUM ('requested','in_analysis','processing','completed','failed','cancelled');
CREATE TYPE public.webhook_status AS ENUM ('received','processing','processed','failed','discarded');
CREATE TYPE public.transaction_kind AS ENUM ('payment','platform_fee','provider_fee','refund','withdrawal','adjustment');
CREATE TYPE public.provider_environment AS ENUM ('sandbox','production');

-- ============ UTILITY ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ IDENTITY / TENANCY ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  document text,
  email text,
  phone text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tenants_touch BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX tenant_members_user_idx ON public.tenant_members(user_id);
GRANT SELECT ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_members_select_own ON public.tenant_members FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant_id uuid, _roles public.tenant_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

CREATE POLICY tenants_select_member ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(id));

-- ============ SETTINGS ============
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value numeric(14,4) NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_settings_read ON public.platform_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('platform_fee_percentage', 9.99, 'Taxa padrao da Wise Pay em percentual'),
  ('platform_fee_percentage_pix', 9.99, 'Taxa Wise Pay para Pix'),
  ('platform_fee_percentage_boleto', 9.99, 'Taxa Wise Pay para boleto'),
  ('platform_fee_percentage_credit_card', 9.99, 'Taxa Wise Pay para cartao'),
  ('withdrawal_hold_days', 32, 'Dias para liberacao do saldo para saque'),
  ('minimum_withdrawal_amount', 50, 'Valor minimo de saque em reais'),
  ('withdrawal_fee_amount', 0, 'Taxa fixa de saque em reais');

CREATE TABLE public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  platform_fee_percentage numeric(6,3),
  withdrawal_hold_days integer,
  minimum_withdrawal_amount numeric(14,2),
  default_due_days integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_select ON public.tenant_settings FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type public.customer_type NOT NULL DEFAULT 'individual',
  status public.customer_status NOT NULL DEFAULT 'active',
  name text NOT NULL,
  trade_name text,
  document text,
  email text,
  phone text,
  whatsapp text,
  zip_code text,
  address text,
  address_number text,
  complement text,
  district text,
  city text,
  state text,
  notes text,
  provider_customer_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_tenant_idx ON public.customers(tenant_id);
CREATE UNIQUE INDEX customers_tenant_document_key ON public.customers(tenant_id, document) WHERE document IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[])) WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SERVICES ============
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type public.service_type NOT NULL DEFAULT 'one_time',
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  installments integer CHECK (installments IS NULL OR installments BETWEEN 2 AND 60),
  installment_amount numeric(14,2),
  frequency public.billing_frequency,
  cycles integer CHECK (cycles IS NULL OR cycles > 0),
  starts_on date,
  ends_on date,
  auto_renew boolean NOT NULL DEFAULT false,
  due_days integer NOT NULL DEFAULT 5,
  fine_percentage numeric(6,3) NOT NULL DEFAULT 0,
  interest_percentage numeric(6,3) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  accepted_methods public.payment_method[] NOT NULL DEFAULT ARRAY['pix','credit_card','boleto']::public.payment_method[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_tenant_idx ON public.services(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY services_insert ON public.services FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY services_update ON public.services FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[])) WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY services_delete ON public.services FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ CONTRACTS ============
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  title text NOT NULL,
  status public.contract_status NOT NULL DEFAULT 'draft',
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  starts_on date,
  ends_on date,
  current_version integer NOT NULL DEFAULT 1,
  sent_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contracts_tenant_idx ON public.contracts(tenant_id);
CREATE INDEX contracts_customer_idx ON public.contracts(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contracts_select ON public.contracts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY contracts_insert ON public.contracts FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY contracts_update ON public.contracts FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]) AND status IN ('draft','awaiting_customer','awaiting_provider')) WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY contracts_delete ON public.contracts FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']::public.tenant_role[]) AND status = 'draft');
CREATE TRIGGER contracts_touch BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL,
  content_hash text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version)
);
GRANT SELECT, INSERT ON public.contract_versions TO authenticated;
GRANT ALL ON public.contract_versions TO service_role;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_versions_select ON public.contract_versions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY contract_versions_insert ON public.contract_versions FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));

CREATE TABLE public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  contract_version_id uuid NOT NULL REFERENCES public.contract_versions(id) ON DELETE CASCADE,
  signer_role text NOT NULL,
  signer_name text NOT NULL,
  signer_email text,
  signer_document text,
  content_hash text NOT NULL,
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_version_id, signer_role)
);
GRANT SELECT ON public.contract_signatures TO authenticated;
GRANT ALL ON public.contract_signatures TO service_role;
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_signatures_select ON public.contract_signatures FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- ============ FINANCIAL CORE (server-only writes) ============
CREATE TABLE public.wallets (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  pending_balance numeric(14,2) NOT NULL DEFAULT 0,
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  blocked_balance numeric(14,2) NOT NULL DEFAULT 0,
  total_received numeric(14,2) NOT NULL DEFAULT 0,
  total_fees numeric(14,2) NOT NULL DEFAULT 0,
  total_withdrawn numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallets_select ON public.wallets FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  frequency public.billing_frequency NOT NULL DEFAULT 'monthly',
  method public.payment_method NOT NULL DEFAULT 'pix',
  cycles integer,
  cycles_done integer NOT NULL DEFAULT 0,
  next_charge_on date,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_tenant_idx ON public.subscriptions(tenant_id);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  description text,
  status public.payment_status NOT NULL DEFAULT 'created',
  method public.payment_method,
  gross_amount numeric(14,2) NOT NULL CHECK (gross_amount > 0),
  platform_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  provider_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  installment_number integer,
  installment_count integer,
  due_on date NOT NULL,
  paid_at timestamptz,
  available_on date,
  provider text NOT NULL DEFAULT 'asaas',
  provider_payment_id text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_tenant_idx ON public.payments(tenant_id);
CREATE INDEX payments_status_idx ON public.payments(tenant_id, status);
CREATE UNIQUE INDEX payments_provider_key ON public.payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX payments_idempotency_key ON public.payments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  kind public.transaction_kind NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_tenant_idx ON public.transactions(tenant_id, occurred_at DESC);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  holder_name text NOT NULL,
  holder_document text NOT NULL,
  bank_code text NOT NULL,
  agency text NOT NULL,
  account_number text NOT NULL,
  account_type text NOT NULL DEFAULT 'checking',
  pix_key text,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_accounts_select ON public.bank_accounts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  requested_by uuid,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.withdrawal_status NOT NULL DEFAULT 'requested',
  idempotency_key text,
  provider_transfer_id text,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX withdrawals_idempotency_key ON public.withdrawals(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY withdrawals_select ON public.withdrawals FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- ============ PUBLIC PAYMENT LINKS ============
CREATE TABLE public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_links_select ON public.payment_links FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- ============ INTEGRATIONS (server-only) ============
CREATE TABLE public.provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'asaas',
  environment public.provider_environment NOT NULL DEFAULT 'sandbox',
  api_key_ciphertext text,
  provider_account_id text,
  status text NOT NULL DEFAULT 'disconnected',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, environment)
);
GRANT ALL ON public.provider_connections TO service_role;
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.google_drive_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  google_email text,
  refresh_token_ciphertext text,
  root_folder_id text,
  status text NOT NULL DEFAULT 'disconnected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_drive_connections TO service_role;
ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'contract',
  name text NOT NULL,
  drive_file_id text,
  drive_url text,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- ============ WEBHOOKS (server-only) ============
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processing_status public.webhook_status NOT NULL DEFAULT 'received',
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, external_event_id)
);
CREATE INDEX webhook_events_status_idx ON public.webhook_events(processing_status, received_at DESC);
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY: financial password, MFA recovery, sessions ============
CREATE TABLE public.financial_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.financial_credentials TO service_role;
ALTER TABLE public.financial_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user_idx ON public.mfa_recovery_codes(user_id);
GRANT ALL ON public.mfa_recovery_codes TO service_role;
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_idx ON public.user_sessions(user_id, last_seen_at DESC);
GRANT SELECT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sessions_select_own ON public.user_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ AUDIT & SECURITY LOGS ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id uuid,
  action text NOT NULL,
  resource text,
  resource_id text,
  result text NOT NULL DEFAULT 'success',
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_idx ON public.audit_logs(tenant_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tenant_id uuid,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  identifier text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  UNIQUE (scope, identifier)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;