-- Lembretes: cada etapa ativa (criação, cada aviso antes, no dia, atraso, atraso repetido, pagamento recebido)
-- conta como 1 cobrança do preço do plano. Descontado de uma vez ao configurar a cobrança (sem repetir).
ALTER TABLE public.dunning_charges ADD COLUMN IF NOT EXISTS steps_count integer NOT NULL DEFAULT 1;

UPDATE public.dunning_settings SET cost_whatsapp = COALESCE(cost_whatsapp, 0.55), cost_sms = COALESCE(cost_sms, 0.99),
  cost_voice = COALESCE(cost_voice, 0.55), cost_email = COALESCE(cost_email, 0), updated_at = now();

CREATE OR REPLACE FUNCTION public.dunning_step_channels(_steps jsonb, _key text, _allowed text[])
 RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT c), '{}') FROM (
    SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(_steps -> _key) = 'array' THEN _steps -> _key
      ELSE (CASE _key WHEN 'created' THEN '["whatsapp","email"]' WHEN 'before' THEN '["whatsapp","sms","email"]'
        WHEN 'due' THEN '["whatsapp"]' WHEN 'overdue' THEN '["whatsapp","voice"]' WHEN 'overdue_repeat' THEN '["whatsapp","voice"]'
        ELSE '["whatsapp","email"]' END)::jsonb END) AS c
  ) x WHERE c = ANY(_allowed);
$$;

CREATE OR REPLACE FUNCTION public.dunning_charge_fee(_payment_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  p record; cfg record; plan_code_eff text; pl record; ov boolean; bal numeric; st public.dunning_settings; cost numeric; ch text; c numeric;
  customer_name text; contract_title text; tx_description text; k text; chs text[]; reps int; n int := 0; total numeric; before_n int;
BEGIN
  SELECT id, tenant_id, customer_id, contract_id, installment_number, installment_count, subscription_id, charge_group_id
    INTO p FROM public.payments WHERE id = _payment_id;
  IF p.id IS NULL THEN RETURN 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.dunning_charges WHERE payment_id = _payment_id) THEN RETURN 'already'; END IF;
  SELECT * INTO cfg FROM public.dunning_tenant_config WHERE tenant_id = p.tenant_id;
  IF cfg.tenant_id IS NULL OR NOT cfg.enabled OR cfg.paused THEN RETURN 'disabled'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.dunning_overrides o WHERE o.tenant_id = p.tenant_id AND o.disabled
      AND (o.customer_id = p.customer_id OR (p.contract_id IS NOT NULL AND o.contract_id = p.contract_id))) INTO ov;
  IF ov THEN RETURN 'excluded'; END IF;
  SELECT COALESCE((SELECT g.plan_code FROM public.dunning_charge_plans g WHERE g.tenant_id = p.tenant_id AND g.charge_group_id = p.charge_group_id), cfg.plan_code) INTO plan_code_eff;
  SELECT * INTO pl FROM public.dunning_plans WHERE code = plan_code_eff AND active ORDER BY version DESC LIMIT 1;
  SELECT * INTO st FROM public.dunning_settings LIMIT 1;
  SELECT LEAST(2, GREATEST(1, COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(cfg.steps -> 'beforeOffsets') = 'array' THEN cfg.steps -> 'beforeOffsets' END), 1))) INTO before_n;
  cost := 0;
  FOREACH k IN ARRAY ARRAY['created','before','due','overdue','overdue_repeat','received'] LOOP
    chs := public.dunning_step_channels(cfg.steps, k, pl.channels);
    IF array_length(chs, 1) IS NULL THEN CONTINUE; END IF;
    reps := CASE WHEN k = 'before' THEN before_n ELSE 1 END;
    n := n + reps;
    IF cost IS NOT NULL THEN
      FOREACH ch IN ARRAY chs LOOP
        c := CASE ch WHEN 'whatsapp' THEN st.cost_whatsapp WHEN 'sms' THEN st.cost_sms WHEN 'email' THEN st.cost_email ELSE st.cost_voice END;
        IF c IS NULL THEN cost := NULL; EXIT; END IF;
        cost := cost + c * reps;
      END LOOP;
    END IF;
  END LOOP;
  IF n = 0 THEN RETURN 'disabled'; END IF;
  total := round(pl.price * n, 2);
  SELECT name INTO customer_name FROM public.customers WHERE id = p.customer_id AND tenant_id = p.tenant_id;
  SELECT title INTO contract_title FROM public.contracts WHERE id = p.contract_id AND tenant_id = p.tenant_id;
  tx_description := 'Lembretes de cobrança — ' || COALESCE(customer_name, 'Cliente');
  IF contract_title IS NOT NULL THEN tx_description := tx_description || ' · ' || contract_title; END IF;
  IF p.installment_number IS NOT NULL AND COALESCE(p.installment_count, 1) > 1 THEN
    tx_description := tx_description || ' · parcela ' || p.installment_number || '/' || p.installment_count;
  ELSIF p.subscription_id IS NOT NULL THEN tx_description := tx_description || ' · ciclo recorrente';
  END IF;
  tx_description := tx_description || ' · ' || CASE pl.code WHEN 'essential' THEN 'Essencial' WHEN 'smart' THEN 'Inteligente' ELSE 'Intensivo' END || ' · ' || n || ' aviso(s)';
  SELECT available_balance INTO bal FROM public.wallets WHERE tenant_id = p.tenant_id FOR UPDATE;
  IF bal IS NULL OR bal < total THEN
    INSERT INTO public.dunning_charges (tenant_id, payment_id, plan_code, plan_id, price, status, channels, estimated_cost, steps_count)
      VALUES (p.tenant_id, p.id, pl.code, pl.id, total, 'insufficient_balance', pl.channels, cost, n);
    INSERT INTO public.dunning_events (tenant_id, payment_id, event, detail) VALUES (p.tenant_id, p.id, 'blocked', tx_description || ' · saldo insuficiente');
    RETURN 'insufficient_balance';
  END IF;
  UPDATE public.wallets SET available_balance = available_balance - total, total_fees = total_fees + total, updated_at = now() WHERE tenant_id = p.tenant_id;
  INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount) VALUES (p.tenant_id, p.id, 'dunning_fee', tx_description, -total);
  INSERT INTO public.dunning_charges (tenant_id, payment_id, plan_code, plan_id, price, status, channels, estimated_cost, steps_count)
    VALUES (p.tenant_id, p.id, pl.code, pl.id, total, 'active', pl.channels, cost, n);
  INSERT INTO public.dunning_events (tenant_id, payment_id, event, detail) VALUES (p.tenant_id, p.id, 'activated', tx_description);
  RETURN 'charged';
END
$function$;

REVOKE ALL ON FUNCTION public.dunning_charge_fee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dunning_charge_fee(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.dunning_step_channels(jsonb, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dunning_step_channels(jsonb, text, text[]) TO service_role;
