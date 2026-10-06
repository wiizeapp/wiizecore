
CREATE TABLE public.dunning_charge_plans (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  charge_group_id uuid NOT NULL,
  plan_code text NOT NULL CHECK (plan_code IN ('essential','smart','intensive')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, charge_group_id)
);
GRANT SELECT ON public.dunning_charge_plans TO authenticated;
GRANT ALL ON public.dunning_charge_plans TO service_role;
ALTER TABLE public.dunning_charge_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem plano da cobrança" ON public.dunning_charge_plans FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.dunning_charge_fee(_payment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record; cfg record; plan_code_eff text; pl record; ov boolean; bal numeric; st public.dunning_settings; cost numeric; ch text; c numeric;
  customer_name text; contract_title text; tx_description text;
BEGIN
  SELECT id, tenant_id, customer_id, contract_id, installment_number, installment_count, subscription_id, charge_group_id
    INTO p FROM public.payments WHERE id = _payment_id;
  IF p.id IS NULL THEN RETURN 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.dunning_charges WHERE payment_id = _payment_id) THEN RETURN 'already'; END IF;

  SELECT * INTO cfg FROM public.dunning_tenant_config WHERE tenant_id = p.tenant_id;
  IF cfg.tenant_id IS NULL OR NOT cfg.enabled OR cfg.paused THEN RETURN 'disabled'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.dunning_overrides o
    WHERE o.tenant_id = p.tenant_id AND o.disabled
      AND (o.customer_id = p.customer_id OR (p.contract_id IS NOT NULL AND o.contract_id = p.contract_id))
  ) INTO ov;
  IF ov THEN RETURN 'excluded'; END IF;

  SELECT COALESCE((SELECT g.plan_code FROM public.dunning_charge_plans g WHERE g.tenant_id = p.tenant_id AND g.charge_group_id = p.charge_group_id), cfg.plan_code) INTO plan_code_eff;
  SELECT * INTO pl FROM public.dunning_plans WHERE code = plan_code_eff AND active ORDER BY version DESC LIMIT 1;
  SELECT * INTO st FROM public.dunning_settings LIMIT 1;
  cost := 0;
  FOREACH ch IN ARRAY pl.channels LOOP
    c := CASE ch WHEN 'whatsapp' THEN st.cost_whatsapp WHEN 'sms' THEN st.cost_sms WHEN 'email' THEN st.cost_email ELSE st.cost_voice END;
    IF c IS NULL THEN cost := NULL; EXIT; END IF;
    cost := cost + c;
  END LOOP;

  SELECT name INTO customer_name FROM public.customers WHERE id = p.customer_id AND tenant_id = p.tenant_id;
  SELECT title INTO contract_title FROM public.contracts WHERE id = p.contract_id AND tenant_id = p.tenant_id;
  tx_description := 'Lembretes de cobrança — ' || COALESCE(customer_name, 'Cliente');
  IF contract_title IS NOT NULL THEN tx_description := tx_description || ' · ' || contract_title; END IF;
  IF p.installment_number IS NOT NULL AND COALESCE(p.installment_count, 1) > 1 THEN
    tx_description := tx_description || ' · parcela ' || p.installment_number || '/' || p.installment_count;
  ELSIF p.subscription_id IS NOT NULL THEN
    tx_description := tx_description || ' · ciclo recorrente';
  END IF;
  tx_description := tx_description || ' · ' || CASE pl.code WHEN 'essential' THEN 'Essencial' WHEN 'smart' THEN 'Inteligente' ELSE 'Intensivo' END;

  SELECT available_balance INTO bal FROM public.wallets WHERE tenant_id = p.tenant_id FOR UPDATE;
  IF bal IS NULL OR bal < pl.price THEN
    INSERT INTO public.dunning_charges (tenant_id, payment_id, plan_code, plan_id, price, status, channels, estimated_cost)
      VALUES (p.tenant_id, p.id, pl.code, pl.id, pl.price, 'insufficient_balance', pl.channels, cost);
    INSERT INTO public.dunning_events (tenant_id, payment_id, event, detail)
      VALUES (p.tenant_id, p.id, 'blocked', tx_description || ' · saldo insuficiente');
    RETURN 'insufficient_balance';
  END IF;

  UPDATE public.wallets
    SET available_balance = available_balance - pl.price,
        total_fees = total_fees + pl.price,
        updated_at = now()
    WHERE tenant_id = p.tenant_id;
  INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
    VALUES (p.tenant_id, p.id, 'dunning_fee', tx_description, -pl.price);
  INSERT INTO public.dunning_charges (tenant_id, payment_id, plan_code, plan_id, price, status, channels, estimated_cost)
    VALUES (p.tenant_id, p.id, pl.code, pl.id, pl.price, 'active', pl.channels, cost);
  INSERT INTO public.dunning_events (tenant_id, payment_id, event, detail)
    VALUES (p.tenant_id, p.id, 'activated', tx_description);
  RETURN 'charged';
