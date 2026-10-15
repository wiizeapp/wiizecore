CREATE TABLE public.feature_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  extra text,
  source_page text,
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'medium',
  assigned_to uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_suggestions_status_chk CHECK (status IN ('new','analysis','planned','in_progress','done','rejected')),
  CONSTRAINT feature_suggestions_priority_chk CHECK (priority IN ('low','medium','high')),
  CONSTRAINT feature_suggestions_category_chk CHECK (category IN ('feature','improvement','usage','bug','help_content','fees','other')),
  CONSTRAINT feature_suggestions_len_chk CHECK (char_length(title) BETWEEN 3 AND 140 AND char_length(description) BETWEEN 10 AND 4000),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX feature_suggestions_created_idx ON public.feature_suggestions (created_at DESC);
GRANT SELECT ON public.feature_suggestions TO authenticated;
GRANT ALL ON public.feature_suggestions TO service_role;
ALTER TABLE public.feature_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own suggestions read" ON public.feature_suggestions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read suggestions" ON public.feature_suggestions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE TRIGGER feature_suggestions_touch BEFORE UPDATE ON public.feature_suggestions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.feature_suggestion_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.feature_suggestions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.feature_suggestion_notes TO service_role;
ALTER TABLE public.feature_suggestion_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read notes" ON public.feature_suggestion_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));
GRANT SELECT ON public.feature_suggestion_notes TO authenticated;

CREATE TABLE public.feature_suggestion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.feature_suggestions(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_suggestion_events TO authenticated;
GRANT ALL ON public.feature_suggestion_events TO service_role;
ALTER TABLE public.feature_suggestion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read events" ON public.feature_suggestion_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.help_article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  article_slug text NOT NULL CHECK (char_length(article_slug) <= 120),
  helpful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_slug)
);
GRANT SELECT ON public.help_article_feedback TO authenticated;
GRANT ALL ON public.help_article_feedback TO service_role;
ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback read" ON public.help_article_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read feedback" ON public.help_article_feedback FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));