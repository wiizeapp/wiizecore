CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
    OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified');
$$;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "mfa_required" ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY "mfa_required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_satisfied()) WITH CHECK (public.mfa_satisfied())', t.tablename);
  END LOOP;
END $$;