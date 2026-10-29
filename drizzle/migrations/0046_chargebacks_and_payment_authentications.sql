-- PENDENTE: aplicar via ferramenta de migração do Lovable Cloud quando o banco
-- voltar a responder (em 2026-10-29 as tentativas falharam com ENOTFOUND).
-- Conteúdo idêntico ao que será submetido pela ferramenta; não aplicar manualmente.

-- Registro de cada fluxo de autenticação 3DS associado a uma cobrança (sem dados de cartão)
CREATE TABLE public.payment_authentications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payment_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  provider_connection_id uuid REFERENCES public.provider_connections(id) ON DELETE SET NULL,
  provider_payment_id text,
  modality text NOT NULL DEFAULT 'single' CHECK (modality IN ('single','installment','recurring')),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','challenge_redirected','returned','authenticated','failed','capture_refused','abandoned','error')),
  auth_result text CHECK (auth_result IN ('frictionless','issuer_challenge') OR auth_result IS NULL),
  capture_status text,
  external_event_id text,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  error_code text,
  error_message text,
  correlation_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_authentications TO authenticated;
GRANT ALL ON public.payment_authentications TO service_role;
ALTER TABLE public.payment_authentications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem autenticações da empresa" ON public.payment_authentications FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE UNIQUE INDEX payment_authentications_provider_idx ON public.payment_authentications(provider_connection_id, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX payment_authentications_tenant_idx ON public.payment_authentications(tenant_id, payment_id);
CREATE TRIGGER payment_authentications_touch BEFORE UPDATE ON public.payment_authentications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Central de contestações: caso por cobrança contestada
CREATE TABLE public.chargeback_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  provider_connection_id uuid REFERENCES public.provider_connections(id) ON DELETE SET NULL,
  provider_payment_id text NOT NULL,
  provider_chargeback_id text,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  reason text,
  status text NOT NULL DEFAULT 'REQUESTED',
  internal_status text NOT NULL DEFAULT 'received' CHECK (internal_status IN ('received','awaiting_documents','preparing','ready_to_send','defense_sent','in_review','reversed','lost','expired','needs_admin','sync_error')),
  dispute_deadline date,
  last_event text,
  last_provider_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_connection_id, provider_payment_id)
);
GRANT SELECT ON public.chargeback_cases TO authenticated;
GRANT ALL ON public.chargeback_cases TO service_role;
ALTER TABLE public.chargeback_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem contestações da empresa" ON public.chargeback_cases FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX chargeback_cases_tenant_idx ON public.chargeback_cases(tenant_id, internal_status);
CREATE TRIGGER chargeback_cases_touch BEFORE UPDATE ON public.chargeback_cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Metadados das evidências (arquivos ficam em bucket privado, acesso só via URL assinada pelo servidor)
CREATE TABLE public.chargeback_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.chargeback_cases(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  uploaded_by uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, storage_path)
);
GRANT SELECT ON public.chargeback_documents TO authenticated;
GRANT ALL ON public.chargeback_documents TO service_role;
ALTER TABLE public.chargeback_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem documentos de contestação da empresa" ON public.chargeback_documents FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX chargeback_documents_case_idx ON public.chargeback_documents(case_id, created_at);

-- Histórico imutável dos eventos da contestação
CREATE TABLE public.chargeback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.chargeback_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  origin text NOT NULL DEFAULT 'provider' CHECK (origin IN ('provider','user','system')),
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chargeback_events TO authenticated;
GRANT SELECT, INSERT ON public.chargeback_events TO service_role;
ALTER TABLE public.chargeback_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem histórico de contestação da empresa" ON public.chargeback_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX chargeback_events_case_idx ON public.chargeback_events(case_id, created_at);