CREATE TABLE public.payment_coproductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  charge_group_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','cancelled')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  split_applied_at timestamptz,
  split_error text,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_coproductions_one_open ON public.payment_coproductions(charge_group_id) WHERE status IN ('pending','active','rejected');
CREATE INDEX payment_coproductions_tenant ON public.payment_coproductions(tenant_id, created_at DESC);
GRANT SELECT ON public.payment_coproductions TO authenticated;
GRANT ALL ON public.payment_coproductions TO service_role;
ALTER TABLE public.payment_coproductions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payment_coproduction_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coproduction_id uuid NOT NULL REFERENCES public.payment_coproductions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  participant_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  participant_user_id uuid NOT NULL,
  wallet_id text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  participation_type text NOT NULL CHECK (participation_type IN ('percent','fixed')),
  percentage numeric(9,6) NOT NULL CHECK (percentage > 0 AND percentage < 100),
  fixed_amount numeric(14,2),
  responsibility text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  accepted_at timestamptz,
  accepted_by uuid,
  accepted_snapshot jsonb,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coproduction_id, participant_tenant_id)
);
CREATE INDEX pcp_participant_user ON public.payment_coproduction_participants(participant_user_id);
CREATE INDEX pcp_participant_tenant ON public.payment_coproduction_participants(participant_tenant_id);
GRANT SELECT ON public.payment_coproduction_participants TO authenticated;
GRANT ALL ON public.payment_coproduction_participants TO service_role;
ALTER TABLE public.payment_coproduction_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.coproduction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coproduction_id uuid NOT NULL REFERENCES public.payment_coproductions(id),
  participant_id uuid NOT NULL REFERENCES public.payment_coproduction_participants(id),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  participant_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  gross_amount numeric(14,2) NOT NULL,
  fee_amount numeric(14,2) NOT NULL,
  net_amount numeric(14,2) NOT NULL,
  percentage numeric(9,6) NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','released','refunded')),
  provider_payment_id text,
  provider_event_id text,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, participant_id)
);
CREATE INDEX coproduction_splits_ptenant ON public.coproduction_splits(participant_tenant_id);
GRANT SELECT ON public.coproduction_splits TO authenticated;
GRANT ALL ON public.coproduction_splits TO service_role;
ALTER TABLE public.coproduction_splits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.coproduction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coproduction_id uuid NOT NULL REFERENCES public.payment_coproductions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  participant_id uuid,
  actor_user_id uuid,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coproduction_events TO authenticated;
GRANT ALL ON public.coproduction_events TO service_role;
ALTER TABLE public.coproduction_events ENABLE ROW LEVEL SECURITY;

