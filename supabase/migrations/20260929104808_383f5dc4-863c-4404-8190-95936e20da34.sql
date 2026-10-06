ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS collect_customer_data boolean NOT NULL DEFAULT true;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS data_submitted_at timestamptz;
UPDATE public.customers SET data_status = 'complete'
  WHERE email IS NOT NULL AND phone IS NOT NULL AND zip_code IS NOT NULL AND address IS NOT NULL AND address_number IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL;

CREATE TABLE public.user_security_settings (
  user_id uuid PRIMARY KEY,
  withdrawal_2fa_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_security_settings TO authenticated;
GRANT ALL ON public.user_security_settings TO service_role;
ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê a própria configuração" ON public.user_security_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER user_security_settings_touch BEFORE UPDATE ON public.user_security_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();