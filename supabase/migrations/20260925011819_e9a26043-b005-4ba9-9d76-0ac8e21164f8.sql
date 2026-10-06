ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS reviewed_by uuid, ADD COLUMN IF NOT EXISTS reviewed_at timestamptz, ADD COLUMN IF NOT EXISTS transfer_reference text;

CREATE OR REPLACE FUNCTION public.complete_withdrawal(_withdrawal_id uuid, _reviewer uuid, _reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wd public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO wd FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF wd.status NOT IN ('requested','in_analysis','processing') THEN RAISE EXCEPTION 'not_completable'; END IF;
  UPDATE public.withdrawals SET status = 'completed', completed_at = now(), reviewed_by = _reviewer, reviewed_at = now(),
    transfer_reference = _reference, updated_at = now() WHERE id = wd.id;
  UPDATE public.wallets SET blocked_balance = blocked_balance - wd.amount, total_withdrawn = total_withdrawn + wd.net_amount,
    total_fees = total_fees + wd.fee_amount, updated_at = now() WHERE tenant_id = wd.tenant_id;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
    (wd.tenant_id, 'withdrawal.completed', 'Saque aprovado e transferido', 'R$ ' || to_char(wd.net_amount, 'FM999G999G990D00'), '/financeiro');
END; $$;
REVOKE ALL ON FUNCTION public.complete_withdrawal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, uuid, text) TO service_role;