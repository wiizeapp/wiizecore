ALTER TABLE public.contract_signatures ADD COLUMN identity_enc text, ADD COLUMN auth_method text, ADD COLUMN verified_at timestamptz, ADD COLUMN evidence_id uuid, ADD COLUMN evidence_version integer, ADD COLUMN actor_user_id uuid;
CREATE TABLE public.contract_signature_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, contract_id uuid NOT NULL REFERENCES public.contracts(id), version_id uuid NOT NULL REFERENCES public.contract_versions(id), signer_role text NOT NULL, content_hash text NOT NULL, binding_hash text NOT NULL, recipient text NOT NULL, payload_hash text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL, sent_at timestamptz, attempts integer NOT NULL DEFAULT 0, consumed_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contract_signature_challenges TO service_role;
ALTER TABLE public.contract_signature_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX contract_signature_challenges_scope ON public.contract_signature_challenges(tenant_id,contract_id,signer_role,created_at DESC);
REVOKE INSERT, UPDATE, DELETE ON public.contract_signatures FROM anon, authenticated;
CREATE FUNCTION public.contract_signature_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Signature evidence is immutable'; END IF;
 IF NEW.evidence_version IS DISTINCT FROM 1 OR NEW.identity_enc IS NULL OR NEW.evidence_id IS NULL OR NEW.verified_at IS NULL OR NEW.auth_method NOT IN ('financial_password','email_otp') OR NEW.auth_method IS NULL THEN RAISE EXCEPTION 'Verified signature required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_signature_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.contract_signatures FOR EACH ROW EXECUTE FUNCTION public.contract_signature_immutable();
CREATE FUNCTION public.contract_signature_finish(_tenant uuid,_contract uuid,_version uuid,_role text,_hash text,_payload_hash text,_challenge uuid,_code_hash text,_valid boolean,_signature jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contracts; v public.contract_versions; ch public.contract_signature_challenges; sid uuid; method text; done boolean; st text;
BEGIN
 SELECT * INTO c FROM public.contracts WHERE id=_contract AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR c.status::text IN ('cancelled','expired') THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT * INTO v FROM public.contract_versions WHERE id=_version AND contract_id=c.id AND tenant_id=_tenant AND version=c.current_version AND content_hash=_hash FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 IF EXISTS(SELECT 1 FROM public.contract_signatures WHERE contract_version_id=v.id AND signer_role=_role) THEN RETURN jsonb_build_object('ok',false,'reason','already_signed'); END IF;
 method := CASE WHEN _role='provider' THEN 'financial_password' ELSE 'email_otp' END;
 IF _role='customer' AND c.customer_id IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
 IF _role NOT IN ('provider','customer') AND NOT EXISTS(SELECT 1 FROM public.contract_signers WHERE tenant_id=_tenant AND contract_id=c.id AND 'signer:'||id::text=_role AND removed_at IS NULL) THEN RETURN jsonb_build_object('ok',false); END IF;
 IF method='email_otp' THEN
  SELECT * INTO ch FROM public.contract_signature_challenges WHERE id=_challenge AND tenant_id=_tenant AND contract_id=c.id AND version_id=v.id AND signer_role=_role FOR UPDATE;
  IF NOT FOUND OR ch.sent_at IS NULL OR ch.revoked_at IS NOT NULL OR ch.consumed_at IS NOT NULL OR ch.expires_at<=now() OR ch.attempts>=5 OR ch.code_hash<>_code_hash OR ch.content_hash<>_hash THEN RETURN jsonb_build_object('ok',false); END IF;
  UPDATE public.contract_signature_challenges SET attempts=attempts+1 WHERE id=ch.id;
  IF NOT _valid OR ch.payload_hash<>_payload_hash THEN RETURN jsonb_build_object('ok',false); END IF;
  UPDATE public.contract_signature_challenges SET consumed_at=now() WHERE id=ch.id;
 ELSE
  IF NOT _valid OR (_signature->>'actor_user_id') IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
 END IF;
 INSERT INTO public.contract_signatures(tenant_id,contract_id,contract_version_id,signer_role,signer_name,signer_document,signer_email,content_hash,signature_mode,signature_image,initials_image,ip_address,user_agent,identity_enc,auth_method,verified_at,evidence_id,evidence_version,actor_user_id)
 VALUES(_tenant,c.id,v.id,_role,_signature->>'signer_name',_signature->>'signer_document',_signature->>'signer_email',_hash,_signature->>'signature_mode',_signature->>'signature_image',_signature->>'initials_image',_signature->>'ip_address',_signature->>'user_agent',_signature->>'identity_enc',method,now(),coalesce(_challenge,gen_random_uuid()),1,(_signature->>'actor_user_id')::uuid) RETURNING id INTO sid;
 done := EXISTS(SELECT 1 FROM public.contract_signatures WHERE contract_version_id=v.id AND signer_role='provider') AND (c.customer_id IS NULL OR EXISTS(SELECT 1 FROM public.contract_signatures WHERE contract_version_id=v.id AND signer_role='customer')) AND NOT EXISTS(SELECT 1 FROM public.contract_signers s WHERE s.contract_id=c.id AND s.tenant_id=_tenant AND s.removed_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.contract_signatures x WHERE x.contract_version_id=v.id AND x.signer_role='signer:'||s.id::text));
 st := CASE WHEN done THEN 'signed' WHEN NOT EXISTS(SELECT 1 FROM public.contract_signatures WHERE contract_version_id=v.id AND signer_role='provider') THEN 'awaiting_provider' ELSE 'awaiting_customer' END;
 UPDATE public.contracts SET status=st::public.contract_status,signed_at=CASE WHEN done THEN now() ELSE NULL END,updated_at=now() WHERE id=c.id;
 RETURN jsonb_build_object('ok',true,'id',sid,'status',st,'fullySigned',done);
END $$;
REVOKE ALL ON FUNCTION public.contract_signature_finish(uuid,uuid,uuid,text,text,text,uuid,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.contract_signature_finish(uuid,uuid,uuid,text,text,text,uuid,text,boolean,jsonb) TO service_role;
CREATE FUNCTION public.contract_signature_issue(_challenge jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contracts; recent public.contract_signature_challenges; result uuid;
BEGIN
 SELECT * INTO c FROM public.contracts WHERE id=(_challenge->>'contract_id')::uuid AND tenant_id=(_challenge->>'tenant_id')::uuid FOR UPDATE;
 IF NOT FOUND OR c.status::text IN ('signed','cancelled','expired') THEN RAISE EXCEPTION 'Contract unavailable'; END IF;
 SELECT * INTO recent FROM public.contract_signature_challenges WHERE tenant_id=c.tenant_id AND contract_id=c.id AND signer_role=_challenge->>'signer_role' ORDER BY created_at DESC LIMIT 1;
 IF FOUND AND recent.created_at>now()-interval '60 seconds' THEN RAISE EXCEPTION 'Wait before resend'; END IF;
 UPDATE public.contract_signature_challenges SET revoked_at=now() WHERE tenant_id=c.tenant_id AND contract_id=c.id AND signer_role=_challenge->>'signer_role' AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.contract_signature_challenges(tenant_id,contract_id,version_id,signer_role,content_hash,binding_hash,recipient,payload_hash,code_hash,expires_at)
 VALUES(c.tenant_id,c.id,(_challenge->>'version_id')::uuid,_challenge->>'signer_role',_challenge->>'content_hash',_challenge->>'binding_hash',_challenge->>'recipient',_challenge->>'payload_hash',_challenge->>'code_hash',now()+interval '10 minutes') RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.contract_signature_issue(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.contract_signature_issue(jsonb) TO service_role;