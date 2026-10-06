ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_reserved_pending numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(14,2) NOT NULL DEFAULT 0;

CREATE TABLE public.refund_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  window_days integer NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 30),
  allow_partial boolean NOT NULL DEFAULT true,
  default_mode text NOT NULL DEFAULT 'net' CHECK (default_mode IN ('net','gross')),
  default_deduction_type text NOT NULL DEFAULT 'none' CHECK (default_deduction_type IN ('none','fixed','percent')),
  default_deduction_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (default_deduction_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.refund_policies TO authenticated;
GRANT ALL ON public.refund_policies TO service_role;
ALTER TABLE public.refund_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp read" ON public.refund_policies FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER refund_policies_touch BEFORE UPDATE ON public.refund_policies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','completed','failed','cancelled')),
  mode text NOT NULL CHECK (mode IN ('net','gross')),
  kind text NOT NULL CHECK (kind IN ('total','partial')),
  original_amount numeric(14,2) NOT NULL,
  eligible_amount numeric(14,2) NOT NULL,
  requested_amount numeric(14,2) NOT NULL,
  deduction_type text NOT NULL DEFAULT 'none' CHECK (deduction_type IN ('none','fixed','percent')),
  deduction_value numeric(14,2) NOT NULL DEFAULT 0,
  deduction_amount numeric(14,2) NOT NULL DEFAULT 0,
  deduction_reason text,
  reason text NOT NULL,
  refund_amount numeric(14,2) NOT NULL CHECK (refund_amount > 0),
  wiize_fee_retained numeric(14,2) NOT NULL DEFAULT 0,
  from_pending numeric(14,2) NOT NULL DEFAULT 0,
  from_available numeric(14,2) NOT NULL DEFAULT 0,
  provider_status text,
  last_provider_event_id text,
  failure_reason text,
  idempotency_key text NOT NULL,
  processed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE UNIQUE INDEX refunds_one_active ON public.refunds (payment_id) WHERE status IN ('requested','processing');
CREATE INDEX refunds_tenant_created ON public.refunds (tenant_id, created_at DESC);
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds read" ON public.refunds FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER refunds_touch BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.request_refund(_tenant_id uuid, _user_id uuid, _payment_id uuid, _mode text, _kind text,
  _requested_amount numeric, _deduction_type text, _deduction_value numeric, _deduction_reason text, _reason text, _idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments%ROWTYPE; w public.wallets%ROWTYPE; pol public.refund_policies%ROWTYPE; existing uuid; rid uuid;
  base numeric(14,2); eligible numeric(14,2); req numeric(14,2); ded numeric(14,2); final numeric(14,2); fp numeric(14,2); fa numeric(14,2);
BEGIN
  SELECT id INTO existing FROM public.refunds WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant_id AND user_id = _user_id AND role IN ('owner','admin','finance')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _mode NOT IN ('net','gross') OR _kind NOT IN ('total','partial') OR _deduction_type NOT IN ('none','fixed','percent') THEN RAISE EXCEPTION 'invalid_input'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO pol FROM public.refund_policies WHERE tenant_id = _tenant_id;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p.status <> 'paid' OR p.provider_payment_id IS NULL THEN RAISE EXCEPTION 'not_paid'; END IF;
  IF p.paid_at < now() - make_interval(days => COALESCE(pol.window_days, 30)) THEN RAISE EXCEPTION 'window_expired'; END IF;
  IF p.anticipation_status IN ('pending','processing','completed') THEN RAISE EXCEPTION 'anticipated'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE payment_id = p.id AND status IN ('requested','processing')) THEN RAISE EXCEPTION 'refund_in_progress'; END IF;
  base := CASE WHEN _mode = 'gross' THEN p.gross_amount ELSE p.net_amount END;
  eligible := base - p.refunded_amount;
  IF eligible <= 0 THEN RAISE EXCEPTION 'nothing_to_refund'; END IF;
  IF _kind = 'total' THEN req := eligible;
  ELSE
    IF COALESCE(pol.allow_partial, true) = false THEN RAISE EXCEPTION 'partial_not_allowed'; END IF;
    req := round(COALESCE(_requested_amount, 0), 2);
    IF req <= 0 OR req > eligible THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  END IF;
  ded := CASE _deduction_type WHEN 'fixed' THEN round(COALESCE(_deduction_value,0), 2)
    WHEN 'percent' THEN round(req * LEAST(GREATEST(COALESCE(_deduction_value,0),0),100) / 100, 2) ELSE 0 END;
  IF ded < 0 OR ded >= req THEN RAISE EXCEPTION 'invalid_deduction'; END IF;
  IF ded > 0 AND COALESCE(trim(_deduction_reason),'') = '' THEN RAISE EXCEPTION 'deduction_reason_required'; END IF;
  final := req - ded;
  -- Reserva: primeiro do valor ainda a liberar deste pagamento, o resto do saldo disponível.
  fp := CASE WHEN p.released_at IS NULL THEN LEAST(final, p.net_amount - p.refund_reserved_pending) ELSE 0 END;
  fp := GREATEST(fp, 0);
  fa := final - fp;
  INSERT INTO public.wallets (tenant_id) VALUES (_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO w FROM public.wallets WHERE tenant_id = _tenant_id FOR UPDATE;
  IF fa > 0 AND w.available_balance < fa THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  INSERT INTO public.refunds (tenant_id, payment_id, requested_by, mode, kind, original_amount, eligible_amount, requested_amount,
    deduction_type, deduction_value, deduction_amount, deduction_reason, reason, refund_amount, wiize_fee_retained, from_pending, from_available, idempotency_key)
  VALUES (_tenant_id, p.id, _user_id, _mode, _kind, p.gross_amount, eligible, req, _deduction_type, COALESCE(_deduction_value,0), ded,
    NULLIF(trim(_deduction_reason),''), trim(_reason), final, CASE WHEN _mode = 'net' THEN p.platform_fee_amount ELSE 0 END, fp, fa, _idempotency_key)
  RETURNING id INTO rid;
  UPDATE public.payments SET refund_reserved_pending = refund_reserved_pending + fp, updated_at = now() WHERE id = p.id;
  UPDATE public.wallets SET pending_balance = pending_balance - fp, available_balance = available_balance - fa,
    blocked_balance = blocked_balance + final, updated_at = now() WHERE tenant_id = _tenant_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, resource, resource_id, result, metadata)
    VALUES (_tenant_id, _user_id, 'refund.request', 'refund', rid::text, 'success',
      jsonb_build_object('payment_id', p.id, 'amount', final, 'deduction', ded, 'mode', _mode));
  RETURN rid;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_refund_event(_refund_id uuid, _status text, _provider_status text, _event_id text, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _event_id IS NOT NULL AND r.last_provider_event_id = _event_id THEN RETURN; END IF;
  UPDATE public.refunds SET provider_status = COALESCE(_provider_status, provider_status), last_provider_event_id = COALESCE(_event_id, last_provider_event_id) WHERE id = r.id;
  IF r.status IN ('completed','failed','cancelled') THEN RETURN; END IF;
  IF _status = 'processing' THEN
    UPDATE public.refunds SET status = 'processing', processed_at = COALESCE(processed_at, now()) WHERE id = r.id;
  ELSIF _status = 'completed' THEN
    UPDATE public.refunds SET status = 'completed', completed_at = now() WHERE id = r.id;
    UPDATE public.payments SET refunded_amount = refunded_amount + r.refund_amount + r.deduction_amount,
      status = CASE WHEN refunded_amount + r.refund_amount + r.deduction_amount >= net_amount AND r.mode = 'net' OR refunded_amount + r.refund_amount + r.deduction_amount >= gross_amount THEN 'refunded'::payment_status ELSE status END,
      updated_at = now() WHERE id = r.payment_id;
    UPDATE public.wallets SET blocked_balance = blocked_balance - r.refund_amount, updated_at = now() WHERE tenant_id = r.tenant_id;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
      VALUES (r.tenant_id, r.payment_id, 'refund', 'Reembolso ao cliente', -r.refund_amount);
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (r.tenant_id, 'refund.completed', 'Reembolso concluído', 'R$ ' || to_char(r.refund_amount, 'FM999G999G990D00') || ' devolvidos ao cliente', '/cobrancas');
  ELSIF _status IN ('failed','cancelled') THEN
    UPDATE public.refunds SET status = _status, failure_reason = _message WHERE id = r.id;
    UPDATE public.payments SET refund_reserved_pending = GREATEST(refund_reserved_pending - r.from_pending, 0), updated_at = now() WHERE id = r.payment_id;
    -- Devolve a reserva: se o pagamento já foi liberado nesse meio tempo, a parte "a liberar" volta ao disponível.
    UPDATE public.wallets SET blocked_balance = blocked_balance - r.refund_amount,
      pending_balance = pending_balance + CASE WHEN (SELECT released_at FROM public.payments WHERE id = r.payment_id) IS NULL THEN r.from_pending ELSE 0 END,
      available_balance = available_balance + r.from_available + CASE WHEN (SELECT released_at FROM public.payments WHERE id = r.payment_id) IS NULL THEN 0 ELSE r.from_pending END,
      updated_at = now() WHERE tenant_id = r.tenant_id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (r.tenant_id, 'refund.failed', 'Reembolso não realizado', COALESCE(_message, 'O processador não concluiu o estorno. Nenhum valor saiu do seu saldo.'), '/cobrancas');
  END IF;
END; $$;

-- Liberação desconta o que já foi reservado para reembolso.
CREATE OR REPLACE FUNCTION public.settle_payment(_payment_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.payments%ROWTYPE; amt numeric(14,2);
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'paid' OR p.released_at IS NOT NULL THEN RETURN false; END IF;
  amt := p.net_amount - p.refund_reserved_pending;
  UPDATE public.payments SET released_at = now(), actual_available_at = now(),
    settlement_status = CASE WHEN anticipation_status = 'completed' THEN 'ANTICIPATED' ELSE 'AVAILABLE' END, updated_at = now() WHERE id = p.id;
  UPDATE public.wallets SET pending_balance = pending_balance - amt,
    available_balance = available_balance + amt, updated_at = now() WHERE tenant_id = p.tenant_id;
  UPDATE public.reconciliation_issues SET resolved_at = now() WHERE payment_id = p.id AND kind = 'settlement_overdue' AND resolved_at IS NULL;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
    (p.tenant_id, 'balance.released', 'Saldo liberado', 'R$ ' || to_char(amt, 'FM999G999G990D00') || ' disponível para saque', '/financeiro');
  RETURN true;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, uuid, uuid, text, text, numeric, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_refund_event(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, uuid, uuid, text, text, numeric, text, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_refund_event(uuid, text, text, text, text) TO service_role;