ALTER TABLE public.finance_accounts
ADD COLUMN IF NOT EXISTS institution_code text NOT NULL DEFAULT 'other';

ALTER TABLE public.finance_accounts
ADD CONSTRAINT finance_accounts_institution_code_length
CHECK (char_length(institution_code) BETWEEN 2 AND 40);