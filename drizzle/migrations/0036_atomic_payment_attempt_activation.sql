CREATE FUNCTION public.activate_payment_attempt(_tenant_id uuid,_payment_id uuid,_attempt_id uuid,_expected_provider_id text,_reactivating boolean,_changes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments%ROWTYPE; a public.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=_payment_id AND tenant_id=_tenant_id FOR UPDATE;
 IF NOT FOUND OR p.provider_payment_id IS DISTINCT FROM _expected_provider_id THEN RAISE EXCEPTION 'payment_attempt_state_changed'; END IF;
 IF (_reactivating AND p.status<>'cancelled') OR (NOT _reactivating AND p.status NOT IN ('created','awaiting_payment','overdue')) THEN RAISE EXCEPTION 'payment_attempt_state_changed'; END IF;
 SELECT * INTO a FROM public.payment_attempts WHERE id=_attempt_id AND payment_id=p.id AND tenant_id=p.tenant_id AND status='pending' FOR UPDATE;
 IF NOT FOUND OR a.provider_payment_id IS NULL OR a.provider_connection_id IS DISTINCT FROM p.provider_connection_id THEN RAISE EXCEPTION 'payment_attempt_invalid'; END IF;
 UPDATE public.payment_attempts SET status='superseded' WHERE payment_id=p.id AND tenant_id=p.tenant_id AND status='active';
 UPDATE public.payment_attempts SET status='active' WHERE id=a.id;
 UPDATE public.payments SET provider_payment_id=a.provider_payment_id,current_attempt_id=a.id,method=a.method,status='awaiting_payment',gross_amount=a.amount,due_on=a.due_on,invoice_url=a.invoice_url,bank_slip_url=a.bank_slip_url,
 platform_fee_amount=(_changes->>'platform_fee_amount')::numeric,provider_fee_covered_amount=(_changes->>'provider_fee_covered_amount')::numeric,fee_configuration_id=(_changes->>'fee_configuration_id')::uuid,fee_fixed_amount=(_changes->>'fee_fixed_amount')::numeric,fee_percentage=(_changes->>'fee_percentage')::numeric,fee_percentage_amount=(_changes->>'fee_percentage_amount')::numeric,fee_calculated_at=(_changes->>'fee_calculated_at')::timestamptz,net_amount=(_changes->>'net_amount')::numeric,
 original_amount=coalesce(p.original_amount,p.gross_amount),original_due_on=coalesce(p.original_due_on,p.due_on),updated_at=now() WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.activate_payment_attempt(uuid,uuid,uuid,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_payment_attempt(uuid,uuid,uuid,text,boolean,jsonb) TO service_role;