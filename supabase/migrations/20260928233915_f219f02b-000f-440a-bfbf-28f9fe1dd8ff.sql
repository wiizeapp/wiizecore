CREATE TABLE public.mfa_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mfa_recovery_requests TO authenticated;
GRANT ALL ON public.mfa_recovery_requests TO service_role;
ALTER TABLE public.mfa_recovery_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own recovery requests" ON public.mfa_recovery_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.mfa_recovery_requests (status, created_at);
CREATE TRIGGER touch_mfa_recovery_requests BEFORE UPDATE ON public.mfa_recovery_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();