ALTER TABLE public.anticipation_requests
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id),
  ADD COLUMN IF NOT EXISTS provider_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_fee_is_estimated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wiize_fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wiize_margin_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_monthly_rate numeric(8,4),
  ADD COLUMN IF NOT EXISTS anticipation_days integer,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_net_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS last_provider_event_id text,
  ADD COLUMN IF NOT EXISTS margin_transfer_id text,
  ADD COLUMN IF NOT EXISTS margin_collected_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS anticipation_requests_active_payment_uidx
  ON public.anticipation_requests (payment_id)
  WHERE status IN ('pending','processing','completed');

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS anticipation_status text;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS payload_hash text;

CREATE OR REPLACE FUNCTION public.apply_anticipation_event(_request_id uuid, _status anticipation_status, _provider_status text, _event_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.anticipation_requests%ROWTYPE; p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.anticipation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'anticipation not found'; END IF;
  IF _event_id IS NOT NULL AND r.last_provider_event_id = _event_id THEN RETURN; END IF;
  UPDATE public.anticipation_requests SET provider_status = _provider_status, last_provider_event_id = _event_id, updated_at = now() WHERE id = r.id;
  IF r.status IN ('completed','failed','cancelled') THEN RETURN; END IF;

  IF _status = 'completed' THEN
    SELECT * INTO p FROM public.payments WHERE id = r.payment_id FOR UPDATE;
    UPDATE public.anticipation_requests SET status = 'completed', settled_at = now() WHERE id = r.id;
    UPDATE public.payments SET anticipation_status = 'completed', updated_at = now() WHERE id = p.id;
    IF p.status = 'paid' AND p.released_at IS NULL THEN
      UPDATE public.payments SET released_at = now() WHERE id = p.id;
      UPDATE public.wallets SET pending_balance = pending_balance - p.net_amount,
        available_balance = available_balance + p.net_amount - r.wiize_fee_amount,
        total_fees = total_fees + r.wiize_fee_amount, updated_at = now() WHERE tenant_id = r.tenant_id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance - r.wiize_fee_amount,
        total_fees = total_fees + r.wiize_fee_amount, updated_at = now() WHERE tenant_id = r.tenant_id;
    END IF;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount) VALUES
      (r.tenant_id, r.payment_id, 'anticipation_fee', 'Taxa de antecipação', -r.wiize_fee_amount);
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (r.tenant_id, 'anticipation.completed', 'Antecipação concluída',
       'R$ ' || to_char(r.net_amount, 'FM999G999G990D00') || ' disponível para saque', '/antecipacao');
  ELSIF _status IN ('failed','cancelled') THEN
    UPDATE public.anticipation_requests SET status = _status WHERE id = r.id;
    UPDATE public.payments SET anticipation_status = _status::text, updated_at = now() WHERE id = r.payment_id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (r.tenant_id, 'anticipation.' || _status::text, 'Antecipação não realizada',
       'O provedor não concluiu a antecipação. Nenhum valor foi cobrado.', '/antecipacao');
  ELSE
    UPDATE public.anticipation_requests SET status = 'processing', processed_at = COALESCE(processed_at, now()) WHERE id = r.id;
    UPDATE public.payments SET anticipation_status = 'processing', updated_at = now() WHERE id = r.payment_id;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.apply_anticipation_event(uuid, anticipation_status, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_anticipation_event(uuid, anticipation_status, text, text) TO service_role;