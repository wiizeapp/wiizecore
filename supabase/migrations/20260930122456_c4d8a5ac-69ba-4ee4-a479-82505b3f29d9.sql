CREATE TABLE public.contract_signature_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  signer_key text NOT NULL CHECK (signer_key ~ '^(provider|customer|signer:[0-9a-f-]{36})$'),
  page integer NOT NULL CHECK (page >= 1),
  x numeric(6,5) NOT NULL CHECK (x >= 0 AND x <= 1),
  y numeric(6,5) NOT NULL CHECK (y >= 0 AND y <= 1),
  w numeric(6,5) NOT NULL CHECK (w > 0 AND w <= 1),
  h numeric(6,5) NOT NULL CHECK (h > 0 AND h <= 1),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contract_signature_fields(contract_id, version);
GRANT SELECT ON public.contract_signature_fields TO authenticated;
GRANT ALL ON public.contract_signature_fields TO service_role;
ALTER TABLE public.contract_signature_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem campos de assinatura" ON public.contract_signature_fields FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.contract_signers ADD CONSTRAINT contract_signers_email_required CHECK (email IS NOT NULL AND length(trim(email)) > 3) NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_contract_dates() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.starts_on IS NOT NULL AND NEW.ends_on IS NOT NULL AND NEW.ends_on <= NEW.starts_on THEN
    RAISE EXCEPTION 'A data de fim deve ser depois do início.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contracts_validate_dates BEFORE INSERT OR UPDATE OF starts_on, ends_on ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.validate_contract_dates();