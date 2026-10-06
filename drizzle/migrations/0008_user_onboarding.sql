CREATE TABLE public.user_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  role text,
  business_type text,
  team_size text,
  biggest_challenge text,
  payment_methods text[] NOT NULL DEFAULT '{}',
  monthly_revenue text,
  goal_90d text,
  acquisition_source text,
  skipped boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_onboarding TO authenticated;
GRANT ALL ON public.user_onboarding TO service_role;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own onboarding" ON public.user_onboarding FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER user_onboarding_touch BEFORE UPDATE ON public.user_onboarding FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();