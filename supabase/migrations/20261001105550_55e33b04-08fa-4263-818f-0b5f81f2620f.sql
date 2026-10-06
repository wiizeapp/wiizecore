-- Tentativas de pagamento no provedor, vinculadas à mesma cobrança lógica
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  method public.payment_method,
  provider_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','superseded','paid','failed','cancelled')),
  reason text NOT NULL DEFAULT 'original' CHECK (reason IN ('original','method_change','regularization','retry')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  fine_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  interest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  due_on date,
  invoice_url text,
  bank_slip_url text,
  actor text NOT NULL DEFAULT 'system' CHECK (actor IN ('customer','provider','system')),
  actor_user_id uuid,
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, attempt_number),
  UNIQUE (payment_id, idempotency_key)
);
GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem tentativas da empresa" ON public.payment_attempts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
-- Só uma operação em andamento e uma tentativa ativa por cobrança
CREATE UNIQUE INDEX payment_attempts_one_pending ON public.payment_attempts(payment_id) WHERE status = 'pending';
CREATE UNIQUE INDEX payment_attempts_one_active ON public.payment_attempts(payment_id) WHERE status = 'active';
CREATE INDEX payment_attempts_tenant_idx ON public.payment_attempts(tenant_id, payment_id);
CREATE TRIGGER payment_attempts_touch BEFORE UPDATE ON public.payment_attempts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Linha do tempo da cobrança
CREATE TABLE public.charge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'system' CHECK (actor IN ('customer','provider','system')),
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.charge_events TO authenticated;
GRANT ALL ON public.charge_events TO service_role;
ALTER TABLE public.charge_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem histórico da empresa" ON public.charge_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX charge_events_payment_idx ON public.charge_events(payment_id, created_at);

-- Aparência do checkout versionada por empresa
CREATE TABLE public.checkout_appearance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  settings jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);
GRANT SELECT ON public.checkout_appearance_versions TO authenticated;
GRANT ALL ON public.checkout_appearance_versions TO service_role;
ALTER TABLE public.checkout_appearance_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem aparência da empresa" ON public.checkout_appearance_versions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.payments
  ADD COLUMN current_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN checkout_appearance_version_id uuid REFERENCES public.checkout_appearance_versions(id) ON DELETE SET NULL,
  ADD COLUMN original_amount numeric(14,2),
  ADD COLUMN original_due_on date;

-- Registra a tentativa original das cobranças existentes
INSERT INTO public.payment_attempts (tenant_id, payment_id, attempt_number, method, provider_payment_id, status, reason, amount, due_on, invoice_url, bank_slip_url, idempotency_key, created_at)
SELECT tenant_id, id, 1, method, provider_payment_id,
  CASE WHEN status = 'paid' THEN 'paid' WHEN status IN ('cancelled','refunded','failed') THEN 'cancelled' ELSE 'active' END,
  'original', gross_amount, due_on, invoice_url, bank_slip_url, 'original', created_at
FROM public.payments WHERE provider_payment_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.payments p SET current_attempt_id = a.id FROM public.payment_attempts a WHERE a.payment_id = p.id AND a.attempt_number = 1;
UPDATE public.payments SET original_amount = gross_amount, original_due_on = due_on WHERE original_amount IS NULL;