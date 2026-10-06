ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS pix_daily_limit numeric, ADD COLUMN IF NOT EXISTS monthly_withdrawal_count integer;

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('monthly_withdrawal_count', 50, 'Quantidade máxima de saques por mês por empresa')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.limit_increase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  current_daily_limit numeric NOT NULL,
  requested_daily_limit numeric NOT NULL,
  requested_monthly_count integer,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expected_response_on date,
  review_message text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.limit_increase_requests TO authenticated;
GRANT ALL ON public.limit_increase_requests TO service_role;
ALTER TABLE public.limit_increase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own limit requests" ON public.limit_increase_requests FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER touch_limit_requests BEFORE UPDATE ON public.limit_increase_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.request_withdrawal(_tenant_id uuid, _user_id uuid, _bank_account_id uuid, _amount numeric, _idempotency_key text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE w public.wallets%ROWTYPE; existing uuid; minimum numeric; fee numeric; wid uuid; lim numeric; used numeric; mlim integer; mcount integer;
BEGIN
  SELECT id INTO existing FROM public.withdrawals WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _bank_account_id AND tenant_id = _tenant_id AND verification_status = 'verified' AND COALESCE(trim(pix_key),'') <> '') THEN
    RAISE EXCEPTION 'invalid_bank_account'; END IF;
  PERFORM public.release_available_balances(_tenant_id);
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'minimum_withdrawal_amount'), 50) INTO minimum;
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_fee_amount'), 0) INTO fee;
  SELECT COALESCE((SELECT pix_daily_limit FROM public.tenant_settings WHERE tenant_id = _tenant_id),
                  (SELECT value FROM public.platform_settings WHERE key = 'pix_daily_limit'), 5000) INTO lim;
  SELECT COALESCE((SELECT monthly_withdrawal_count FROM public.tenant_settings WHERE tenant_id = _tenant_id),
                  (SELECT value::int FROM public.platform_settings WHERE key = 'monthly_withdrawal_count'), 50) INTO mlim;
  IF _amount < minimum THEN RAISE EXCEPTION 'below_minimum'; END IF;
  IF _amount <= fee THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO w FROM public.wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND OR w.available_balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  SELECT COALESCE(sum(amount),0) INTO used FROM public.withdrawals
    WHERE tenant_id = _tenant_id AND status NOT IN ('cancelled','failed')
      AND (requested_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF used + _amount > lim THEN RAISE EXCEPTION 'daily_limit'; END IF;
  SELECT count(*) INTO mcount FROM public.withdrawals
    WHERE tenant_id = _tenant_id AND status NOT IN ('cancelled','failed')
      AND date_trunc('month', requested_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo');
  IF mcount >= mlim THEN RAISE EXCEPTION 'monthly_limit'; END IF;
  INSERT INTO public.withdrawals (tenant_id, bank_account_id, requested_by, amount, fee_amount, net_amount, status, idempotency_key)
    VALUES (_tenant_id, _bank_account_id, _user_id, _amount, fee, _amount - fee, 'requested', _idempotency_key) RETURNING id INTO wid;
  INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (_tenant_id, 'withdrawal', 'Saque Pix solicitado', -_amount);
  UPDATE public.wallets SET available_balance = available_balance - _amount, blocked_balance = blocked_balance + _amount, updated_at = now()
    WHERE tenant_id = _tenant_id;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
    (_tenant_id, 'withdrawal.requested', 'Saque solicitado', 'R$ ' || to_char(_amount, 'FM999G999G990D00'), '/financeiro');
  RETURN wid;
END; $function$;