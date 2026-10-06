DO $$ DECLARE t text; BEGIN
FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ('payment_fee_settings','anticipation_fee_settings') LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
END LOOP; END $$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_fee_settings, public.anticipation_fee_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.wallets, public.transactions, public.payments, public.withdrawals, public.refunds, public.anticipation_requests, public.anticipation_items, public.user_roles, public.audit_logs, public.webhook_events, public.security_events, public.rate_limits, public.financial_credentials, public.provider_connections, public.google_drive_connections, public.mfa_recovery_codes, public.platform_settings, public.payment_activations, public.invoices FROM authenticated;