ALTER TABLE public.mfa_recovery_codes
  ADD COLUMN IF NOT EXISTS single_issued_at timestamptz;

COMMENT ON COLUMN public.mfa_recovery_codes.single_issued_at IS
  'Marca a emissão do código reserva único; nulo identifica códigos antigos que ainda podem ser substituídos uma vez.';