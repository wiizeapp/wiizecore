CREATE OR REPLACE FUNCTION public.submit_activation(_tenant_id uuid, _user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.payment_activations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.payment_activations WHERE tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND OR a.status NOT IN ('draft','in_progress','action_required') THEN RAISE EXCEPTION 'not_submittable'; END IF;
  IF a.person_type IS NULL THEN RAISE EXCEPTION 'missing_type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'id_front')
     OR NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'id_back')
     OR NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'selfie') THEN
    RAISE EXCEPTION 'missing_documents'; END IF;
  IF a.person_type = 'company' AND (
     NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'company_doc')
     OR NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'legal_rep_doc')
  ) THEN RAISE EXCEPTION 'missing_documents'; END IF;
  IF COALESCE((a.consents->>'terms')::boolean,false) = false
     OR COALESCE((a.consents->>'truth')::boolean,false) = false
     OR COALESCE((a.consents->>'privacy')::boolean,false) = false THEN
    RAISE EXCEPTION 'missing_consents'; END IF;
  UPDATE public.payment_activations SET status = 'submitted', submitted_by = _user_id, submitted_at = now() WHERE tenant_id = _tenant_id;
  INSERT INTO public.activation_events (tenant_id, actor_id, from_status, to_status) VALUES (_tenant_id, _user_id, a.status, 'submitted');
  -- O aviso ao cliente é enviado uma única vez pelo servidor (sininho + e-mail).
END; $function$;