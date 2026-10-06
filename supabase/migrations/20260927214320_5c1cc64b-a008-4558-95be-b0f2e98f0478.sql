INSERT INTO public.platform_settings (key, value, description) VALUES
  ('pix_daily_limit', 5000, 'Limite diário de saque via Pix por empresa (R$)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.request_withdrawal(_tenant_id uuid, _user_id uuid, _bank_account_id uuid, _amount numeric, _idempotency_key text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE w public.wallets%ROWTYPE; existing uuid; minimum numeric; fee numeric; wid uuid; lim numeric; used numeric;
BEGIN
  SELECT id INTO existing FROM public.withdrawals WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _bank_account_id AND tenant_id = _tenant_id AND verification_status = 'verified' AND COALESCE(trim(pix_key),'') <> '') THEN
    RAISE EXCEPTION 'invalid_bank_account'; END IF;
  PERFORM public.release_available_balances(_tenant_id);
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'minimum_withdrawal_amount'), 50) INTO minimum;
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_fee_amount'), 0) INTO fee;
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'pix_daily_limit'), 5000) INTO lim;
  IF _amount < minimum THEN RAISE EXCEPTION 'below_minimum'; END IF;
  IF _amount <= fee THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO w FROM public.wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND OR w.available_balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  SELECT COALESCE(sum(amount),0) INTO used FROM public.withdrawals
    WHERE tenant_id = _tenant_id AND status NOT IN ('cancelled','failed')
      AND (requested_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF used + _amount > lim THEN RAISE EXCEPTION 'daily_limit'; END IF;
  INSERT INTO public.withdrawals (tenant_id, bank_account_id, requested_by, amount, fee_amount, net_amount, status, idempotency_key)
    VALUES (_tenant_id, _bank_account_id, _user_id, _amount, fee, _amount - fee, 'requested', _idempotency_key) RETURNING id INTO wid;
  INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (_tenant_id, 'withdrawal', 'Saque Pix solicitado', -_amount);
  UPDATE public.wallets SET available_balance = available_balance - _amount, blocked_balance = blocked_balance + _amount, updated_at = now()
    WHERE tenant_id = _tenant_id;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
    (_tenant_id, 'withdrawal.requested', 'Saque solicitado', 'R$ ' || to_char(_amount, 'FM999G999G990D00'), '/financeiro');
  RETURN wid;
END; $function$;