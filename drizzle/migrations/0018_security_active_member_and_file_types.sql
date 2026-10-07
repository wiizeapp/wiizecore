-- V3: cada pessoa tem no máximo um vínculo ativo com empresa.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_one_active_per_user ON public.tenant_members (user_id) WHERE status = 'active';

-- V1: a pessoa só enxerga o próprio vínculo quando ele está ativo.
DROP POLICY IF EXISTS tenant_members_select_own ON public.tenant_members;
CREATE POLICY tenant_members_select_own ON public.tenant_members FOR SELECT TO authenticated USING (user_id = auth.uid() AND status = 'active');

-- V6: tipos de arquivo permitidos por pasta (envios feitos pelo navegador).
DROP POLICY IF EXISTS storage_allowed_file_types_insert ON storage.objects;
CREATE POLICY storage_allowed_file_types_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated, anon
WITH CHECK (
  CASE bucket_id
    WHEN 'avatars' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
    WHEN 'checkout-logos' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
    WHEN 'kyc-documents' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','pdf')
    WHEN 'contract-files' THEN lower(storage.extension(name)) IN ('pdf','docx','doc','jpg','jpeg','png','webp')
    ELSE true
  END
);
DROP POLICY IF EXISTS storage_allowed_file_types_update ON storage.objects;
CREATE POLICY storage_allowed_file_types_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated, anon
WITH CHECK (
  CASE bucket_id
    WHEN 'avatars' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
    WHEN 'checkout-logos' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp')
    WHEN 'kyc-documents' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','pdf')
    WHEN 'contract-files' THEN lower(storage.extension(name)) IN ('pdf','docx','doc','jpg','jpeg','png','webp')
    ELSE true
  END
);