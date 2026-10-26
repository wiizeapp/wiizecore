CREATE TABLE public.user_operation_preferences (
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  operation text NOT NULL DEFAULT 'brasil' CHECK (operation IN ('brasil','global')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
GRANT SELECT ON public.user_operation_preferences TO authenticated;
GRANT ALL ON public.user_operation_preferences TO service_role;
ALTER TABLE public.user_operation_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_operation_preferences_own_read ON public.user_operation_preferences FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
COMMENT ON TABLE public.user_operation_preferences IS 'Visual operation selector only; never changes financial records. Global stays empty and locked until provider approval.';