CREATE TYPE public.activation_status AS ENUM ('not_started','draft','in_progress','submitted','under_review','action_required','approved','rejected','suspended');

CREATE TABLE public.payment_activations (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  status public.activation_status NOT NULL DEFAULT 'not_started',
  person_type text CHECK (person_type IN ('individual','company')),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  consents jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_activations TO authenticated;
GRANT ALL ON public.payment_activations TO service_role;
ALTER TABLE public.payment_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read activation" ON public.payment_activations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER payment_activations_touch BEFORE UPDATE ON public.payment_activations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.activation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activation_documents TO authenticated;
GRANT ALL ON public.activation_documents TO service_role;
ALTER TABLE public.activation_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read docs" ON public.activation_documents FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE public.activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  from_status public.activation_status,
  to_status public.activation_status NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activation_events TO authenticated;
GRANT ALL ON public.activation_events TO service_role;
ALTER TABLE public.activation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read events" ON public.activation_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.can_receive_payments(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.payment_activations WHERE tenant_id = _tenant_id AND status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.submit_activation(_tenant_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.payment_activations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.payment_activations WHERE tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND OR a.status NOT IN ('draft','in_progress','action_required') THEN RAISE EXCEPTION 'not_submittable'; END IF;
  IF a.person_type IS NULL THEN RAISE EXCEPTION 'missing_type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'id_front')
     OR NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'selfie') THEN
    RAISE EXCEPTION 'missing_documents'; END IF;
  IF a.person_type = 'company' AND NOT EXISTS (SELECT 1 FROM public.activation_documents WHERE tenant_id = _tenant_id AND kind = 'company_doc') THEN
    RAISE EXCEPTION 'missing_documents'; END IF;
  IF COALESCE((a.consents->>'terms')::boolean,false) = false OR COALESCE((a.consents->>'truth')::boolean,false) = false THEN
    RAISE EXCEPTION 'missing_consents'; END IF;
  UPDATE public.payment_activations SET status = 'submitted', submitted_by = _user_id, submitted_at = now() WHERE tenant_id = _tenant_id;
  INSERT INTO public.activation_events (tenant_id, actor_id, from_status, to_status) VALUES (_tenant_id, _user_id, a.status, 'submitted');
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES (_tenant_id, 'activation.submitted', 'Cadastro enviado para análise', 'Avisaremos você assim que a análise for concluída.', '/ativacao');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_activation(_tenant_id uuid, _admin_id uuid, _to public.activation_status, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.payment_activations%ROWTYPE; title text;
BEGIN
  IF NOT public.has_role(_admin_id, 'platform_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO a FROM public.payment_activations WHERE tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF a.submitted_by = _admin_id OR EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant_id AND user_id = _admin_id) THEN
    RAISE EXCEPTION 'self_review'; END IF;
  IF _to IN ('action_required','rejected','suspended') AND COALESCE(trim(_message),'') = '' THEN RAISE EXCEPTION 'message_required'; END IF;
  IF NOT (
    (_to = 'under_review' AND a.status = 'submitted') OR
    (_to IN ('approved','action_required','rejected') AND a.status IN ('submitted','under_review')) OR
    (_to = 'suspended' AND a.status = 'approved') OR
    (_to = 'approved' AND a.status = 'suspended')
  ) THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  UPDATE public.payment_activations SET status = _to, reviewed_by = _admin_id, reviewed_at = now(), review_message = _message WHERE tenant_id = _tenant_id;
  INSERT INTO public.activation_events (tenant_id, actor_id, from_status, to_status, message) VALUES (_tenant_id, _admin_id, a.status, _to, _message);
  INSERT INTO public.audit_logs (tenant_id, user_id, action, resource, resource_id, result, metadata)
    VALUES (_tenant_id, _admin_id, 'activation.' || _to::text, 'payment_activation', _tenant_id::text, 'success', jsonb_build_object('from', a.status, 'message', _message));
  title := CASE _to WHEN 'approved' THEN 'Wiize Pay ativado! Você já pode receber pagamentos'
    WHEN 'action_required' THEN 'Precisamos de mais informações' WHEN 'rejected' THEN 'Cadastro não aprovado'
    WHEN 'suspended' THEN 'Recebimentos suspensos' ELSE 'Seu cadastro está em análise' END;
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES (_tenant_id, 'activation.' || _to::text, title, _message, '/ativacao');
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_activation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_review_activation(uuid, uuid, public.activation_status, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_activation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_activation(uuid, uuid, public.activation_status, text) TO service_role;

INSERT INTO public.payment_activations (tenant_id, status)
SELECT t.id, CASE WHEN EXISTS (SELECT 1 FROM public.provider_connections pc WHERE pc.tenant_id = t.id AND pc.wallet_id IS NOT NULL) THEN 'approved'::public.activation_status ELSE 'not_started'::public.activation_status END
FROM public.tenants t ON CONFLICT DO NOTHING;

CREATE POLICY "kyc owners read" ON storage.objects FOR SELECT TO authenticated USING (false);