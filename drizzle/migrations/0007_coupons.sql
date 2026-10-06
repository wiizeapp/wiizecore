CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  code_normalized text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  max_discount numeric(12,2) CHECK (max_discount IS NULL OR max_discount > 0),
  min_amount numeric(12,2) CHECK (min_amount IS NULL OR min_amount >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_customer_limit integer CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  restore_on_refund boolean NOT NULL DEFAULT false,
  service_ids uuid[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (code_normalized ~ '^[A-Z0-9_-]{3,32}$'),
  UNIQUE (tenant_id, code_normalized)
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own tenant coupons" ON public.coupons FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  customer_id uuid,
  base_amount numeric(12,2) NOT NULL CHECK (base_amount > 0),
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','redeemed','released')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  released_at timestamptz,
  UNIQUE (payment_id, idempotency_key)
);
CREATE UNIQUE INDEX coupon_redemptions_one_active ON public.coupon_redemptions(payment_id) WHERE status IN ('reserved','redeemed');
CREATE INDEX coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id, status);
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own tenant redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.coupon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  payment_id uuid,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupon_events_tenant ON public.coupon_events(tenant_id, created_at DESC);
GRANT SELECT ON public.coupon_events TO authenticated;
GRANT ALL ON public.coupon_events TO service_role;
ALTER TABLE public.coupon_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own tenant coupon events" ON public.coupon_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.payment_attempts DROP CONSTRAINT payment_attempts_reason_check;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_reason_check CHECK (reason = ANY (ARRAY['original','method_change','regularization','retry','coupon']));

-- Reserva atômica: trava o cupom, confere todas as regras e grava a reserva. Retorna código de erro genérico.
CREATE OR REPLACE FUNCTION public.reserve_coupon(_tenant_id uuid, _code text, _payment_id uuid, _customer_id uuid, _base numeric, _key text)
RETURNS TABLE(redemption_id uuid, coupon_id uuid, discount numeric, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.coupons%ROWTYPE; used int; per int; d numeric; existing public.coupon_redemptions%ROWTYPE; svc uuid;
BEGIN
  SELECT * INTO existing FROM public.coupon_redemptions r WHERE r.payment_id = _payment_id AND r.idempotency_key = _key;
  IF FOUND THEN RETURN QUERY SELECT existing.id, existing.coupon_id, existing.discount_amount, NULL::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions r WHERE r.payment_id = _payment_id AND r.status IN ('reserved','redeemed')) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::numeric, 'already_applied'; RETURN; END IF;
  SELECT * INTO c FROM public.coupons WHERE tenant_id = _tenant_id AND code_normalized = upper(btrim(_code)) FOR UPDATE;
  IF NOT FOUND OR c.status <> 'active' OR (c.starts_at IS NOT NULL AND c.starts_at > now()) OR (c.expires_at IS NOT NULL AND c.expires_at <= now())
     OR (c.min_amount IS NOT NULL AND _base < c.min_amount) THEN
    RETURN QUERY SELECT NULL::uuid, c.id, NULL::numeric, 'invalid'; RETURN; END IF;
  IF c.service_ids IS NOT NULL AND array_length(c.service_ids,1) > 0 THEN
    SELECT p.service_id INTO svc FROM public.payments p WHERE p.id = _payment_id;
    IF svc IS NULL OR NOT (svc = ANY(c.service_ids)) THEN RETURN QUERY SELECT NULL::uuid, c.id, NULL::numeric, 'invalid'; RETURN; END IF;
  END IF;
  IF c.usage_limit IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.coupon_redemptions r WHERE r.coupon_id = c.id AND r.status IN ('reserved','redeemed');
    IF used >= c.usage_limit THEN RETURN QUERY SELECT NULL::uuid, c.id, NULL::numeric, 'invalid'; RETURN; END IF;
  END IF;
  IF c.per_customer_limit IS NOT NULL AND _customer_id IS NOT NULL THEN
    SELECT count(*) INTO per FROM public.coupon_redemptions r WHERE r.coupon_id = c.id AND r.customer_id = _customer_id AND r.status IN ('reserved','redeemed');
    IF per >= c.per_customer_limit THEN RETURN QUERY SELECT NULL::uuid, c.id, NULL::numeric, 'invalid'; RETURN; END IF;
  END IF;
  IF c.discount_type = 'percent' THEN d := round(_base * c.discount_value / 100, 2); ELSE d := c.discount_value; END IF;
  IF c.max_discount IS NOT NULL THEN d := least(d, c.max_discount); END IF;
  d := least(d, greatest(_base - 5, 0));
  IF d <= 0 THEN RETURN QUERY SELECT NULL::uuid, c.id, NULL::numeric, 'invalid'; RETURN; END IF;
  INSERT INTO public.coupon_redemptions(tenant_id, coupon_id, payment_id, customer_id, base_amount, discount_amount, idempotency_key)
  VALUES (_tenant_id, c.id, _payment_id, _customer_id, _base, d, _key) RETURNING id INTO existing.id;
  RETURN QUERY SELECT existing.id, c.id, d, NULL::text;
END $$;

CREATE OR REPLACE FUNCTION public.release_coupon(_payment_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.coupon_redemptions SET status = 'released', released_at = now() WHERE payment_id = _payment_id AND status = 'reserved';
$$;

-- Uso definitivo segue o status da cobrança, que só muda por confirmação do provedor.
CREATE OR REPLACE FUNCTION public.sync_coupon_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' THEN
    UPDATE public.coupon_redemptions SET status = 'redeemed', redeemed_at = now() WHERE payment_id = NEW.id AND status = 'reserved';
    INSERT INTO public.coupon_events(tenant_id, coupon_id, payment_id, event)
      SELECT tenant_id, coupon_id, payment_id, 'redeemed' FROM public.coupon_redemptions WHERE payment_id = NEW.id AND status = 'redeemed' AND redeemed_at >= now() - interval '1 second';
  ELSIF NEW.status IN ('cancelled','failed') THEN
    UPDATE public.coupon_redemptions SET status = 'released', released_at = now() WHERE payment_id = NEW.id AND status = 'reserved';
  ELSIF NEW.status = 'refunded' THEN
    UPDATE public.coupon_redemptions r SET status = 'released', released_at = now()
      FROM public.coupons c WHERE r.coupon_id = c.id AND c.restore_on_refund AND r.payment_id = NEW.id AND r.status = 'redeemed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_coupon_sync AFTER UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.sync_coupon_on_payment();

REVOKE ALL ON FUNCTION public.reserve_coupon(uuid,text,uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_coupon(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_coupon_on_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_coupon(uuid,text,uuid,uuid,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_coupon(uuid) TO service_role;

CREATE TRIGGER coupons_touch BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();