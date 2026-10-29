type Scope = { tenant_id: string; contract_id: string };
type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** A public capability must reference a contract owned by the capability's tenant. */
export async function publicContractScopeValid(admin: AdminClient, link: Scope): Promise<boolean> {
  if (!link.tenant_id || !link.contract_id) return false;
  const { data, error } = await admin.from("contracts").select("id, tenant_id")
    .eq("id", link.contract_id).eq("tenant_id", link.tenant_id).maybeSingle();
  return !error && data?.id === link.contract_id && data.tenant_id === link.tenant_id;
}