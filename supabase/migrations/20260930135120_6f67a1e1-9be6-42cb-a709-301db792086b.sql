CREATE OR REPLACE FUNCTION public.lock_wiize_customers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wiize_customer_links l WHERE l.customer_id = OLD.id) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Este cliente vem do Wiize. Edite ou exclua pelo Wiize.'; END IF;
  -- Permite apenas preencher o CPF/CNPJ que faltava e os dados de pagamento enviados pelo cliente.
  IF (to_jsonb(NEW) - ARRAY['document','type','updated_at','provider_customer_id','data_status','data_submitted_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['document','type','updated_at','provider_customer_id','data_status','data_submitted_at'])
     OR (OLD.document IS NOT NULL AND NEW.document IS DISTINCT FROM OLD.document) THEN
    RAISE EXCEPTION 'Este cliente vem do Wiize. Edite pelo Wiize.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lock_wiize_customers() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lock_wiize_customers ON public.customers;
CREATE TRIGGER lock_wiize_customers BEFORE UPDATE OR DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.lock_wiize_customers();