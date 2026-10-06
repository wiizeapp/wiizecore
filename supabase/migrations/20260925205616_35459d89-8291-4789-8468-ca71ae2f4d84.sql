REVOKE EXECUTE ON FUNCTION public.can_receive_payments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_receive_payments(uuid) TO service_role;