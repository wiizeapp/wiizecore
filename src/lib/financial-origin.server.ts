import { assertBrasilScope } from "./financial-scope";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Never substitute a payment's original account with the latest connected account. */
export async function getPaymentProvider(admin: Admin, tenantId: string, paymentId: string) {
  const { data: p, error } = await admin.from("payments")
    .select("id, provider_connection_id, operation, currency")
    .eq("tenant_id", tenantId).eq("id", paymentId).maybeSingle();
  if (error || !p) throw new Error("Cobrança não encontrada.");
  assertBrasilScope(p);
  const { getTenantProvider } = await import("./billing.server");
  if (p.provider_connection_id) return getTenantProvider(admin, tenantId, p.provider_connection_id);
  const { data: connections, error: connectionError } = await admin.from("provider_connections")
    .select("id").eq("tenant_id", tenantId).eq("provider", "asaas");
  if (connectionError || connections?.length !== 1) {
    throw new Error("A origem desta cobrança precisa ser conferida antes de continuar.");
  }
  const only = connections[0];
  if (!only) throw new Error("Conta de pagamentos indisponível.");
  const { data: bound, error: bindError } = await admin.from("payments")
    .update({ provider_connection_id: only.id }).eq("id", p.id).eq("tenant_id", tenantId)
    .is("provider_connection_id", null).select("provider_connection_id").maybeSingle();
  if (bindError) throw new Error("Não foi possível conferir a origem desta cobrança.");
  if (!bound) return getPaymentProvider(admin, tenantId, paymentId);
  return getTenantProvider(admin, tenantId, only.id);
}