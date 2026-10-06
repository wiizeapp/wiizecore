CREATE TABLE public.activation_mobile_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  session_token_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  session_expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 10),
  created_ip text,
  verified_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.activation_mobile_handoffs TO service_role;
ALTER TABLE public.activation_mobile_handoffs ENABLE ROW LEVEL SECURITY;
CREATE INDEX activation_mobile_handoffs_tenant_active_idx ON public.activation_mobile_handoffs (tenant_id, expires_at DESC) WHERE revoked_at IS NULL;
COMMENT ON TABLE public.activation_mobile_handoffs IS 'Acessos temporários e de uso único para continuar somente a ativação em outro dispositivo.';

CREATE OR REPLACE FUNCTION public.submit_activation(_tenant_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO public.notifications (tenant_id, kind, title, body, link) VALUES (_tenant_id, 'activation.submitted', 'Cadastro enviado para análise', 'Avisaremos você assim que a análise for concluída.', '/ativacao');
END; $$;
REVOKE EXECUTE ON FUNCTION public.submit_activation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_activation(uuid, uuid) TO service_role;