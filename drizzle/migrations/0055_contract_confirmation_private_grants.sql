REVOKE ALL ON public.contract_signature_challenges FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.contract_signature_challenges TO service_role;
REVOKE ALL ON FUNCTION public.contract_signature_immutable() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.contract_signed_version_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.contract_signer_set_guard() FROM PUBLIC,anon,authenticated;