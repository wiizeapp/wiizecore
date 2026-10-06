ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_tenant_idx ON public.notifications(tenant_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.apply_payment_event(
  _payment_id uuid, _status public.payment_status, _paid_at timestamptz DEFAULT NULL, _provider_fee numeric DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.payments%ROWTYPE; hold integer; pfee numeric(14,2); net numeric(14,2); paid timestamptz;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF _status = 'paid' THEN
    IF p.status IN ('paid','refunded') THEN RETURN; END IF;
    SELECT COALESCE(ts.withdrawal_hold_days,
             (SELECT value::int FROM public.platform_settings WHERE key = 'withdrawal_hold_days'), 32)
      INTO hold FROM (SELECT 1) x LEFT JOIN public.tenant_settings ts ON ts.tenant_id = p.tenant_id;
    paid := COALESCE(_paid_at, now());
    pfee := COALESCE(_provider_fee, p.provider_fee_amount, 0);
    net := p.gross_amount - pfee - p.platform_fee_amount;
    UPDATE public.payments SET status = 'paid', paid_at = paid, provider_fee_amount = pfee,
      net_amount = net, available_on = (paid AT TIME ZONE 'America/Sao_Paulo')::date + hold, updated_at = now()
      WHERE id = p.id;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount, occurred_at) VALUES
      (p.tenant_id, p.id, 'payment', COALESCE(p.description, 'Pagamento recebido'), p.gross_amount, paid),
      (p.tenant_id, p.id, 'platform_fee', 'Taxa Wise Pay', -p.platform_fee_amount, paid);
    IF pfee > 0 THEN
      INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount, occurred_at)
      VALUES (p.tenant_id, p.id, 'provider_fee', 'Taxa do provedor', -pfee, paid);
    END IF;
    INSERT INTO public.wallets (tenant_id) VALUES (p.tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
    UPDATE public.wallets SET pending_balance = pending_balance + net,
      total_received = total_received + p.gross_amount,
      total_fees = total_fees + p.platform_fee_amount + pfee, updated_at = now()
      WHERE tenant_id = p.tenant_id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (p.tenant_id, 'payment.paid', 'Pagamento confirmado',
       COALESCE(p.description, 'Cobrança') || ' — R$ ' || to_char(p.gross_amount, 'FM999G999G990D00'), '/cobrancas');
  ELSIF _status = 'refunded' THEN
    IF p.status = 'refunded' THEN RETURN; END IF;
    IF p.status = 'paid' THEN
      INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
      VALUES (p.tenant_id, p.id, 'refund', 'Estorno', -p.net_amount);
      IF p.released_at IS NOT NULL THEN
        UPDATE public.wallets SET available_balance = available_balance - p.net_amount, updated_at = now() WHERE tenant_id = p.tenant_id;
      ELSE
        UPDATE public.wallets SET pending_balance = pending_balance - p.net_amount, updated_at = now() WHERE tenant_id = p.tenant_id;
      END IF;
    END IF;
    UPDATE public.payments SET status = 'refunded', updated_at = now() WHERE id = p.id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (p.tenant_id, 'payment.refunded', 'Pagamento estornado', COALESCE(p.description, 'Cobrança'), '/cobrancas');
  ELSE
    IF p.status IN ('paid','refunded') THEN RETURN; END IF;
    UPDATE public.payments SET status = _status, updated_at = now() WHERE id = p.id;
    IF _status = 'overdue' AND p.status <> 'overdue' THEN
      INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
        (p.tenant_id, 'payment.overdue', 'Cobrança vencida', COALESCE(p.description, 'Cobrança'), '/cobrancas');
    END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.release_available_balances(_tenant_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total numeric(14,2);
BEGIN
  WITH r AS (
    UPDATE public.payments SET released_at = now(), updated_at = now()
    WHERE tenant_id = _tenant_id AND status = 'paid' AND released_at IS NULL
      AND available_on IS NOT NULL AND available_on <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    RETURNING net_amount
  ) SELECT COALESCE(sum(net_amount), 0) INTO total FROM r;
  IF total > 0 THEN
    UPDATE public.wallets SET pending_balance = pending_balance - total,
      available_balance = available_balance + total, updated_at = now() WHERE tenant_id = _tenant_id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (_tenant_id, 'balance.released', 'Saldo liberado', 'R$ ' || to_char(total, 'FM999G999G990D00') || ' disponível para saque', '/financeiro');
  END IF;
  RETURN total;
END; $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _tenant_id uuid, _user_id uuid, _bank_account_id uuid, _amount numeric, _idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets%ROWTYPE; existing uuid; minimum numeric; fee numeric; wid uuid;
BEGIN
  SELECT id INTO existing FROM public.withdrawals WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _bank_account_id AND tenant_id = _tenant_id) THEN
    RAISE EXCEPTION 'invalid_bank_account'; END IF;
  PERFORM public.release_available_balances(_tenant_id);
  SELECT COALESCE((SELECT value::numeric FROM public.platform_settings WHERE key = 'minimum_withdrawal_amount'), 50) INTO minimum;
  SELECT COALESCE((SELECT value::numeric FROM public.platform_settings WHERE key = 'withdrawal_fee'), 0) INTO fee;
  IF _amount < minimum THEN RAISE EXCEPTION 'below_minimum'; END IF;
  SELECT * INTO w FROM public.wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND OR w.available_balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  INSERT INTO public.withdrawals (tenant_id, bank_account_id, requested_by, amount, fee_amount, net_amount, status, idempotency_key)
    VALUES (_tenant_id, _bank_account_id, _user_id, _amount, fee, _amount - fee, 'requested', _idempotency_key) RETURNING id INTO wid;
  INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (_tenant_id, 'withdrawal', 'Saque solicitado', -_amount);
  UPDATE public.wallets SET available_balance = available_balance - _amount, blocked_balance = blocked_balance + _amount, updated_at = now()
    WHERE tenant_id = _tenant_id;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
    (_tenant_id, 'withdrawal.requested', 'Saque solicitado', 'R$ ' || to_char(_amount, 'FM999G999G990D00'), '/financeiro');
  RETURN wid;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_withdrawal(_tenant_id uuid, _withdrawal_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wd public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO wd FROM public.withdrawals WHERE id = _withdrawal_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF wd.status NOT IN ('requested','in_analysis') THEN RAISE EXCEPTION 'not_cancellable'; END IF;
  UPDATE public.withdrawals SET status = 'cancelled', failure_reason = _reason, updated_at = now() WHERE id = wd.id;
  INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (_tenant_id, 'adjustment', 'Saque cancelado — valor devolvido', wd.amount);
  UPDATE public.wallets SET available_balance = available_balance + wd.amount, blocked_balance = blocked_balance - wd.amount, updated_at = now()
    WHERE tenant_id = _tenant_id;
END; $$;

REVOKE ALL ON FUNCTION public.release_available_balances(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_withdrawal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_available_balances(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(uuid, uuid, text) TO service_role;