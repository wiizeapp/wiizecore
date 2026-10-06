ALTER TABLE public.coproduction_splits ADD COLUMN IF NOT EXISTS refunded_amount numeric(14,2) NOT NULL DEFAULT 0;

-- Sincroniza o total estornado de cada coprodutor com o que o Asaas confirmou (refundedSplits concluídos).
-- Cumulativo: só aplica a diferença, então avisos repetidos nunca estornam duas vezes.
CREATE OR REPLACE FUNCTION public.sync_coproduction_refunds(_payment_id uuid, _items jsonb, _credit_owner boolean)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; s public.coproduction_splits%ROWTYPE; target numeric(14,2); delta numeric(14,2); total numeric(14,2) := 0;
BEGIN
  PERFORM 1 FROM public.payments WHERE id = _payment_id FOR UPDATE;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO s FROM public.coproduction_splits WHERE payment_id = _payment_id AND participant_id = (it->>'participant_id')::uuid FOR UPDATE;
    IF NOT FOUND OR s.status = 'refunded' THEN CONTINUE; END IF;
    target := LEAST(round((it->>'refunded_total')::numeric, 2), s.amount);
    delta := target - s.refunded_amount;
    IF delta <= 0 THEN CONTINUE; END IF;
    UPDATE public.coproduction_splits SET refunded_amount = target,
      status = CASE WHEN target >= amount THEN 'refunded' ELSE status END,
      refunded_at = CASE WHEN target >= amount THEN now() ELSE refunded_at END WHERE id = s.id;
    IF s.status = 'received' THEN
      UPDATE public.wallets SET pending_balance = pending_balance - delta, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance - delta, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
    END IF;
    INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (s.participant_tenant_id, 'refund', 'Reembolso de coprodução (parte proporcional)', -delta);
    INSERT INTO public.coproduction_events (coproduction_id, tenant_id, participant_id, event, metadata)
      VALUES (s.coproduction_id, s.tenant_id, s.participant_id, 'split.refunded_partial', jsonb_build_object('payment_id', _payment_id, 'amount', delta, 'total', target));
    total := total + delta;
  END LOOP;
  IF _credit_owner AND total > 0 THEN
    UPDATE public.wallets SET available_balance = available_balance + total, updated_at = now() WHERE tenant_id = (SELECT tenant_id FROM public.payments WHERE id = _payment_id);
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount)
      VALUES ((SELECT tenant_id FROM public.payments WHERE id = _payment_id), _payment_id, 'adjustment', 'Reembolso — parte paga pelos coprodutores', total);
  END IF;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.sync_coproduction_refunds(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_coproduction_refunds(uuid, jsonb, boolean) TO service_role;

-- Estorno total vindo direto do Asaas: devolve só o que ainda não foi estornado de cada coprodutor.
CREATE OR REPLACE FUNCTION public.refund_coproduction_splits(_payment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; n integer := 0; rest numeric(14,2);
BEGIN
  FOR s IN SELECT * FROM public.coproduction_splits WHERE payment_id = _payment_id AND status IN ('received','released') FOR UPDATE LOOP
    rest := s.amount - s.refunded_amount;
    IF rest > 0 THEN
      IF s.status = 'received' THEN
        UPDATE public.wallets SET pending_balance = pending_balance - rest, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
      ELSE
        UPDATE public.wallets SET available_balance = available_balance - rest, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
      END IF;
      INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (s.participant_tenant_id, 'refund', 'Estorno de coprodução', -rest);
    END IF;
    UPDATE public.coproduction_splits SET status = 'refunded', refunded_amount = amount, refunded_at = now() WHERE id = s.id;
    INSERT INTO public.coproduction_events (coproduction_id, tenant_id, participant_id, event, metadata)
      VALUES (s.coproduction_id, s.tenant_id, s.participant_id, 'split.refunded', jsonb_build_object('payment_id', _payment_id, 'amount', rest));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;