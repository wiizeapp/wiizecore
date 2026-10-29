ALTER TABLE public.card_risk_signals ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

CREATE TABLE public.card_risk_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('origin','card')),
  subject_mark text NOT NULL,
  level text NOT NULL CHECK (level IN ('medium','high')),
  reasons text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','false_positive','closed')),
  blocked_until timestamptz,
  attempts int NOT NULL DEFAULT 1,
  last_payment_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
GRANT ALL ON public.card_risk_cases TO service_role;
ALTER TABLE public.card_risk_cases ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX card_risk_cases_open_uq ON public.card_risk_cases (subject_kind, subject_mark) WHERE status = 'open';
CREATE INDEX card_risk_cases_list_idx ON public.card_risk_cases (status, last_seen_at DESC);

CREATE TABLE public.card_risk_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.card_risk_cases(id),
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('confirm','false_positive','unblock','close')),
  justification text NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.card_risk_decisions TO service_role;
ALTER TABLE public.card_risk_decisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.card_risk_decisions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Histórico de decisões não pode ser alterado.'; END $$;
CREATE TRIGGER card_risk_decisions_no_change BEFORE UPDATE OR DELETE ON public.card_risk_decisions
FOR EACH ROW EXECUTE FUNCTION public.card_risk_decisions_immutable();

CREATE OR REPLACE FUNCTION public.card_risk_record(_tenant uuid, _ip_mark text, _card_mark text, _link_mark text, _outcome text)
RETURNS TABLE(cards_per_ip int, links_per_ip int, declines_per_ip int, declines_per_card int, ips_per_card int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - interval '1 hour';
BEGIN
  IF _ip_mark IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('cr_ip:' || _ip_mark)); END IF;
  IF _card_mark IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('cr_card:' || _card_mark)); END IF;
  INSERT INTO card_risk_signals(tenant_id, ip_mark, card_mark, link_mark, outcome) VALUES (_tenant, _ip_mark, _card_mark, _link_mark, _outcome);
  DELETE FROM card_risk_signals WHERE created_at < now() - interval '7 days' AND random() < 0.01;
  RETURN QUERY SELECT
    (SELECT count(DISTINCT card_mark)::int FROM card_risk_signals WHERE _ip_mark IS NOT NULL AND ip_mark = _ip_mark AND cleared_at IS NULL AND created_at >= since),
    (SELECT count(DISTINCT link_mark)::int FROM card_risk_signals WHERE _ip_mark IS NOT NULL AND ip_mark = _ip_mark AND cleared_at IS NULL AND created_at >= since),
    (SELECT count(*)::int FROM card_risk_signals WHERE _ip_mark IS NOT NULL AND ip_mark = _ip_mark AND outcome='declined' AND cleared_at IS NULL AND created_at >= since),
    (SELECT count(*)::int FROM card_risk_signals WHERE _card_mark IS NOT NULL AND card_mark = _card_mark AND outcome='declined' AND cleared_at IS NULL AND created_at >= since),
    (SELECT count(DISTINCT ip_mark)::int FROM card_risk_signals WHERE _card_mark IS NOT NULL AND card_mark = _card_mark AND cleared_at IS NULL AND created_at >= since);
END $$;

CREATE OR REPLACE FUNCTION public.card_risk_open_case(_tenant uuid, _kind text, _mark text, _level text, _reasons text[], _blocked_until timestamptz, _payment uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO card_risk_cases(tenant_id, subject_kind, subject_mark, level, reasons, blocked_until, last_payment_id)
  VALUES (_tenant, _kind, _mark, _level, _reasons, _blocked_until, _payment)
  ON CONFLICT (subject_kind, subject_mark) WHERE status = 'open' DO UPDATE SET
    attempts = card_risk_cases.attempts + 1,
    last_seen_at = now(),
    tenant_id = EXCLUDED.tenant_id,
    last_payment_id = EXCLUDED.last_payment_id,
    level = CASE WHEN EXCLUDED.level = 'high' THEN 'high' ELSE card_risk_cases.level END,
    reasons = ARRAY(SELECT DISTINCT unnest(card_risk_cases.reasons || EXCLUDED.reasons)),
    blocked_until = GREATEST(card_risk_cases.blocked_until, EXCLUDED.blocked_until)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.card_risk_decide(_case uuid, _actor uuid, _action text, _justification text, _expected_version int)
RETURNS TABLE(status text, version int) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c card_risk_cases%ROWTYPE; new_status text;
BEGIN
  SELECT * INTO c FROM card_risk_cases WHERE id = _case FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
  IF c.version <> _expected_version THEN RAISE EXCEPTION 'stale_version'; END IF;
  IF c.status IN ('false_positive','closed') THEN RAISE EXCEPTION 'case_finalized'; END IF;
  new_status := CASE _action WHEN 'confirm' THEN 'confirmed' WHEN 'false_positive' THEN 'false_positive' WHEN 'close' THEN 'closed' ELSE c.status END;
  IF _action IN ('unblock','false_positive') THEN
    UPDATE card_risk_signals SET cleared_at = now()
     WHERE cleared_at IS NULL AND created_at >= now() - interval '1 hour'
       AND ((c.subject_kind = 'origin' AND ip_mark = c.subject_mark) OR (c.subject_kind = 'card' AND card_mark = c.subject_mark));
  END IF;
  UPDATE card_risk_cases SET status = new_status, version = c.version + 1,
    blocked_until = CASE WHEN _action IN ('unblock','false_positive') THEN NULL ELSE c.blocked_until END
   WHERE id = _case;
  INSERT INTO card_risk_decisions(case_id, actor_id, action, justification) VALUES (_case, _actor, _action, _justification);
  RETURN QUERY SELECT new_status, c.version + 1;
END $$;

REVOKE ALL ON FUNCTION public.card_risk_record(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.card_risk_record(uuid,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.card_risk_open_case(uuid,text,text,text,text[],timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.card_risk_open_case(uuid,text,text,text,text[],timestamptz,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.card_risk_decide(uuid,uuid,text,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.card_risk_decide(uuid,uuid,text,text,int) TO service_role;