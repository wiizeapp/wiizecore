DROP POLICY IF EXISTS "Members manage contract links" ON public.contract_links;
CREATE POLICY "Members view contract links" ON public.contract_links FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Editors manage contract links" ON public.contract_links FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','finance']::tenant_role[]));