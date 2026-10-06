CREATE UNIQUE INDEX IF NOT EXISTS tenants_document_unique ON public.tenants ((regexp_replace(document, '\D', '', 'g'))) WHERE document IS NOT NULL AND regexp_replace(document, '\D', '', 'g') <> '';

-- Informa apenas se o documento já pertence a OUTRA empresa, sem revelar qual.
CREATE OR REPLACE FUNCTION public.document_in_use(_tenant_id uuid, _document text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id <> _tenant_id AND document IS NOT NULL
    AND regexp_replace(document, '\D', '', 'g') = regexp_replace(_document, '\D', '', 'g'));
$$;
REVOKE ALL ON FUNCTION public.document_in_use(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_in_use(uuid, text) TO service_role;