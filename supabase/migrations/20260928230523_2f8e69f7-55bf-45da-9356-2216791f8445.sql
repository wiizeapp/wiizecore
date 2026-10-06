ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_theme_check CHECK (theme IN ('system','light','dark'));