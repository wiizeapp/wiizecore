REVOKE ALL ON public.checkout_3ds_control FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.checkout_3ds_control TO service_role;