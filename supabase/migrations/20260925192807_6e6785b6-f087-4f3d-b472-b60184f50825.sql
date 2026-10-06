ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_available_at date,
  ADD COLUMN IF NOT EXISTS estimated_rule text,
  ADD COLUMN IF NOT EXISTS actual_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS anticipated_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'PENDING';

UPDATE public.payments SET
  confirmed_at = COALESCE(confirmed_at, paid_at),
  estimated_available_at = COALESCE(estimated_available_at, available_on),
  actual_available_at = COALESCE(actual_available_at, released_at),
  settlement_status = CASE
    WHEN status = 'refunded' THEN 'REFUNDED'
    WHEN status = 'cancelled' THEN 'CANCELLED'
    WHEN status = 'paid' AND released_at IS NOT NULL THEN 'AVAILABLE'
    WHEN status = 'paid' THEN 'AWAITING_SETTLEMENT'
    ELSE 'PENDING' END;

DROP FUNCTION IF EXISTS public.apply_payment_event(uuid, payment_status, timestamptz, numeric);

-- Confirmação do pagamento: grava a PREVISÃO (calculada no servidor) e soma em "A receber". Não libera saldo.
CREATE OR REPLACE FUNCTION public.apply_payment_event(_payment_id uuid, _status payment_status, _paid_at timestamptz DEFAULT NULL,
  _provider_fee numeric DEFAULT NULL, _estimated_available_at date DEFAULT NULL, _estimated_rule text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.payments%ROWTYPE; pfee numeric(14,2); net numeric(14,2); margin numeric(14,2); paid timestamptz;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF _status = 'paid' THEN
    IF p.status IN ('paid','refunded') THEN RETURN; END IF;
    paid := COALESCE(_paid_at, now());
    pfee := COALESCE(_provider_fee, p.provider_fee_amount, 0);
    net := p.gross_amount - p.platform_fee_amount;
    margin := p.platform_fee_amount - pfee;
    UPDATE public.payments SET status = 'paid', paid_at = paid, confirmed_at = now(), provider_fee_amount = pfee,
      gross_margin_amount = margin, net_amount = net,
      estimated_available_at = _estimated_available_at, estimated_rule = _estimated_rule,
      available_on = _estimated_available_at, settlement_status = 'AWAITING_SETTLEMENT', updated_at = now() WHERE id = p.id;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount, occurred_at) VALUES
      (p.tenant_id, p.id, 'payment', COALESCE(p.description, 'Pagamento recebido'), p.gross_amount, paid),
      (p.tenant_id, p.id, 'platform_fee', 'Taxa WiizePay', -p.platform_fee_amount, paid);
    INSERT INTO public.wallets (tenant_id) VALUES (p.tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
    UPDATE public.wallets SET pending_balance = pending_balance + net, total_received = total_received + p.gross_amount,
      total_fees = total_fees + p.platform_fee_amount, updated_at = now() WHERE tenant_id = p.tenant_id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (p.tenant_id, 'payment.paid', 'Pagamento confirmado',
       COALESCE(p.description, 'Cobrança') || ' — R$ ' || to_char(p.gross_amount, 'FM999G999G990D00'), '/cobrancas');
  ELSIF _status = 'refunded' THEN
    IF p.status = 'refunded' THEN RETURN; END IF;
    IF p.status = 'paid' THEN
      INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount) VALUES (p.tenant_id, p.id, 'refund', 'Estorno', -p.net_amount);
      IF p.released_at IS NOT NULL THEN
        UPDATE public.wallets SET available_balance = available_balance - p.net_amount, updated_at = now() WHERE tenant_id = p.tenant_id;
      ELSE
        UPDATE public.wallets SET pending_balance = pending_balance - p.net_amount, updated_at = now() WHERE tenant_id = p.tenant_id;
      END IF;
    END IF;
    UPDATE public.payments SET status = 'refunded', settlement_status = 'REFUNDED', updated_at = now() WHERE id = p.id;
    INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
      (p.tenant_id, 'payment.refunded', 'Pagamento estornado', COALESCE(p.description, 'Cobrança'), '/cobrancas');
  ELSE
    IF p.status IN ('paid','refunded') THEN RETURN; END IF;
    UPDATE public.payments SET status = _status,
      settlement_status = CASE WHEN _status = 'cancelled' THEN 'CANCELLED' ELSE settlement_status END, updated_at = now() WHERE id = p.id;
    IF _status = 'overdue' AND p.status <> 'overdue' THEN
      INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
        (p.tenant_id, 'payment.overdue', 'Cobrança vencida', COALESCE(p.description, 'Cobrança'), '/cobrancas');
    END IF;
  END IF;
END; $function$;

-- Liquidação real (aviso de dinheiro recebido do provedor): move "A receber" -> "Disponível". Idempotente.
CREATE OR REPLACE FUNCTION public.settle_payment(_payment_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'paid' OR p.released_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.payments SET released_at = now(), actual_available_at = now(),
    settlement_status = CASE WHEN anticipation_status = 'completed' THEN 'ANTICIPATED' ELSE 'AVAILABLE' END, updated_at = now() WHERE id = p.id;
  UPDATE public.wallets SET pending_balance = pending_balance - p.net_amount,
    available_balance = available_balance + p.net_amount, updated_at = now() WHERE tenant_id = p.tenant_id;
  UPDATE public.reconciliation_issues SET resolved_at = now() WHERE payment_id = p.id AND kind = 'settlement_overdue' AND resolved_at IS NULL;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES
    (p.tenant_id, 'balance.released', 'Saldo liberado', 'R$ ' || to_char(p.net_amount, 'FM999G999G990D00') || ' disponível para saque', '/financeiro');
  RETURN true;
END; $function$;

-- Não libera mais por data: só sinaliza previsões vencidas sem liquidação (para a conferência).
CREATE OR REPLACE FUNCTION public.release_available_balances(_tenant_id uuid)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.reconciliation_issues (tenant_id, payment_id, kind, details)
  SELECT tenant_id, id, 'settlement_overdue', jsonb_build_object('estimated_available_at', estimated_available_at)
  FROM public.payments
  WHERE tenant_id = _tenant_id AND status = 'paid' AND released_at IS NULL
    AND estimated_available_at IS NOT NULL AND estimated_available_at < (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ON CONFLICT (payment_id, kind) DO NOTHING;
  RETURN 0;
END; $function$;

-- Antecipação concluída marca anticipated_at / ANTICIPATED.
CREATE OR REPLACE FUNCTION public.mark_payment_anticipated()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.anticipation_status IS DISTINCT FROM OLD.anticipation_status THEN
    IF NEW.anticipation_status = 'completed' THEN
      NEW.anticipated_at := COALESCE(NEW.anticipated_at, now()); NEW.settlement_status := 'ANTICIPATED';
      NEW.actual_available_at := COALESCE(NEW.actual_available_at, now());
    ELSIF NEW.anticipation_status IN ('pending','processing') THEN NEW.settlement_status := 'ANTICIPATION_PENDING';
    ELSIF NEW.anticipation_status IN ('failed','cancelled') AND NEW.released_at IS NULL AND NEW.status = 'paid' THEN NEW.settlement_status := 'AWAITING_SETTLEMENT';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS payments_anticipated ON public.payments;
CREATE TRIGGER payments_anticipated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.mark_payment_anticipated();

REVOKE EXECUTE ON FUNCTION public.apply_payment_event(uuid, payment_status, timestamptz, numeric, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_available_balances(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(uuid, payment_status, timestamptz, numeric, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_payment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_available_balances(uuid) TO service_role;