-- Dono: membros da empresa principal. Coprodutor: apenas a própria participação.
CREATE POLICY "owner members read coproductions" ON public.payment_coproductions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "owner members read participants" ON public.payment_coproduction_participants FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "participant reads own row" ON public.payment_coproduction_participants FOR SELECT TO authenticated USING (public.is_tenant_member(participant_tenant_id));
CREATE POLICY "owner members read splits" ON public.coproduction_splits FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "participant reads own splits" ON public.coproduction_splits FOR SELECT TO authenticated USING (public.is_tenant_member(participant_tenant_id));
CREATE POLICY "owner members read events" ON public.coproduction_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- Registra a divisão real devolvida pelo Asaas para um pagamento confirmado. Idempotente por parcela + participante.
CREATE OR REPLACE FUNCTION public.apply_coproduction_split(_payment_id uuid, _items jsonb, _event_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments%ROWTYPE; it jsonb; part public.payment_coproduction_participants%ROWTYPE; amt numeric(14,2); n integer := 0; sid uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'paid' THEN RETURN 0; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO part FROM public.payment_coproduction_participants WHERE id = (it->>'participant_id')::uuid AND tenant_id = p.tenant_id AND status = 'accepted';
    IF NOT FOUND THEN CONTINUE; END IF;
    amt := round((it->>'amount')::numeric, 2);
    IF amt <= 0 THEN CONTINUE; END IF;
    INSERT INTO public.coproduction_splits (coproduction_id, participant_id, payment_id, tenant_id, participant_tenant_id, gross_amount, fee_amount, net_amount, percentage, amount, provider_payment_id, provider_event_id, status, released_at)
      VALUES (part.coproduction_id, part.id, p.id, p.tenant_id, part.participant_tenant_id, p.gross_amount, p.platform_fee_amount, p.gross_amount - p.platform_fee_amount, part.percentage, amt, p.provider_payment_id, _event_id,
              CASE WHEN p.released_at IS NULL THEN 'received' ELSE 'released' END, CASE WHEN p.released_at IS NULL THEN NULL ELSE now() END)
      ON CONFLICT (payment_id, participant_id) DO NOTHING RETURNING id INTO sid;
    IF sid IS NULL THEN CONTINUE; END IF;
    n := n + 1;
    UPDATE public.payments SET net_amount = net_amount - amt, updated_at = now() WHERE id = p.id;
    IF p.released_at IS NULL THEN
      UPDATE public.wallets SET pending_balance = pending_balance - amt, updated_at = now() WHERE tenant_id = p.tenant_id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance - amt, updated_at = now() WHERE tenant_id = p.tenant_id;
    END IF;
    INSERT INTO public.transactions (tenant_id, payment_id, kind, description, amount) VALUES
      (p.tenant_id, p.id, 'adjustment', 'Coprodução — parte de ' || part.name, -amt);
    INSERT INTO public.wallets (tenant_id) VALUES (part.participant_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
    IF p.released_at IS NULL THEN
      UPDATE public.wallets SET pending_balance = pending_balance + amt, total_received = total_received + amt, updated_at = now() WHERE tenant_id = part.participant_tenant_id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance + amt, total_received = total_received + amt, updated_at = now() WHERE tenant_id = part.participant_tenant_id;
    END IF;
    INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES
      (part.participant_tenant_id, 'payment', 'Coprodução recebida' || COALESCE(' — ' || p.description, '') || CASE WHEN p.installment_count > 1 THEN ' · parcela ' || p.installment_number || '/' || p.installment_count ELSE '' END, amt);
    INSERT INTO public.coproduction_events (coproduction_id, tenant_id, participant_id, event, metadata)
      VALUES (part.coproduction_id, p.tenant_id, part.id, 'split.received', jsonb_build_object('payment_id', p.id, 'amount', amt, 'event', _event_id));
  END LOOP;
  RETURN n;
END $$;

-- Quando o pagamento do principal é liberado, a parte dos coprodutores também é liberada.
CREATE OR REPLACE FUNCTION public.release_coproduction_splits(_payment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; n integer := 0;
BEGIN
  FOR s IN SELECT * FROM public.coproduction_splits WHERE payment_id = _payment_id AND status = 'received' FOR UPDATE LOOP
    UPDATE public.coproduction_splits SET status = 'released', released_at = now() WHERE id = s.id;
    UPDATE public.wallets SET pending_balance = pending_balance - s.amount, available_balance = available_balance + s.amount, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Estorno: o Asaas devolve também a parte de cada coprodutor; a carteira de cada um reflete isso. Nada é apagado.
CREATE OR REPLACE FUNCTION public.refund_coproduction_splits(_payment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; n integer := 0;
BEGIN
  FOR s IN SELECT * FROM public.coproduction_splits WHERE payment_id = _payment_id AND status IN ('received','released') FOR UPDATE LOOP
    IF s.status = 'received' THEN
      UPDATE public.wallets SET pending_balance = pending_balance - s.amount, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance - s.amount, updated_at = now() WHERE tenant_id = s.participant_tenant_id;
    END IF;
    UPDATE public.coproduction_splits SET status = 'refunded', refunded_at = now() WHERE id = s.id;
    INSERT INTO public.transactions (tenant_id, kind, description, amount) VALUES (s.participant_tenant_id, 'refund', 'Estorno de coprodução', -s.amount);
    INSERT INTO public.coproduction_events (coproduction_id, tenant_id, participant_id, event, metadata)
      VALUES (s.coproduction_id, s.tenant_id, s.participant_id, 'split.refunded', jsonb_build_object('payment_id', _payment_id, 'amount', s.amount));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.apply_coproduction_split(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_coproduction_splits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_coproduction_splits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_coproduction_split(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_coproduction_splits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coproduction_splits(uuid) TO service_role;