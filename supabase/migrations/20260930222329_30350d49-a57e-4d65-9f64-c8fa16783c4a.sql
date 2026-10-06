CREATE OR REPLACE FUNCTION public.dunning_charge_fee(_payment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record; cfg record; pl record; ov boolean; bal numeric; st public.dunning_settings; cost numeric; ch text; c numeric;
  customer_name text; contract_title text; tx_description text;
BEGIN
  SELECT id, tenant_id, customer_id, contract_id, installment_number, installment_count, subscription_id
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

  SELECT * INTO pl FROM public.dunning_plans WHERE code = cfg.plan_code AND active ORDER BY version DESC LIMIT 1;
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
$$;

REVOKE ALL ON FUNCTION public.dunning_charge_fee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dunning_charge_fee(uuid) TO service_role;