DROP POLICY IF EXISTS "platform_settings_read" ON public.platform_settings;
CREATE POLICY "platform_settings_read_public_keys" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key IN ('platform_fee_percentage','platform_fee_percentage_pix','platform_fee_percentage_boleto','platform_fee_percentage_credit_card','withdrawal_hold_days','minimum_withdrawal_amount','withdrawal_fee_amount','pix_daily_limit','monthly_withdrawal_count','invoice_fee_amount'));

DROP POLICY IF EXISTS "kyc owners read" ON storage.objects;