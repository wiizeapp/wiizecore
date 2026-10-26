DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payments','payment_attempts','transactions','withdrawals','refunds','subscriptions','services','invoices','wallets','anticipation_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_brasil_brl_only');
    EXECUTE format('COMMENT ON COLUMN public.%I.operation IS %L', t, 'DEPRECATED: unused');
    EXECUTE format('COMMENT ON COLUMN public.%I.currency IS %L', t, 'DEPRECATED: unused');
  END LOOP;
END $$;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_country_code_format;
COMMENT ON COLUMN public.customers.country_code IS 'DEPRECATED: unused';
REVOKE ALL ON public.wallet_balances FROM authenticated;
REVOKE ALL ON public.user_operation_preferences FROM authenticated;
COMMENT ON TABLE public.wallet_balances IS 'DEPRECATED: unused';
COMMENT ON TABLE public.user_operation_preferences IS 'DEPRECATED: unused';