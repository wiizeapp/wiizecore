CREATE TABLE public.platform_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.platform_notifications TO authenticated;
GRANT ALL ON public.platform_notifications TO service_role;
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read platform notifications" ON public.platform_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "admins mark platform notifications" ON public.platform_notifications FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending', ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS verification_notes text;
UPDATE public.bank_accounts SET verification_status = 'verified', verified_at = now() WHERE verification_status = 'pending';

CREATE OR REPLACE FUNCTION public.notify_platform_on_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n text;
BEGIN
  SELECT name INTO n FROM public.tenants WHERE id = NEW.tenant_id;
  INSERT INTO public.platform_notifications (kind, title, body, link, tenant_id) VALUES (
    'activation.' || NEW.to_status::text,
    CASE NEW.to_status WHEN 'submitted' THEN 'Novo cadastro para análise'
      WHEN 'approved' THEN 'Cadastro aprovado' WHEN 'rejected' THEN 'Cadastro recusado'
      WHEN 'action_required' THEN 'Correção solicitada' WHEN 'suspended' THEN 'Conta suspensa'
      WHEN 'under_review' THEN 'Cadastro em análise' ELSE 'Ativação atualizada' END,
    COALESCE(n, 'Empresa') || COALESCE(' — ' || NEW.message, ''), '/admin', NEW.tenant_id);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_platform_on_activation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER activation_events_notify AFTER INSERT ON public.activation_events FOR EACH ROW EXECUTE FUNCTION public.notify_platform_on_activation();

ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_notifications;

CREATE OR REPLACE FUNCTION public.request_withdrawal(_tenant_id uuid, _user_id uuid, _bank_account_id uuid, _amount numeric, _idempotency_key text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE w public.wallets%ROWTYPE; existing uuid; minimum numeric; fee numeric; wid uuid;
BEGIN
  SELECT id INTO existing FROM public.withdrawals WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _bank_account_id AND tenant_id = _tenant_id AND verification_status = 'verified') THEN
    RAISE EXCEPTION 'invalid_bank_account'; END IF;
  PERFORM public.release_available_balances(_tenant_id);
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'minimum_withdrawal_amount'), 50) INTO minimum;
  SELECT COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_fee_amount'), 0) INTO fee;
  IF _amount < minimum THEN RAISE EXCEPTION 'below_minimum'; END IF;
  IF _amount <= fee THEN RAISE EXCEPTION 'invalid_amount'; END IF;
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
END; $function$;