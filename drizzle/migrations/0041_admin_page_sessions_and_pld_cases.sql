CREATE TABLE public.admin_page_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, auth_session_id uuid NOT NULL, proof_hash text NOT NULL UNIQUE, credential_updated_at timestamptz NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(), last_activity_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes', revoked_at timestamptz);
GRANT ALL ON public.admin_page_sessions TO service_role;
ALTER TABLE public.admin_page_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX admin_page_sessions_user ON public.admin_page_sessions(user_id, expires_at);
CREATE TABLE public.admin_unlock_challenges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, auth_session_id uuid NOT NULL, factor_id uuid NOT NULL, provider_challenge_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz);
GRANT ALL ON public.admin_unlock_challenges TO service_role;
ALTER TABLE public.admin_unlock_challenges ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.admin_page_unlocked() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE proof text; sid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.mfa_satisfied() OR NOT public.has_role(auth.uid(),'platform_admin') THEN RETURN false; END IF;
 proof := (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-wiize-admin-proof';
 sid := (auth.jwt()->>'session_id')::uuid;
 IF proof IS NULL OR length(proof)<40 OR length(proof)>200 OR sid IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.admin_page_sessions s JOIN public.financial_credentials c ON c.user_id=s.user_id WHERE s.user_id=auth.uid() AND s.auth_session_id=sid AND s.proof_hash=encode(digest(proof,'sha256'),'hex') AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_activity_at>now()-interval '5 minutes' AND s.credential_updated_at=c.updated_at AND (c.locked_until IS NULL OR c.locked_until<=now()));
EXCEPTION WHEN others THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.admin_page_unlocked() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_page_unlocked() TO authenticated,service_role;
DO $$ DECLARE p record; q text; w text; BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%platform_admin%' LOOP
  q:=replace(p.qual, 'has_role(auth.uid(), ''platform_admin''::app_role)', '(has_role(auth.uid(), ''platform_admin''::app_role) AND public.admin_page_unlocked())');
  w:=replace(p.with_check, 'has_role(auth.uid(), ''platform_admin''::app_role)', '(has_role(auth.uid(), ''platform_admin''::app_role) AND public.admin_page_unlocked())');
  EXECUTE format('ALTER POLICY %I ON public.%I%s%s',p.policyname,p.tablename,CASE WHEN q IS NOT NULL THEN ' USING ('||q||')' ELSE '' END,CASE WHEN w IS NOT NULL THEN ' WITH CHECK ('||w||')' ELSE '' END);
 END LOOP;
END $$;
CREATE TABLE public.pld_rule_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_code text NOT NULL CHECK(rule_code IN ('volume_growth','small_payments','rapid_withdrawal','refund_frequency')), version integer NOT NULL CHECK(version>0), enabled boolean NOT NULL DEFAULT false, parameters_enc text NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(rule_code,version));
GRANT ALL ON public.pld_rule_versions TO service_role;
ALTER TABLE public.pld_rule_versions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.pld_cases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), rule_version_id uuid REFERENCES public.pld_rule_versions(id), source_key text NOT NULL UNIQUE, priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')), status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_review','awaiting_information','escalated','closed')), assigned_to uuid, content_enc text NOT NULL, revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.pld_cases TO service_role;
ALTER TABLE public.pld_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX pld_cases_queue ON public.pld_cases(status,created_at);
CREATE TABLE public.pld_case_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES public.pld_cases(id), actor_id uuid NOT NULL, action text NOT NULL, content_enc text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.pld_case_events TO service_role;
ALTER TABLE public.pld_case_events ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.pld_case_event_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'PLD history is append only'; END $$;
CREATE TRIGGER pld_events_immutable BEFORE UPDATE OR DELETE ON public.pld_case_events FOR EACH ROW EXECUTE FUNCTION public.pld_case_event_immutable();
CREATE TRIGGER pld_events_no_truncate BEFORE TRUNCATE ON public.pld_case_events FOR EACH STATEMENT EXECUTE FUNCTION public.pld_case_event_immutable();
CREATE FUNCTION public.pld_update_case(_id uuid,_revision integer,_actor uuid,_status text,_assigned uuid,_content_enc text,_action text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r integer;
BEGIN
 IF NOT public.has_role(_actor,'platform_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.pld_cases SET status=_status,assigned_to=_assigned,revision=revision+1,updated_at=now() WHERE id=_id AND revision=_revision RETURNING revision INTO r;
 IF r IS NULL THEN RAISE EXCEPTION 'concurrent_change'; END IF;
 INSERT INTO public.pld_case_events(case_id,actor_id,action,content_enc) VALUES(_id,_actor,_action,_content_enc);
 INSERT INTO public.audit_logs(user_id,action,resource,resource_id,result,metadata) VALUES(_actor,'pld.case_updated','pld_case',_id::text,'success',jsonb_build_object('revision',r));
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.pld_update_case(uuid,integer,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pld_update_case(uuid,integer,uuid,text,uuid,text,text) TO service_role;
COMMENT ON TABLE public.pld_cases IS 'Internal review indicators only; never authorizes or changes financial operations. Sensitive content encrypted server-side.';