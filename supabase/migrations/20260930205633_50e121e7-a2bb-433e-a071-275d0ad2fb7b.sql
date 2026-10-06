ALTER TYPE public.transaction_kind ADD VALUE IF NOT EXISTS 'dunning_fee';

CREATE TABLE public.dunning_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code IN ('essential','smart','intensive')),
  version integer NOT NULL DEFAULT 1,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  channels text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);
GRANT SELECT ON public.dunning_plans TO anon, authenticated;
GRANT ALL ON public.dunning_plans TO service_role;
ALTER TABLE public.dunning_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Planos públicos" ON public.dunning_plans FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY "Admin gerencia planos" ON public.dunning_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'platform_admin')) WITH CHECK (public.has_role(auth.uid(),'platform_admin'));
INSERT INTO public.dunning_plans (code, price, channels) VALUES
 ('essential', 0.99, ARRAY['whatsapp']),
 ('smart', 2.99, ARRAY['whatsapp','sms','email']),
 ('intensive', 3.99, ARRAY['whatsapp','sms','email','voice']);

CREATE TABLE public.dunning_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  recommended_balance numeric(12,2) NOT NULL DEFAULT 20,
  alert_balance numeric(12,2) NOT NULL DEFAULT 10,
  critical_balance numeric(12,2) NOT NULL DEFAULT 5,
  cost_whatsapp numeric(12,4),
  cost_sms numeric(12,4),
  cost_email numeric(12,4),
  cost_voice numeric(12,4),
  min_margin_pct numeric(6,2) NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.dunning_settings TO authenticated;
GRANT ALL ON public.dunning_settings TO service_role;
ALTER TABLE public.dunning_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia config régua" ON public.dunning_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'platform_admin')) WITH CHECK (public.has_role(auth.uid(),'platform_admin'));
INSERT INTO public.dunning_settings DEFAULT VALUES;

CREATE TABLE public.dunning_tenant_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  plan_code text NOT NULL DEFAULT 'essential' CHECK (plan_code IN ('essential','smart','intensive')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dunning_tenant_config TO authenticated;
GRANT ALL ON public.dunning_tenant_config TO service_role;
ALTER TABLE public.dunning_tenant_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem régua" ON public.dunning_tenant_config FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Gestores criam régua" ON public.dunning_tenant_config FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE POLICY "Gestores alteram régua" ON public.dunning_tenant_config FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[])) WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));
CREATE TRIGGER dunning_tenant_config_touch BEFORE UPDATE ON public.dunning_tenant_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.dunning_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  disabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((customer_id IS NOT NULL) <> (contract_id IS NOT NULL))
);
CREATE UNIQUE INDEX dunning_overrides_customer ON public.dunning_overrides(tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX dunning_overrides_contract ON public.dunning_overrides(tenant_id, contract_id) WHERE contract_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dunning_overrides TO authenticated;
GRANT ALL ON public.dunning_overrides TO service_role;
ALTER TABLE public.dunning_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem exceções" ON public.dunning_overrides FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Gestores gerenciam exceções" ON public.dunning_overrides FOR ALL TO authenticated USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[])) WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::public.tenant_role[]));

CREATE TABLE public.dunning_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  plan_id uuid REFERENCES public.dunning_plans(id),
  price numeric(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('active','insufficient_balance','finished','cancelled')),
  channels text[] NOT NULL,
  estimated_cost numeric(12,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dunning_charges_tenant ON public.dunning_charges(tenant_id, created_at DESC);
GRANT SELECT ON public.dunning_charges TO authenticated;
GRANT ALL ON public.dunning_charges TO service_role;
ALTER TABLE public.dunning_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem cobranças da régua" ON public.dunning_charges FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.has_role(auth.uid(),'platform_admin'));
CREATE TRIGGER dunning_charges_touch BEFORE UPDATE ON public.dunning_charges FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.dunning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  channel text,
  event text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dunning_events_payment ON public.dunning_events(payment_id, created_at);
GRANT SELECT ON public.dunning_events TO authenticated;
GRANT ALL ON public.dunning_events TO service_role;
ALTER TABLE public.dunning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem eventos da régua" ON public.dunning_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.has_role(auth.uid(),'platform_admin'));

CREATE OR REPLACE FUNCTION public.dunning_charge_fee(_payment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record; cfg record; pl record; ov boolean; bal numeric; st public.dunning_settings; cost numeric; ch text; c numeric;
BEGIN
  SELECT id, tenant_id, customer_id, contract_id INTO p FROM payments WHERE id = _payment_id;
  IF p.id IS NULL THEN RETURN 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM dunning_charges WHERE payment_id = _payment_id) THEN RETURN 'already'; END IF;
  SELECT * INTO cfg FROM dunning_tenant_config WHERE tenant_id = p.tenant_id;
  IF cfg.tenant_id IS NULL OR NOT cfg.enabled OR cfg.paused THEN RETURN 'disabled'; END IF;
  SELECT EXISTS (SELECT 1 FROM dunning_overrides o WHERE o.tenant_id = p.tenant_id AND o.disabled
    AND (o.customer_id = p.customer_id OR (p.contract_id IS NOT NULL AND o.contract_id = p.contract_id))) INTO ov;
  IF ov THEN RETURN 'excluded'; END IF;
  SELECT * INTO pl FROM dunning_plans WHERE code = cfg.plan_code AND active ORDER BY version DESC LIMIT 1;
  SELECT * INTO st FROM dunning_settings LIMIT 1;
  cost := 0;
  FOREACH ch IN ARRAY pl.channels LOOP
    c := CASE ch WHEN 'whatsapp' THEN st.cost_whatsapp WHEN 'sms' THEN st.cost_sms WHEN 'email' THEN st.cost_email ELSE st.cost_voice END;
    IF c IS NULL THEN cost := NULL; EXIT; END IF;
    cost := cost + c;
  END LOOP;
  SELECT available_balance INTO bal FROM wallets WHERE tenant_id = p.tenant_id FOR UPDATE;
  IF bal IS NULL OR bal < pl.price THEN
    INSERT INTO dunning_charges (tenant_id, payment_id, plan_code, plan_id, price, status, channels, estimated_cost)
      VALUES (p.tenant_id, p.id, pl.code, pl.id, pl.price, 'insufficient_balance', pl.channels, cost);
    INSERT INTO dunning_events (tenant_id, payment_id, event, detail) VALUES (p.tenant_id, p.id, 'blocked', 'Saldo insuficiente');
    RETURN 'insufficient_balance';
  END IF;
  UPDATE wallets SET available_balance = available_balance - pl.price, total_fees = total_fees + pl.price, updated_at = now() WHERE tenant_id = p.tenant_id;
  INSERT INTO transactions (tenant_id, payment_id, kind, description, amount) VALUES (p.tenant_id, p.id, 'dunning_fee', 'Régua de cobrança', -pl.price);
  INSERT INTO dunning_charges (tenant_id, payment_id, plan_code, plan_id, price, status, channels, estimated_cost)
    VALUES (p.tenant_id, p.id, pl.code, pl.id, pl.price, 'active', pl.channels, cost);
  INSERT INTO dunning_events (tenant_id, payment_id, event, detail) VALUES (p.tenant_id, p.id, 'activated', pl.code);
  RETURN 'charged';
END $$;
REVOKE ALL ON FUNCTION public.dunning_charge_fee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dunning_charge_fee(uuid) TO service_role;