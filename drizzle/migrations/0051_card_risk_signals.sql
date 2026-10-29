CREATE TABLE public.card_risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ip_mark text,
  card_mark text,
  link_mark text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('attempt','declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.card_risk_signals TO service_role;
ALTER TABLE public.card_risk_signals ENABLE ROW LEVEL SECURITY;
CREATE INDEX card_risk_ip_idx ON public.card_risk_signals (ip_mark, created_at);
CREATE INDEX card_risk_card_idx ON public.card_risk_signals (card_mark, created_at);

CREATE OR REPLACE FUNCTION public.card_risk_record(_tenant uuid, _ip_mark text, _card_mark text, _link_mark text, _outcome text)
RETURNS TABLE(cards_per_ip int, links_per_ip int, declines_per_ip int, declines_per_card int, ips_per_card int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - interval '1 hour';
BEGIN
  -- Trava por origem/cartão: chamadas simultâneas são contadas em sequência.
  IF _ip_mark IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('cr_ip:' || _ip_mark)); END IF;
  IF _card_mark IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('cr_card:' || _card_mark)); END IF;
  INSERT INTO card_risk_signals(tenant_id, ip_mark, card_mark, link_mark, outcome) VALUES (_tenant, _ip_mark, _card_mark, _link_mark, _outcome);
  DELETE FROM card_risk_signals WHERE created_at < now() - interval '7 days' AND random() < 0.01;
  RETURN QUERY SELECT
    (SELECT count(DISTINCT card_mark)::int FROM card_risk_signals WHERE _ip_mark IS NOT NULL AND ip_mark = _ip_mark AND created_at >= since),
    (SELECT count(DISTINCT link_mark)::int FROM card_risk_signals WHERE _ip_mark IS NOT NULL AND ip_mark = _ip_mark AND created_at >= since),
    (SELECT count(*)::int FROM card_risk_signals WHERE _ip_mark IS NOT NULL AND ip_mark = _ip_mark AND outcome='declined' AND created_at >= since),
    (SELECT count(*)::int FROM card_risk_signals WHERE _card_mark IS NOT NULL AND card_mark = _card_mark AND outcome='declined' AND created_at >= since),
    (SELECT count(DISTINCT ip_mark)::int FROM card_risk_signals WHERE _card_mark IS NOT NULL AND card_mark = _card_mark AND created_at >= since);
END $$;
REVOKE ALL ON FUNCTION public.card_risk_record(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.card_risk_record(uuid,text,text,text,text) TO service_role;