CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank','cash','wallet','credit_card')),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa read" ON public.finance_accounts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "fa write" ON public.finance_accounts FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]));
CREATE TRIGGER finance_accounts_touch BEFORE UPDATE ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT ALL ON public.finance_categories TO service_role;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc read" ON public.finance_categories FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.is_tenant_member(tenant_id));
CREATE POLICY "fc write" ON public.finance_categories FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]))
  WITH CHECK (tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]));
INSERT INTO public.finance_categories (tenant_id, name, direction) VALUES
 (NULL,'Serviços prestados','in'),(NULL,'Vendas','in'),(NULL,'Rendimentos','in'),(NULL,'Outros','in'),
 (NULL,'Marketing','out'),(NULL,'Software / Infraestrutura','out'),(NULL,'Internet e telefone','out'),(NULL,'Impostos','out'),
 (NULL,'Salários','out'),(NULL,'Aluguel','out'),(NULL,'Fornecedores','out'),(NULL,'Tarifas bancárias','out'),(NULL,'Outros','out');

CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  due_on date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  paid_on date,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending')),
  notes text,
  cost_center text,
  group_id uuid,
  group_index integer,
  group_total integer,
  group_kind text CHECK (group_kind IN ('installment','recurring')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_entries_tenant_due ON public.finance_entries (tenant_id, due_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT ALL ON public.finance_entries TO service_role;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fe read" ON public.finance_entries FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "fe write" ON public.finance_entries FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]));
CREATE TRIGGER finance_entries_touch BEFORE UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();