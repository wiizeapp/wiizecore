type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
export type CheckoutLink = { tenant_id: string; charge_group_id: string | null; customer_id: string | null; contract_id: string | null };

export async function checkoutReadiness(admin: Admin, link: CheckoutLink, requireContract = true) {
  if (!link.charge_group_id || !link.customer_id) return false;
  const confirmed = await admin.from("checkout_events").select("id")
    .eq("tenant_id", link.tenant_id).eq("charge_group_id", link.charge_group_id)
    .eq("customer_id", link.customer_id).eq("event", "data_confirmed")
    .contains("metadata", { termsAccepted: true }).limit(1).maybeSingle();
  if (confirmed.error || !confirmed.data) return false;
  if (!requireContract || !link.contract_id) return true;
  const contract = await admin.from("contracts").select("id, status, current_version")
    .eq("id", link.contract_id).eq("tenant_id", link.tenant_id).eq("customer_id", link.customer_id).maybeSingle();
  if (contract.error || !contract.data || ["cancelled", "expired"].includes(contract.data.status)) return false;
  const version = await admin.from("contract_versions").select("id, content_hash")
    .eq("contract_id", contract.data.id).eq("version", contract.data.current_version).maybeSingle();
  if (version.error || !version.data) return false;
  const signature = await admin.from("contract_signatures").select("id")
    .eq("tenant_id", link.tenant_id).eq("contract_id", contract.data.id)
    .eq("contract_version_id", version.data.id).eq("content_hash", version.data.content_hash)
    .eq("signer_role", "customer").maybeSingle();
  return !signature.error && Boolean(signature.data);
}

export async function assertCheckoutReady(admin: Admin, link: CheckoutLink, requireContract = true) {
  if (!await checkoutReadiness(admin, link, requireContract)) {
    throw new Error("Confirme seus dados e os termos e assine o contrato vigente, quando houver, antes de continuar.");
  }
}