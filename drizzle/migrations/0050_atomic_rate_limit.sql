CREATE OR REPLACE FUNCTION public.consume_rate_limit(_scope text, _identifier text, _max_attempts integer, _window_seconds integer, _block_seconds integer)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rate_limits%ROWTYPE;
  n timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits AS t (scope, identifier, attempts, window_started_at)
  VALUES (_scope, _identifier, 0, n)
  ON CONFLICT (scope, identifier) DO NOTHING;

  SELECT * INTO r FROM public.rate_limits WHERE scope = _scope AND identifier = _identifier FOR UPDATE;

  IF r.blocked_until IS NOT NULL AND r.blocked_until > n THEN
    RETURN QUERY SELECT false, CEIL(EXTRACT(EPOCH FROM (r.blocked_until - n)))::integer;
    RETURN;
  END IF;

  IF n - r.window_started_at > make_interval(secs => _window_seconds) OR r.blocked_until IS NOT NULL THEN
    r.attempts := 0;
    r.window_started_at := n;
  END IF;
  r.attempts := r.attempts + 1;

  IF r.attempts > _max_attempts THEN
    UPDATE public.rate_limits SET attempts = 0, window_started_at = n, blocked_until = n + make_interval(secs => _block_seconds) WHERE id = r.id;
    RETURN QUERY SELECT false, _block_seconds;
  ELSE
    UPDATE public.rate_limits SET attempts = r.attempts, window_started_at = r.window_started_at, blocked_until = NULL WHERE id = r.id;
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer, integer) TO service_role;