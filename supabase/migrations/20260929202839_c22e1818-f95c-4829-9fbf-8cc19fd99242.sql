UPDATE public.payment_fee_settings SET active = false, effective_until = now() WHERE active AND version = 1;
INSERT INTO public.payment_fee_settings (payment_method, installment_min, installment_max, fixed_fee, percentage_fee, version, effective_from) VALUES
 ('pix',1,1,2.99,0.99,2,now()),
 ('pix_recurring',1,1,2.99,4.99,2,now()),
 ('boleto',1,21,2.99,4.99,2,now()),
 ('debit_card',1,1,0.99,4.99,2,now()),
 ('credit_card',1,1,0.99,5.99,2,now()),
 ('credit_card',2,6,0.99,6.99,2,now()),
 ('credit_card',7,12,0.99,7.49,2,now()),
 ('credit_card',13,21,0.99,7.99,2,now());

CREATE TABLE public.provider_cost_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'asaas',
  payment_method text NOT NULL CHECK (payment_method IN ('pix','pix_recurring','boleto','debit_card','credit_card')),
  installment_min integer NOT NULL DEFAULT 1,
  installment_max integer NOT NULL DEFAULT 1,
  fixed_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (fixed_cost >= 0),
  percentage_cost numeric(8,4) NOT NULL DEFAULT 0 CHECK (percentage_cost >= 0 AND percentage_cost <= 100),
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (installment_min >= 1 AND installment_max >= installment_min AND installment_max <= 21)
);
GRANT SELECT ON public.provider_cost_settings TO authenticated;
GRANT ALL ON public.provider_cost_settings TO service_role;
ALTER TABLE public.provider_cost_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read provider costs" ON public.provider_cost_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE TRIGGER provider_cost_settings_touch BEFORE UPDATE ON public.provider_cost_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.fee_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('commercial_fee','provider_cost','platform_setting')),
  payment_method text,
  installment_min integer,
  installment_max integer,
  previous jsonb,
  next jsonb NOT NULL,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_change_log TO authenticated;
GRANT ALL ON public.fee_change_log TO service_role;
ALTER TABLE public.fee_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read fee log" ON public.fee_change_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

INSERT INTO public.fee_change_log (kind, next, reason) VALUES ('commercial_fee', jsonb_build_object('version', 2), 'Nova tabela oficial de taxas WiizePay');

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS service_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS fee_payer_share numeric(5,2) NOT NULL DEFAULT 0 CHECK (fee_payer_share >= 0 AND fee_payer_share <= 100),
  ADD COLUMN IF NOT EXISTS provider_cost_config_id uuid REFERENCES public.provider_cost_settings(id),
  ADD COLUMN IF NOT EXISTS estimated_provider_cost numeric(14,2);

UPDATE public.platform_settings SET value = 2.50 WHERE key = 'invoice_fee_amount';
INSERT INTO public.fee_change_log (kind, next, previous, reason) VALUES ('platform_setting', '{"key":"invoice_fee_amount","value":2.50}', '{"value":2.49}', 'Nova tabela oficial de taxas WiizePay');