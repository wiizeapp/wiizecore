-- Sensitive case data is returned only through MFA and permission-checked server functions.
REVOKE SELECT ON public.payment_authentications, public.chargeback_cases, public.chargeback_documents, public.chargeback_events FROM authenticated;
ALTER TABLE public.chargeback_cases ADD COLUMN defense_state text NOT NULL DEFAULT 'idle' CHECK (defense_state IN ('idle','sending','confirmed','uncertain'));
ALTER TABLE public.chargeback_cases ADD COLUMN defense_claim uuid;
ALTER TABLE public.chargeback_cases ADD COLUMN defense_sent_at timestamptz;
ALTER TABLE public.chargeback_cases ADD COLUMN synced_at timestamptz;
CREATE POLICY chargeback_storage_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (bucket_id <> 'chargeback-documents') WITH CHECK (bucket_id <> 'chargeback-documents');
CREATE OR REPLACE FUNCTION public.claim_chargeback_defense(p_tenant uuid, p_case uuid, p_claim uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.chargeback_cases; n integer;
BEGIN
 SELECT * INTO c FROM public.chargeback_cases WHERE id=p_case AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR c.defense_state <> 'idle' OR c.status <> 'REQUESTED' OR c.provider_chargeback_id IS NULL OR c.provider_connection_id IS NULL OR (c.dispute_deadline IS NOT NULL AND c.dispute_deadline < (now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.chargeback_documents WHERE case_id=p_case AND tenant_id=p_tenant;
 IF n < 1 OR n > 11 THEN RETURN false; END IF;
 UPDATE public.chargeback_cases SET defense_state='sending', defense_claim=p_claim WHERE id=p_case AND tenant_id=p_tenant;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_chargeback_defense(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chargeback_defense(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.mutate_chargeback_document(p_tenant uuid,p_case uuid,p_user uuid,p_action text,p_document uuid,p_path text DEFAULT NULL,p_name text DEFAULT NULL,p_mime text DEFAULT NULL,p_size integer DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.chargeback_cases; n integer;
BEGIN
 SELECT * INTO c FROM public.chargeback_cases WHERE id=p_case AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR c.defense_state <> 'idle' OR c.status <> 'REQUESTED' OR (c.dispute_deadline IS NOT NULL AND c.dispute_deadline < (now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RETURN false; END IF;
 IF p_action='add' THEN
 SELECT count(*) INTO n FROM public.chargeback_documents WHERE case_id=p_case AND tenant_id=p_tenant;
 IF n >= 11 OR p_path NOT LIKE p_tenant::text||'/'||p_case::text||'/%' OR p_size IS NULL OR p_size <= 0 OR p_size > 5242880 OR p_mime NOT IN ('application/pdf','image/jpeg','image/png') THEN RETURN false; END IF;
 INSERT INTO public.chargeback_documents(id,tenant_id,case_id,uploaded_by,storage_path,file_name,content_type,size_bytes) VALUES(p_document,p_tenant,p_case,p_user,p_path,p_name,p_mime,p_size);
 ELSIF p_action='remove' THEN
 DELETE FROM public.chargeback_documents WHERE id=p_document AND tenant_id=p_tenant AND case_id=p_case AND status='pending';
 RETURN FOUND;
 ELSE RETURN false;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mutate_chargeback_document(uuid,uuid,uuid,text,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_chargeback_document(uuid,uuid,uuid,text,uuid,text,text,text,integer) TO service_role;