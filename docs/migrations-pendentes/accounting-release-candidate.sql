-- CANDIDATE ONLY: isolated-fixture validation, NOT an applied migration.
-- Full provider/tenant admission, lock-order and rollback review required before deployment.
CREATE OR REPLACE FUNCTION public.release_coproduction_splits(_payment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; p public.payments%ROWTYPE; remaining numeric(14,2); n integer := 0;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'paid' OR p.released_at IS NULL THEN
    RAISE EXCEPTION 'settlement_required';
  END IF;
  FOR s IN SELECT * FROM public.coproduction_splits WHERE payment_id = _payment_id AND status = 'received' ORDER BY id FOR UPDATE LOOP
    IF s.refunded_amount IS NULL OR s.amount IS NULL OR s.refunded_amount < 0 OR s.refunded_amount > s.amount THEN
      RAISE EXCEPTION 'split_amount_invalid';
    END IF;
    remaining := s.amount - s.refunded_amount;
    UPDATE public.wallets SET pending_balance = pending_balance - remaining,
      available_balance = available_balance + remaining, updated_at = now()
      WHERE tenant_id = s.participant_tenant_id AND pending_balance >= remaining;
    IF NOT FOUND THEN RAISE EXCEPTION 'split_wallet_unavailable'; END IF;
    UPDATE public.coproduction_splits SET status = 'released', released_at = now() WHERE id = s.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.apply_anticipation_event(_request_id uuid, _status anticipation_status, _provider_status text, _event_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.anticipation_requests%ROWTYPE; p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.anticipation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'anticipation_not_found'; END IF;
  IF r.status IN ('completed','failed','cancelled') THEN RETURN; END IF;
  SELECT * INTO p FROM public.payments WHERE id = r.payment_id FOR UPDATE;
  IF NOT FOUND OR p.tenant_id <> r.tenant_id THEN RAISE EXCEPTION 'anticipation_scope_invalid'; END IF;
  IF _status = 'completed' THEN
    IF p.status <> 'paid' OR p.refund_reserved_pending IS NULL OR p.refund_reserved_pending <> 0 THEN
      RAISE EXCEPTION 'anticipation_requires_reconciliation';
    END IF;
    IF r.wiize_fee_amount IS NULL OR r.wiize_fee_amount < 0 OR p.net_amount IS NULL OR r.wiize_fee_amount > p.net_amount THEN
      RAISE EXCEPTION 'anticipation_amount_invalid';
    END IF;
    IF p.released_at IS NULL THEN
      UPDATE public.wallets SET pending_balance = pending_balance - p.net_amount,
        available_balance = available_balance + p.net_amount - r.wiize_fee_amount,
        total_fees = total_fees + r.wiize_fee_amount, updated_at = now()
        WHERE tenant_id = r.tenant_id AND pending_balance >= p.net_amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'anticipation_wallet_unavailable'; END IF;
      UPDATE public.payments SET released_at = now() WHERE id = p.id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance - r.wiize_fee_amount,
        total_fees = total_fees + r.wiize_fee_amount, updated_at = now()
        WHERE tenant_id = r.tenant_id AND available_balance >= r.wiize_fee_amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'anticipation_wallet_unavailable'; END IF;
    END IF;
    UPDATE public.anticipation_requests SET status = 'completed', settled_at = now() WHERE id = r.id;
    UPDATE public.payments SET anticipation_status = 'completed', updated_at = now() WHERE id = p.id;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
      VALUES(r.tenant_id, r.payment_id, 'anticipation_fee', 'Taxa de antecipação', -r.wiize_fee_amount);
    INSERT INTO public.notifications (tenant_id, kind, title, body, link)
      VALUES(r.tenant_id, 'anticipation.completed', 'Antecipação concluída',
        'R$ ' || to_char(r.net_amount, 'FM999G999G990D00') || ' disponível para saque', '/antecipacao');
  ELSIF _status IN ('failed','cancelled') THEN
    UPDATE public.anticipation_requests SET status = _status WHERE id = r.id;
    UPDATE public.payments SET anticipation_status = _status::text, updated_at = now() WHERE id = p.id;
  ELSE
    UPDATE public.anticipation_requests SET status = 'processing', processed_at = coalesce(processed_at,now()) WHERE id = r.id;
    UPDATE public.payments SET anticipation_status = 'processing', updated_at = now() WHERE id = p.id;
  END IF;
  UPDATE public.anticipation_requests SET provider_status = _provider_status, last_provider_event_id = _event_id, updated_at = now() WHERE id = r.id;
END $$;

REVOKE ALL ON FUNCTION public.release_coproduction_splits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_coproduction_splits(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.apply_anticipation_event(uuid, public.anticipation_status, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_anticipation_event(uuid, public.anticipation_status, text, text) TO service_role;