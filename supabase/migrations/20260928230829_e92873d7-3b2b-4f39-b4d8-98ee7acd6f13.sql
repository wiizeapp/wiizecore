CREATE TABLE public.contract_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  document text,
  role text NOT NULL DEFAULT 'witness' CHECK (role IN ('witness','signer','approver')),
  token_hash text UNIQUE,
  token_expires_at timestamptz,
  removed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contract_signers TO authenticated;
GRANT ALL ON public.contract_signers TO service_role;
ALTER TABLE public.contract_signers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem signatarios" ON public.contract_signers FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER contract_signers_touch BEFORE UPDATE ON public.contract_signers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX ON public.contract_signers(contract_id);

CREATE TABLE public.contract_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('original','signed')),
  source_format text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version, kind)
);
GRANT SELECT ON public.contract_files TO authenticated;
GRANT ALL ON public.contract_files TO service_role;
ALTER TABLE public.contract_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem arquivos de contrato" ON public.contract_files FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE INDEX ON public.contract_files(sha256);

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS verification_code text UNIQUE;
UPDATE public.contracts SET verification_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)) WHERE verification_code IS NULL;
ALTER TABLE public.contracts ALTER COLUMN verification_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));