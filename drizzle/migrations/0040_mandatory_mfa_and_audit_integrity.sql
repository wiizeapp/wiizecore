-- 2FA obrigatório para todos os usuários logados + auditoria encadeada e protegida contra alteração.
-- Aditiva: nenhuma linha é apagada; registros antigos ficam sem hash (legado).

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT coalesce(auth.jwt()->>'aal','aal1') = 'aal2';
$$;
REVOKE EXECUTE ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated, service_role;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS risk text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash text;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_category_chk CHECK (category IS NULL OR category IN ('auth','security','financial','tenant','admin','integration','system')),
  ADD CONSTRAINT audit_logs_origin_chk CHECK (origin IS NULL OR origin IN ('ui','backend','webhook','internal')),
  ADD CONSTRAINT audit_logs_risk_chk CHECK (risk IS NULL OR risk IN ('low','medium','high','critical')),
  ADD CONSTRAINT audit_logs_result_chk CHECK (result IN ('success','failure','blocked')),
  ADD CONSTRAINT audit_logs_len_chk CHECK (
    char_length(action) <= 80 AND coalesce(char_length(resource),0) <= 80 AND coalesce(char_length(resource_id),0) <= 120
    AND coalesce(char_length(correlation_id),0) <= 80 AND coalesce(char_length(idempotency_key),0) <= 120
    AND coalesce(char_length(external_event_id),0) <= 120 AND coalesce(char_length(user_agent),0) <= 300
  );

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_category_created_idx ON public.audit_logs (category, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_correlation_idx ON public.audit_logs (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_seq_idx ON public.audit_logs (seq);

-- Digest não inclui tenant_id: a exclusão de uma empresa zera esse campo (ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.audit_row_digest(_prev text, r public.audit_logs)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(_prev,'GENESIS'), r.id::text, to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),
    coalesce(r.user_id::text,''), r.action, coalesce(r.resource,''), coalesce(r.resource_id,''),
    r.result, coalesce(r.category,''), coalesce(r.origin,''), coalesce(r.risk,''), coalesce(r.correlation_id,''),
    coalesce(r.idempotency_key,''), coalesce(r.external_event_id,''), coalesce(r.metadata::text,'{}')
  ), 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.audit_logs_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_logs_chain'));
  NEW.created_at := coalesce(NEW.created_at, now());
  SELECT row_hash INTO _prev FROM public.audit_logs WHERE row_hash IS NOT NULL ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := _prev;
  NEW.row_hash := public.audit_row_digest(_prev, NEW);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_logs_chain ON public.audit_logs;
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_chain();

-- Somente acréscimo. Única exceção: o banco zerar tenant_id quando uma empresa é excluída.
CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS NULL AND OLD.tenant_id IS NOT NULL
     AND (to_jsonb(NEW) - 'tenant_id') = (to_jsonb(OLD) - 'tenant_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.audit_verify_chain(_limit integer DEFAULT 50000)
RETURNS TABLE(checked bigint, legacy bigint, broken_seq bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.audit_logs; _prev text := NULL; _n bigint := 0; _broken bigint := NULL;
BEGIN
  FOR r IN SELECT * FROM public.audit_logs WHERE row_hash IS NOT NULL ORDER BY seq ASC LIMIT greatest(1, least(_limit, 200000)) LOOP
    _n := _n + 1;
    IF r.prev_hash IS DISTINCT FROM _prev OR r.row_hash <> public.audit_row_digest(r.prev_hash, r) THEN
      _broken := r.seq; EXIT;
    END IF;
    _prev := r.row_hash;
  END LOOP;
  RETURN QUERY SELECT _n, (SELECT count(*) FROM public.audit_logs WHERE row_hash IS NULL), _broken;
END $$;
REVOKE EXECUTE ON FUNCTION public.audit_verify_chain(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_verify_chain(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.audit_row_digest(text, public.audit_logs) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_row_digest(text, public.audit_logs) TO service_role;
REVOKE EXECUTE ON FUNCTION public.audit_logs_chain() FROM PUBLIC, anon, authenticated;
