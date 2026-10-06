ALTER TABLE public.contract_signature_fields ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signature';
ALTER TABLE public.contract_signature_fields DROP CONSTRAINT IF EXISTS contract_signature_fields_kind_check;
ALTER TABLE public.contract_signature_fields ADD CONSTRAINT contract_signature_fields_kind_check CHECK (kind IN ('signature','initials'));

ALTER TABLE public.contract_signatures ADD COLUMN IF NOT EXISTS signature_mode text;
ALTER TABLE public.contract_signatures ADD COLUMN IF NOT EXISTS signature_image text;
ALTER TABLE public.contract_signatures ADD COLUMN IF NOT EXISTS initials_image text;
ALTER TABLE public.contract_signatures DROP CONSTRAINT IF EXISTS contract_signatures_mode_check;
ALTER TABLE public.contract_signatures ADD CONSTRAINT contract_signatures_mode_check CHECK (signature_mode IS NULL OR signature_mode IN ('typed','drawn'));

ALTER TABLE public.contract_files ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'storage';
ALTER TABLE public.contract_files ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE public.contract_files DROP CONSTRAINT IF EXISTS contract_files_backend_check;
ALTER TABLE public.contract_files ADD CONSTRAINT contract_files_backend_check CHECK (storage_backend IN ('storage','drive'));

ALTER TABLE public.google_drive_connections ADD COLUMN IF NOT EXISTS connected_by uuid;
CREATE UNIQUE INDEX IF NOT EXISTS google_drive_connections_tenant_uq ON public.google_drive_connections(tenant_id);
GRANT ALL ON public.google_drive_connections TO service_role;