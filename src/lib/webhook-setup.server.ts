import { getTenantProvider, publicBaseUrl } from "./billing.server";
import { encryptSecret, randomToken, tokenFingerprint } from "./crypto.server";
import { logAudit } from "./audit.server";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function registerTenantWebhook(admin: AdminClient, tenantId: string, origin: string | null, userId: string) {
  const conn = await getTenantProvider(admin, tenantId);
  if (!conn) throw new Error("Ative sua conta de pagamentos primeiro.");
  const base = publicBaseUrl(origin);
  if (!base) throw new Error("Abra o app pelo endereço publicado ou de pré-visualização para registrar o webhook.");
  const url = `${base}/api/public/webhooks/asaas`;

  const { data: user } = await admin.auth.admin.getUserById(userId);
  const email = user.user?.email ?? "contato@wisepay.app";
  const authToken = randomToken(32);
  const created = await conn.provider.registerWebhook({ url, email, authToken });

  await admin
    .from("provider_connections")
    .update({
      webhook_token_ciphertext: encryptSecret(authToken),
      webhook_token_hash: tokenFingerprint(authToken),
      webhook_id: created.id,
      webhook_url: url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.connection.id);

  await logAudit(admin, { tenantId, userId, action: "webhook.registered", resource: "provider_connections", metadata: { url } });
  return { url };
}

/** Garante que a empresa tem o aviso automático registrado; não falha a operação principal. */
export async function ensureTenantWebhook(admin: AdminClient, tenantId: string, origin: string | null, userId: string) {
  const conn = await getTenantProvider(admin, tenantId);
  if (!conn || conn.connection.webhook_id) return;
  try {
    await registerTenantWebhook(admin, tenantId, origin, userId);
  } catch (error) {
    console.error("Falha ao registrar webhook automaticamente", error);
  }
}
