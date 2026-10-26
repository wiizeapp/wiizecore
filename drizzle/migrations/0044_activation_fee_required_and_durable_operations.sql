CREATE TABLE public.activation_fee_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),owner_id uuid NOT NULL,amount_cents integer NOT NULL DEFAULT 1990 CHECK(amount_cents=1990),currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),environment text NOT NULL CHECK(environment IN ('sandbox','production')),origin_wallet_id text NOT NULL,reference text NOT NULL UNIQUE,status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','creating','pending','confirmed','expired','uncertain','refunded','refund_pending','divergent')),provider_payment_id text UNIQUE,provider_customer_id text,confirmed_at timestamptz,confirmed_amount_cents integer,terms_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.activation_fee_payments TO service_role; REVOKE ALL ON public.activation_fee_payments FROM anon,authenticated; ALTER TABLE public.activation_fee_payments ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.activation_fee_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),external_id text NOT NULL UNIQUE,payment_id uuid REFERENCES public.activation_fee_payments(id),event_type text NOT NULL,state text NOT NULL DEFAULT 'received',error_code text,created_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz);
GRANT ALL ON public.activation_fee_events TO service_role; REVOKE ALL ON public.activation_fee_events FROM anon,authenticated; ALTER TABLE public.activation_fee_events ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.activation_provider_operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),kind text NOT NULL CHECK(kind IN ('fee_customer','fee_payment','subaccount')),environment text NOT NULL CHECK(environment IN ('sandbox','production')),reference text NOT NULL UNIQUE,state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','creating','uncertain','created')),result_enc text,provider_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,kind,environment));
GRANT ALL ON public.activation_provider_operations TO service_role; REVOKE ALL ON public.activation_provider_operations FROM anon,authenticated; ALTER TABLE public.activation_provider_operations ENABLE ROW LEVEL SECURITY;
CREATE INDEX activation_fee_reconcile_idx ON public.activation_fee_payments(status,updated_at); CREATE INDEX activation_operations_reconcile_idx ON public.activation_provider_operations(state,updated_at);
CREATE FUNCTION public.activation_fee_paid(_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.activation_fee_payments WHERE tenant_id=_tenant AND status='confirmed' AND confirmed_amount_cents=1990 AND confirmed_at IS NOT NULL); $$;
REVOKE ALL ON FUNCTION public.activation_fee_paid(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.activation_fee_paid(uuid) TO authenticated,service_role;
CREATE FUNCTION public.activation_require_fee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t uuid; BEGIN
 t:=NEW.tenant_id;
 IF NOT public.activation_fee_paid(t) THEN RAISE EXCEPTION 'activation_fee_required'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.activation_require_fee() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER activation_requires_fee BEFORE INSERT OR UPDATE ON public.payment_activations FOR EACH ROW EXECUTE FUNCTION public.activation_require_fee();
CREATE TRIGGER activation_documents_require_fee BEFORE INSERT OR UPDATE ON public.activation_documents FOR EACH ROW EXECUTE FUNCTION public.activation_require_fee();
CREATE TRIGGER activation_handoffs_require_fee BEFORE INSERT OR UPDATE ON public.activation_mobile_handoffs FOR EACH ROW EXECUTE FUNCTION public.activation_require_fee();
CREATE TRIGGER activation_connections_require_fee BEFORE INSERT OR UPDATE ON public.provider_connections FOR EACH ROW EXECUTE FUNCTION public.activation_require_fee();
CREATE POLICY kyc_paid_access ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(bucket_id<>'kyc-documents' OR EXISTS(SELECT 1 FROM public.activation_fee_payments f WHERE f.tenant_id::text=(storage.foldername(name))[1] AND public.activation_fee_paid(f.tenant_id) AND public.is_tenant_member(f.tenant_id))) WITH CHECK(bucket_id<>'kyc-documents');
CREATE FUNCTION public.activation_claim_operation(_tenant uuid,_kind text,_environment text,_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.activation_provider_operations%ROWTYPE; BEGIN
 IF _kind='subaccount' AND NOT public.activation_fee_paid(_tenant) THEN RAISE EXCEPTION 'activation_fee_required'; END IF;
 INSERT INTO public.activation_provider_operations(tenant_id,kind,environment,reference) VALUES(_tenant,_kind,_environment,_reference) ON CONFLICT(tenant_id,kind,environment) DO NOTHING;
 SELECT * INTO r FROM public.activation_provider_operations WHERE tenant_id=_tenant AND kind=_kind AND environment=_environment FOR UPDATE;
 IF r.state='ready' THEN UPDATE public.activation_provider_operations SET state='creating',updated_at=now() WHERE id=r.id; RETURN jsonb_build_object('claimed',true,'id',r.id,'state','creating'); END IF;
 RETURN jsonb_build_object('claimed',false,'id',r.id,'state',r.state,'provider_id',r.provider_id,'result_enc',r.result_enc);
END $$;
REVOKE ALL ON FUNCTION public.activation_claim_operation(uuid,text,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.activation_claim_operation(uuid,text,text,text) TO service_role;
CREATE FUNCTION public.activation_confirm_fee(_id uuid,_provider text,_cents integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.activation_fee_payments%ROWTYPE; BEGIN
 SELECT * INTO r FROM public.activation_fee_payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR r.provider_payment_id IS DISTINCT FROM _provider OR _cents<>1990 OR r.amount_cents<>1990 OR r.currency<>'BRL' THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
 IF r.status='confirmed' THEN RETURN false; END IF;
 IF r.status IN ('refunded','refund_pending') THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 UPDATE public.activation_fee_payments SET status='confirmed',confirmed_amount_cents=_cents,confirmed_at=now(),updated_at=now() WHERE id=_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.activation_confirm_fee(uuid,text,integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.activation_confirm_fee(uuid,text,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.can_receive_payments(_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.activation_fee_paid(_tenant_id) AND EXISTS(SELECT 1 FROM public.payment_activations a JOIN public.provider_connections c ON c.tenant_id=a.tenant_id JOIN public.activation_fee_payments f ON f.tenant_id=a.tenant_id WHERE a.tenant_id=_tenant_id AND a.status='approved' AND c.provider='asaas' AND c.environment='production' AND f.environment='production' AND c.status='connected' AND c.general_status='APPROVED' AND c.documentation_status='APPROVED' AND c.commercial_info_status='APPROVED' AND c.bank_account_info_status='APPROVED'); $$;
COMMENT ON TABLE public.activation_fee_payments IS 'Mandatory one-time activation fee. Legacy drafts are preserved without implicit payment exemption. No automatic recurring charge.';