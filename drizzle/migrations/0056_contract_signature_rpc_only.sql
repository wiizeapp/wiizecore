REVOKE INSERT,UPDATE,DELETE ON public.contract_signatures FROM service_role;
GRANT SELECT ON public.contract_signatures TO service_role;
CREATE FUNCTION public.contract_identity_freeze() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Contract tenant is immutable'; END IF;
 IF NEW.customer_id IS DISTINCT FROM OLD.customer_id AND EXISTS(SELECT 1 FROM public.contract_signatures WHERE contract_id=OLD.id) THEN RAISE EXCEPTION 'Signed contract customer is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_identity_freeze BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contract_identity_freeze();
REVOKE ALL ON FUNCTION public.contract_identity_freeze() FROM PUBLIC,anon,authenticated;