WITH ranked_codes AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY (used_at IS NULL) DESC, created_at ASC, id ASC
    ) AS position
  FROM public.mfa_recovery_codes
)
DELETE FROM public.mfa_recovery_codes AS codes
USING ranked_codes
WHERE codes.id = ranked_codes.id
  AND ranked_codes.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_codes_one_per_user_idx
  ON public.mfa_recovery_codes(user_id);