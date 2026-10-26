REVOKE ALL ON public.admin_page_sessions,public.admin_unlock_challenges,public.pld_cases,public.pld_case_events,public.pld_rule_versions FROM anon,authenticated;
GRANT ALL ON public.admin_page_sessions,public.admin_unlock_challenges,public.pld_cases,public.pld_case_events,public.pld_rule_versions TO service_role;
CREATE FUNCTION public.pld_create_rule(_id uuid,_code text,_version integer,_enabled boolean,_enc text,_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(_actor,'platform_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('pld_rule:'||_code));
 IF _version <> (SELECT coalesce(max(version),0)+1 FROM public.pld_rule_versions WHERE rule_code=_code) THEN RAISE EXCEPTION 'concurrent_change'; END IF;
 INSERT INTO public.pld_rule_versions(id,rule_code,version,enabled,parameters_enc,created_by) VALUES(_id,_code,_version,_enabled,_enc,_actor);
 INSERT INTO public.audit_logs(user_id,action,resource,resource_id,result,metadata) VALUES(_actor,'pld.rule_version_created','pld_rule',_id::text,'success',jsonb_build_object('version',_version,'enabled',_enabled));
END $$;
REVOKE ALL ON FUNCTION public.pld_create_rule(uuid,text,integer,boolean,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pld_create_rule(uuid,text,integer,boolean,text,uuid) TO service_role;
CREATE FUNCTION public.pld_create_alert(_id uuid,_tenant uuid,_rule uuid,_source text,_enc text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE inserted_id uuid; BEGIN
 INSERT INTO public.pld_cases(id,tenant_id,rule_version_id,source_key,content_enc) VALUES(_id,_tenant,_rule,_source,_enc) ON CONFLICT(source_key) DO NOTHING RETURNING id INTO inserted_id;
 IF inserted_id IS NULL THEN RETURN false; END IF;
 INSERT INTO public.audit_logs(tenant_id,action,resource,resource_id,result,metadata) VALUES(_tenant,'pld.alert_created','pld_case',_id::text,'success','{}'::jsonb);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.pld_create_alert(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pld_create_alert(uuid,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pld_case_event_immutable() FROM PUBLIC,anon,authenticated;