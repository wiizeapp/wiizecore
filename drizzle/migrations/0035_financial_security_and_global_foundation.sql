-- Additive foundation. Existing financial paths remain strictly Brasil/BRL.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payments','payment_attempts','transactions','withdrawals','refunds','subscriptions','services','invoices','wallets','anticipation_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT ''brasil'', ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT ''BRL''', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (operation = ''brasil'' AND currency = ''BRL'')', t, t || '_brasil_brl_only');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['payments','payment_attempts','refunds','withdrawals','subscriptions','anticipation_requests','webhook_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS provider_connection_id uuid REFERENCES public.provider_connections(id)', t);
  END LOOP;
END $$;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
CREATE INDEX webhook_events_connection_event_idx ON public.webhook_events(tenant_id, provider_connection_id, external_event_id);
CREATE UNIQUE INDEX payments_connection_external_idx ON public.payments(tenant_id, provider_connection_id, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX attempts_connection_external_idx ON public.payment_attempts(tenant_id, provider_connection_id, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
COMMENT ON CONSTRAINT webhook_events_provider_external_event_id_key ON public.webhook_events IS 'Legacy constraint retained for deployed compatibility; new external_event_id values are namespaced by authenticated connection.';
-- Backfill origin ONLY where exactly one Asaas connection exists, not the most recent.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payments','withdrawals','subscriptions','anticipation_requests','webhook_events'] LOOP
    EXECUTE format('UPDATE public.%I x SET provider_connection_id = c.id FROM (SELECT tenant_id, (array_agg(id))[1] id FROM public.provider_connections WHERE provider = ''asaas'' GROUP BY tenant_id HAVING count(*) = 1) c WHERE x.tenant_id = c.tenant_id AND x.provider_connection_id IS NULL', t);
  END LOOP;
END $$;
UPDATE public.payment_attempts a SET provider_connection_id = p.provider_connection_id FROM public.payments p WHERE a.payment_id=p.id AND a.tenant_id=p.tenant_id AND a.provider_connection_id IS NULL;
UPDATE public.refunds r SET provider_connection_id = p.provider_connection_id FROM public.payments p WHERE r.payment_id=p.id AND r.tenant_id=p.tenant_id AND r.provider_connection_id IS NULL;

CREATE TABLE public.customer_provider_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id), provider_connection_id uuid NOT NULL REFERENCES public.provider_connections(id),
  provider_customer_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, provider_connection_id), UNIQUE(provider_connection_id, provider_customer_id)
);
GRANT SELECT ON public.customer_provider_links TO authenticated;
GRANT ALL ON public.customer_provider_links TO service_role;
ALTER TABLE public.customer_provider_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_provider_links_member_read ON public.customer_provider_links FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
INSERT INTO public.customer_provider_links(tenant_id,customer_id,provider_connection_id,provider_customer_id)
SELECT cu.tenant_id,cu.id,c.id,cu.provider_customer_id FROM public.customers cu JOIN (SELECT tenant_id,(array_agg(id))[1] id FROM public.provider_connections WHERE provider='asaas' GROUP BY tenant_id HAVING count(*)=1) c ON c.tenant_id=cu.tenant_id WHERE cu.provider_customer_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE public.wallet_balances (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), operation text NOT NULL DEFAULT 'global', currency text NOT NULL,
  pending_balance numeric(20,6) NOT NULL DEFAULT 0, available_balance numeric(20,6) NOT NULL DEFAULT 0,
  blocked_balance numeric(20,6) NOT NULL DEFAULT 0, total_received numeric(20,6) NOT NULL DEFAULT 0,
  total_fees numeric(20,6) NOT NULL DEFAULT 0, total_withdrawn numeric(20,6) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,operation,currency),
  CONSTRAINT wallet_balances_global_only CHECK(operation='global' AND currency ~ '^[A-Z]{3}$'),
  CONSTRAINT wallet_balances_disabled CHECK(pending_balance=0 AND available_balance=0 AND blocked_balance=0 AND total_received=0 AND total_fees=0 AND total_withdrawn=0)
);
GRANT SELECT ON public.wallet_balances TO authenticated;
GRANT ALL ON public.wallet_balances TO service_role;
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_balances_member_read ON public.wallet_balances FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id));
COMMENT ON TABLE public.wallet_balances IS 'Global foundation only; disabled monetary writes. Brasil BRL remains exclusively in wallets. No replicated balances.';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'BR';
ALTER TABLE public.customers ADD CONSTRAINT customers_country_code_format CHECK(country_code ~ '^[A-Z]{2}$');

CREATE FUNCTION public.validate_financial_origin() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.provider_connections%ROWTYPE; p public.payments%ROWTYPE; ids uuid[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.provider_connection_id IS NOT NULL AND NEW.provider_connection_id IS DISTINCT FROM OLD.provider_connection_id THEN RAISE EXCEPTION 'financial_origin_immutable'; END IF;
  IF TG_TABLE_NAME IN ('payment_attempts','refunds','anticipation_requests') THEN
    SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id AND tenant_id=NEW.tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'financial_payment_tenant_mismatch'; END IF;
    IF NEW.provider_connection_id IS NULL THEN NEW.provider_connection_id:=p.provider_connection_id; END IF;
    IF NEW.provider_connection_id IS DISTINCT FROM p.provider_connection_id THEN RAISE EXCEPTION 'financial_payment_connection_mismatch'; END IF;
  END IF;
  IF NEW.provider_connection_id IS NULL AND TG_TABLE_NAME IN ('payments','subscriptions','withdrawals') THEN
    SELECT array_agg(id) INTO ids FROM public.provider_connections WHERE tenant_id=NEW.tenant_id AND provider='asaas';
    IF cardinality(ids)=1 THEN NEW.provider_connection_id:=ids[1]; END IF;
  END IF;
  IF NEW.provider_connection_id IS NOT NULL THEN
    SELECT * INTO c FROM public.provider_connections WHERE id=NEW.provider_connection_id AND tenant_id=NEW.tenant_id;
    IF NOT FOUND OR c.provider<>'asaas' THEN RAISE EXCEPTION 'financial_connection_tenant_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payments','payment_attempts','refunds','withdrawals','subscriptions','anticipation_requests','webhook_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_financial_origin()', t||'_validate_origin',t);
  END LOOP;
END $$;
CREATE FUNCTION public.validate_customer_provider_link() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) OR NOT EXISTS(SELECT 1 FROM public.provider_connections WHERE id=NEW.provider_connection_id AND tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'customer_connection_tenant_mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_provider_link_validate BEFORE INSERT OR UPDATE ON public.customer_provider_links FOR EACH ROW EXECUTE FUNCTION public.validate_customer_provider_link();

-- Serialize company-wide lockout decisions; no lost increments and no unlock by racing success.
CREATE FUNCTION public.record_financial_password_check(_user_id uuid, _expected_hash text, _valid boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid; t public.tenants%ROWTYPE; c public.financial_credentials%ROWTYPE; n integer; until_at timestamptz;
BEGIN
 SELECT tenant_id INTO tid FROM public.tenant_members WHERE user_id=_user_id AND status='active' LIMIT 1;
 IF tid IS NOT NULL THEN SELECT * INTO t FROM public.tenants WHERE id=tid FOR UPDATE; END IF;
 SELECT * INTO c FROM public.financial_credentials WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','missing'); END IF;
 until_at:=greatest(t.financial_locked_until,c.locked_until);
 IF until_at > now() THEN RETURN jsonb_build_object('state','locked','lockedUntil',until_at,'attempts',3); END IF;
 IF c.password_hash IS DISTINCT FROM _expected_hash THEN RETURN jsonb_build_object('state','changed'); END IF;
 IF _valid THEN
   UPDATE public.financial_credentials SET failed_attempts=0,locked_until=NULL,last_used_at=now() WHERE user_id=_user_id;
   IF tid IS NOT NULL THEN UPDATE public.tenants SET financial_failed_attempts=0,financial_locked_until=NULL WHERE id=tid; END IF;
   RETURN jsonb_build_object('state','valid','attempts',0);
 END IF;
 n:=greatest(CASE WHEN t.financial_locked_until IS NOT NULL AND t.financial_locked_until<=now() THEN 0 ELSE coalesce(t.financial_failed_attempts,0) END, CASE WHEN c.locked_until IS NOT NULL AND c.locked_until<=now() THEN 0 ELSE coalesce(c.failed_attempts,0) END)+1;
 until_at:=CASE WHEN n>=3 THEN now()+interval '60 minutes' ELSE NULL END;
 UPDATE public.financial_credentials SET failed_attempts=n,locked_until=until_at WHERE user_id=_user_id;
 IF tid IS NOT NULL THEN UPDATE public.tenants SET financial_failed_attempts=n,financial_locked_until=until_at WHERE id=tid; END IF;
 RETURN jsonb_build_object('state',CASE WHEN n>=3 THEN 'locked' ELSE 'invalid' END,'attempts',n,'lockedUntil',until_at);
END $$;
REVOKE ALL ON FUNCTION public.record_financial_password_check(uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_financial_password_check(uuid,text,boolean) TO service_role;