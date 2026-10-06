ALTER TABLE public.provider_connections ADD COLUMN IF NOT EXISTS webhook_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS provider_connections_webhook_token_hash_unique ON public.provider_connections(provider, webhook_token_hash) WHERE webhook_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_provider_transfer_unique ON public.withdrawals(provider_transfer_id) WHERE provider_transfer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_payment_event(_payment_id uuid, _status payment_status, _paid_at timestamptz DEFAULT NULL, _provider_fee numeric DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.payments%ROWTYPE;
  hold integer;
  pfee numeric(14,2);
  net numeric(14,2);
  margin numeric(14,2);
  paid timestamptz;
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
    margin := p.platform_fee_amount - pfee;
    UPDATE public.payments SET status = 'paid', paid_at = paid, provider_fee_amount = pfee,
      gross_margin_amount = margin, net_amount = net,
      available_on = (paid AT TIME ZONE 'America/Sao_Paulo')::date + hold, updated_at = now()
      WHERE id = p.id;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount, occurred_at) VALUES
      (p.tenant_id, p.id, 'payment', COALESCE(p.description, 'Pagamento recebido'), p.gross_amount, paid),
      (p.tenant_id, p.id, 'platform_fee', 'Taxa WiizePay', -p.platform_fee_amount, paid);
    IF pfee > 0 THEN
      INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount, occurred_at)
      VALUES (p.tenant_id, p.id, 'provider_fee', 'Custo da infraestrutura de pagamento', -pfee, paid);
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
END;
$$;
REVOKE ALL ON FUNCTION public.apply_payment_event(uuid, payment_status, timestamptz, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(uuid, payment_status, timestamptz, numeric) TO service_role;