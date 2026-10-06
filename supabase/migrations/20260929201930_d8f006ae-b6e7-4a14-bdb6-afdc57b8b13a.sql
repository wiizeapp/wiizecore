ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_role_id uuid,
  ADD COLUMN IF NOT EXISTS invited_by uuid,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_status_chk;
ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_status_chk CHECK (status IN ('active','deactivated'));

CREATE TABLE public.tenant_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT ON public.tenant_custom_roles TO authenticated;
GRANT ALL ON public.tenant_custom_roles TO service_role;
ALTER TABLE public.tenant_custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tcr_select ON public.tenant_custom_roles FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER tcr_touch BEFORE UPDATE ON public.tenant_custom_roles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_custom_role_fk FOREIGN KEY (custom_role_id) REFERENCES public.tenant_custom_roles(id) ON DELETE SET NULL;

CREATE TABLE public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role public.tenant_role NOT NULL DEFAULT 'viewer',
  custom_role_id uuid REFERENCES public.tenant_custom_roles(id) ON DELETE SET NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled','expired')),
  invited_by uuid,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tenant_invitations TO service_role;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
CREATE INDEX tenant_invitations_tenant_idx ON public.tenant_invitations(tenant_id, status);
CREATE TRIGGER ti_touch BEFORE UPDATE ON public.tenant_invitations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  path text NOT NULL,
  active_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_activity TO service_role;
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
CREATE INDEX user_activity_tenant_idx ON public.user_activity(tenant_id, user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant_id uuid, _roles public.tenant_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND role = ANY(_roles) AND status = 'active');
$$;