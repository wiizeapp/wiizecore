CREATE TABLE public.tracking_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  gtm_id text CHECK (gtm_id IS NULL OR gtm_id ~ '^GTM-[A-Z0-9]{4,12}$'),
  ga4_id text CHECK (ga4_id IS NULL OR ga4_id ~ '^G-[A-Z0-9]{4,15}$'),
  meta_pixel_id text CHECK (meta_pixel_id IS NULL OR meta_pixel_id ~ '^[0-9]{6,20}$'),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tracking_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.tracking_settings TO authenticated;
GRANT ALL ON public.tracking_settings TO service_role;
ALTER TABLE public.tracking_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read tracking ids" ON public.tracking_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert tracking" ON public.tracking_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
CREATE POLICY "Admins update tracking" ON public.tracking_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
CREATE TRIGGER tracking_settings_touch BEFORE UPDATE ON public.tracking_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.tracking_settings (id, enabled) VALUES (true, true);

CREATE TABLE public.cookie_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id text NOT NULL CHECK (length(anon_id) BETWEEN 8 AND 64),
  necessary boolean NOT NULL DEFAULT true CHECK (necessary),
  functional boolean NOT NULL DEFAULT false,
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL CHECK (length(policy_version) <= 16),
  page_url text CHECK (length(page_url) <= 2048),
  user_agent text CHECK (length(user_agent) <= 512),
  language text CHECK (length(language) <= 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cookie_consents_created_idx ON public.cookie_consents (created_at DESC);
GRANT INSERT ON public.cookie_consents TO anon, authenticated;
GRANT SELECT ON public.cookie_consents TO authenticated;
GRANT ALL ON public.cookie_consents TO service_role;
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone records own consent" ON public.cookie_consents FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Admins read consents" ON public.cookie_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));