-- Reviewable phase-one correction. Apply only through the migration tool after isolated tests.
-- No historical balances are changed by this DDL.
CREATE OR REPLACE FUNCTION public.release_coproduction_splits(_payment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments%ROWTYPE; s public.coproduction_splits%ROWTYPE; rest numeric; n integer:=0;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=_payment_id FOR UPDATE;
 IF NOT FOUND OR p.status<>'paid' OR p.released_at IS NULL THEN RAISE EXCEPTION 'settlement_required'; END IF;
 PERFORM 1 FROM public.wallets WHERE tenant_id IN (SELECT participant_tenant_id FROM public.coproduction_splits WHERE payment_id=p.id) ORDER BY tenant_id FOR UPDATE;
 FOR s IN SELECT * FROM public.coproduction_splits WHERE payment_id=p.id AND status='received' ORDER BY id FOR UPDATE LOOP
  IF s.amount IS NULL OR s.refunded_amount IS NULL OR s.amount<0 OR s.refunded_amount<0 OR s.refunded_amount>s.amount THEN RAISE EXCEPTION 'invalid_split_amount'; END IF;
  rest:=s.amount-s.refunded_amount;
  UPDATE public.wallets SET pending_balance=pending_balance-rest,available_balance=available_balance+rest,updated_at=now() WHERE tenant_id=s.participant_tenant_id AND pending_balance>=rest;
  IF NOT FOUND THEN RAISE EXCEPTION 'split_wallet_unavailable'; END IF;
  UPDATE public.coproduction_splits SET status='released',released_at=now() WHERE id=s.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_coproduction_splits(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_coproduction_splits(uuid) TO service_role;

-- Every legacy and new admission takes the SAME payment lock, not just a status mirror.
CREATE FUNCTION public.guard_receivable_operation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p public.payments%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN RAISE EXCEPTION 'operation_scope_immutable'; END IF;
 SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'operation_scope_invalid'; END IF;
 IF TG_TABLE_NAME='anticipation_requests' AND NEW.status::text IN ('pending','processing','completed') THEN
  IF coalesce(p.refund_reserved_pending,0)<>0 OR EXISTS(SELECT 1 FROM public.refunds WHERE payment_id=p.id AND status IN ('requested','processing')) THEN RAISE EXCEPTION 'refund_requires_reconciliation'; END IF;
 ELSIF TG_TABLE_NAME='refunds' AND NEW.status IN ('requested','processing') THEN
  IF EXISTS(SELECT 1 FROM public.anticipation_requests WHERE payment_id=p.id AND status::text IN ('pending','processing','completed')) THEN RAISE EXCEPTION 'anticipated'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anticipation_operation_guard BEFORE INSERT OR UPDATE ON public.anticipation_requests FOR EACH ROW EXECUTE FUNCTION public.guard_receivable_operation();
CREATE TRIGGER refund_operation_guard BEFORE INSERT OR UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.guard_receivable_operation();
REVOKE ALL ON FUNCTION public.guard_receivable_operation() FROM PUBLIC,anon,authenticated;

-- An ambiguous local error must not release a provider submission's reservation.
CREATE FUNCTION public.guard_unknown_provider_outcome() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.status::text IN ('pending','processing','requested') AND NEW.status::text IN ('failed','cancelled') THEN
  IF NEW.last_provider_event_id IS NULL OR NEW.last_provider_event_id IS NOT DISTINCT FROM OLD.last_provider_event_id THEN RAISE EXCEPTION 'provider_outcome_requires_reconciliation'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anticipation_unknown_outcome_guard BEFORE UPDATE ON public.anticipation_requests FOR EACH ROW EXECUTE FUNCTION public.guard_unknown_provider_outcome();
CREATE TRIGGER refund_unknown_outcome_guard BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.guard_unknown_provider_outcome();
REVOKE ALL ON FUNCTION public.guard_unknown_provider_outcome() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_tenant_id uuid,_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.mfa_satisfied() OR NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.notifications SET read_at=now() WHERE tenant_id=_tenant_id AND read_at IS NULL AND (_ids IS NULL OR id=ANY(_ids));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid,uuid[]) TO authenticated,service_role;