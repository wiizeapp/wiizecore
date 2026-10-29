ALTER TABLE public.contract_signature_challenges ADD COLUMN source text, ADD COLUMN capability_hash text;
CREATE OR REPLACE FUNCTION public.contract_signature_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.contracts; v public.contract_versions; ch public.contract_signature_challenges; email text; cap boolean;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Signature evidence is immutable'; END IF;
 IF NEW.evidence_version IS DISTINCT FROM 1 OR NEW.identity_enc IS NULL OR NEW.evidence_id IS NULL OR NEW.verified_at IS NULL OR NEW.auth_method NOT IN ('financial_password','email_otp') OR NEW.auth_method IS NULL THEN RAISE EXCEPTION 'Verified signature required'; END IF;
 SELECT * INTO c FROM public.contracts WHERE id=NEW.contract_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF NOT FOUND OR c.status::text IN ('cancelled','expired','signed') THEN RAISE EXCEPTION 'Contract unavailable'; END IF;
 SELECT * INTO v FROM public.contract_versions WHERE id=NEW.contract_version_id AND contract_id=c.id AND tenant_id=c.tenant_id AND version=c.current_version AND content_hash=NEW.content_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'Version mismatch'; END IF;
 IF NEW.signer_role='provider' THEN
  IF NEW.auth_method<>'financial_password' OR NEW.actor_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=c.tenant_id AND user_id=NEW.actor_user_id AND status='active' AND role::text IN ('owner','admin')) THEN RAISE EXCEPTION 'Provider authorization required'; END IF;
 ELSE
  IF NEW.auth_method<>'email_otp' THEN RAISE EXCEPTION 'Email confirmation required'; END IF;
  SELECT * INTO ch FROM public.contract_signature_challenges WHERE id=NEW.evidence_id AND tenant_id=c.tenant_id AND contract_id=c.id AND version_id=v.id AND signer_role=NEW.signer_role AND content_hash=v.content_hash AND consumed_at IS NOT NULL AND sent_at IS NOT NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Confirmation required'; END IF;
  IF NEW.signer_role='customer' THEN SELECT lower(trim(x.email)) INTO email FROM public.customers x WHERE x.id=c.customer_id AND x.tenant_id=c.tenant_id FOR SHARE;
  ELSE SELECT lower(trim(s.email)) INTO email FROM public.contract_signers s WHERE s.tenant_id=c.tenant_id AND s.contract_id=c.id AND 'signer:'||s.id::text=NEW.signer_role AND s.removed_at IS NULL FOR SHARE;
  END IF;
  IF email IS NULL OR ch.recipient<>encode(sha256(convert_to(email,'UTF8')),'hex') OR NEW.signer_email<>email THEN RAISE EXCEPTION 'Recipient changed'; END IF;
  cap:=false;
  IF ch.source='customer' THEN SELECT true INTO cap FROM public.contract_links WHERE tenant_id=c.tenant_id AND contract_id=c.id AND token_hash=ch.capability_hash AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
  ELSIF ch.source='checkout' THEN SELECT true INTO cap FROM public.payment_links WHERE tenant_id=c.tenant_id AND contract_id=c.id AND customer_id=c.customer_id AND token_hash=ch.capability_hash AND revoked_at IS NULL AND charge_group_id IS NOT NULL FOR SHARE;
  ELSIF ch.source='extra' THEN SELECT true INTO cap FROM public.contract_signers WHERE tenant_id=c.tenant_id AND contract_id=c.id AND 'signer:'||id::text=NEW.signer_role AND token_hash=ch.capability_hash AND removed_at IS NULL AND token_expires_at>now() FOR SHARE;
  END IF;
  IF cap IS DISTINCT FROM true THEN RAISE EXCEPTION 'Capability expired'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.contract_signed_version_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE cid uuid; ver integer;
BEGIN
 cid:=coalesce(NEW.contract_id,OLD.contract_id); ver:=coalesce(NEW.version,OLD.version);
 PERFORM 1 FROM public.contracts WHERE id=cid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.contract_signatures s JOIN public.contract_versions v ON v.id=s.contract_version_id WHERE v.contract_id=cid AND v.version=ver) THEN RAISE EXCEPTION 'Signed version is immutable; create a new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER contract_signed_version_guard BEFORE UPDATE OR DELETE ON public.contract_versions FOR EACH ROW EXECUTE FUNCTION public.contract_signed_version_guard();
CREATE TRIGGER contract_signed_fields_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contract_signature_fields FOR EACH ROW EXECUTE FUNCTION public.contract_signed_version_guard();
CREATE FUNCTION public.contract_signer_set_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.contracts;
BEGIN
 SELECT * INTO c FROM public.contracts WHERE id=coalesce(NEW.contract_id,OLD.contract_id) FOR UPDATE;
 IF TG_OP='UPDATE' AND NEW.contract_id=OLD.contract_id AND NEW.tenant_id=OLD.tenant_id AND NEW.name=OLD.name AND NEW.email IS NOT DISTINCT FROM OLD.email AND NEW.document IS NOT DISTINCT FROM OLD.document AND NEW.role=OLD.role AND NEW.removed_at IS NOT DISTINCT FROM OLD.removed_at THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.contract_signatures s JOIN public.contract_versions v ON v.id=s.contract_version_id WHERE v.contract_id=c.id AND v.version=c.current_version) THEN RAISE EXCEPTION 'Signer set frozen; create a new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER contract_signer_set_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contract_signers FOR EACH ROW EXECUTE FUNCTION public.contract_signer_set_guard();