END
$function$;

CREATE OR REPLACE FUNCTION public.dunning_change_group_plan(_tenant_id uuid, _charge_group_id uuid, _plan_code text, _user_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE pl record; r record; diff numeric; total numeric := 0; bal numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE tenant_id = _tenant_id AND charge_group_id = _charge_group_id) THEN RAISE EXCEPTION 'Cobrança não encontrada.'; END IF;
  SELECT * INTO pl FROM public.dunning_plans WHERE code = _plan_code AND active ORDER BY version DESC LIMIT 1;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'Plano inválido.'; END IF;
  SELECT available_balance INTO bal FROM public.wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  FOR r IN SELECT d.* FROM public.dunning_charges d JOIN public.payments p ON p.id = d.payment_id
           WHERE p.tenant_id = _tenant_id AND p.charge_group_id = _charge_group_id AND d.status = 'active' AND d.plan_code <> _plan_code LOOP
    total := total + (pl.price - r.price);
  END LOOP;
  IF total > 0 AND COALESCE(bal, 0) < total THEN RAISE EXCEPTION 'Saldo insuficiente para trocar o plano desta cobrança.'; END IF;
  FOR r IN SELECT d.* FROM public.dunning_charges d JOIN public.payments p ON p.id = d.payment_id
           WHERE p.tenant_id = _tenant_id AND p.charge_group_id = _charge_group_id AND d.status = 'active' AND d.plan_code <> _plan_code LOOP
    diff := pl.price - r.price;
    UPDATE public.wallets SET available_balance = available_balance - diff, total_fees = total_fees + diff, updated_at = now() WHERE tenant_id = _tenant_id;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
      VALUES (_tenant_id, r.payment_id, 'dunning_fee', 'Lembretes de cobrança — ajuste de plano para ' || CASE pl.code WHEN 'essential' THEN 'Essencial' WHEN 'smart' THEN 'Inteligente' ELSE 'Intensivo' END, -diff);
    UPDATE public.dunning_charges SET plan_code = pl.code, plan_id = pl.id, price = pl.price, channels = pl.channels, updated_at = now() WHERE id = r.id;
    INSERT INTO public.dunning_events (tenant_id, payment_id, event, detail) VALUES (_tenant_id, r.payment_id, 'plan_changed', 'Plano alterado para ' || pl.code);
  END LOOP;
  INSERT INTO public.dunning_charge_plans (tenant_id, charge_group_id, plan_code, updated_by) VALUES (_tenant_id, _charge_group_id, _plan_code, _user_id)
    ON CONFLICT (tenant_id, charge_group_id) DO UPDATE SET plan_code = EXCLUDED.plan_code, updated_by = EXCLUDED.updated_by, updated_at = now();
  RETURN total;
END $fn$;
REVOKE ALL ON FUNCTION public.dunning_change_group_plan(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dunning_change_group_plan(uuid, uuid, text, uuid) TO service_role;
