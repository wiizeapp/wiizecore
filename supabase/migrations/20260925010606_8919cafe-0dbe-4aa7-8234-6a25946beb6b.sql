CREATE TABLE public.contract_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_links_contract_idx ON public.contract_links(contract_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_links TO authenticated;
GRANT ALL ON public.contract_links TO service_role;
ALTER TABLE public.contract_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage contract links" ON public.contract_links FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));
ALTER TABLE public.contract_signatures ADD COLUMN IF NOT EXISTS signer_document text;