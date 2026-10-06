CREATE OR REPLACE FUNCTION public.request_refund(_tenant_id uuid, _user_id uuid, _payment_id uuid, _mode text, _kind text, _requested_amount numeric, _deduction_type text, _deduction_value numeric, _deduction_reason text, _reason text, _idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Líquido total inclui a parte já repassada aos coprodutores (o reembolso é dividido proporcionalmente).
  base := CASE WHEN _mode = 'gross' THEN p.gross_amount
    ELSE p.net_amount + COALESCE((SELECT sum(amount) FROM public.coproduction_splits WHERE payment_id = p.id), 0) END;
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
END; $function$;