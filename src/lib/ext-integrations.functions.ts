import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { loadAccess } from "./team.functions";
import { EXT_SCOPES, maskSecret, sanitizeScopes } from "./ext-keys";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Só dono/administrador, com 2FA confirmado se ativado. */
async function requireManager(userId: string, claims: unknown) {
  const access = await loadAccess(userId);
  if (access.role !== "owner" && access.role !== "admin") throw new Error("Somente o dono ou administrador pode gerenciar integrações.");
  const { assertTwoFactorIfEnrolled } = await import("./finance.server");
  await assertTwoFactorIfEnrolled(claims, userId);
  return access;
}

/** Gerar ou trocar chave exige a senha financeira de quem está pedindo (conferida no servidor). */
async function requireFinancialPassword(userId: string, password: string, purpose: string) {
  const { assertFinancialPassword } = await import("./finance.server");
  await assertFinancialPassword(await db(), userId, password, purpose);
}

async function issueKey(integrationId: string, tenantId: string, env: string, userId: string) {
  const { randomToken, tokenFingerprint } = await import("./crypto.server");
  const secret = `sk_${env}_${randomToken(32)}`;
  const publicKey = `pk_${env}_${randomToken(18)}`;
  const { error } = await (await db()).from("ext_api_keys").insert({
    integration_id: integrationId, tenant_id: tenantId, public_key: publicKey,
    secret_hash: tokenFingerprint(secret), secret_prefix: `sk_${env}_`, secret_last4: secret.slice(-4), created_by: userId,
  });
  if (error) throw new Error("Não foi possível gerar a chave.");
  return { secret, publicKey };
}

async function audit(tenantId: string, userId: string, action: string, metadata: Record<string, unknown>) {
  const { logAudit } = await import("./audit.server");
  await logAudit(await db(), { tenantId, userId, action, resource: "ext_integrations", metadata });
}

export const listExtIntegrations = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const access = await loadAccess(context.userId);
    const d = await db();
    const { data: ints } = await d.from("ext_integrations").select("id, name, environment, status, scopes, last_used_at, created_at").eq("tenant_id", access.tenantId).order("created_at", { ascending: false });
    const ids = (ints ?? []).map((i) => i.id);
    const { data: keys } = ids.length
      ? await d.from("ext_api_keys").select("id, integration_id, public_key, secret_prefix, secret_last4, status, last_used_at, created_at").in("integration_id", ids).eq("status", "active")
      : { data: [] };
    return {
      canManage: access.role === "owner" || access.role === "admin",
      allScopes: [...EXT_SCOPES],
      integrations: (ints ?? []).map((i) => {
        const k = (keys ?? []).find((x) => x.integration_id === i.id);
        return { ...i, key: k ? { id: k.id, publicKey: k.public_key, masked: maskSecret(k.secret_prefix, k.secret_last4), lastUsedAt: k.last_used_at, createdAt: k.created_at } : null };
      }),
    };
  });

export const createExtIntegration = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(2).max(80), environment: z.enum(["test", "live"]), scopes: z.array(z.string()).max(20), financialPassword: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, context.claims);
    await requireFinancialPassword(context.userId, data.financialPassword, "ext_api_key.create");
    const scopes = sanitizeScopes(data.scopes);
    if (!scopes.length) throw new Error("Escolha ao menos uma permissão.");
    const { data: row, error } = await (await db()).from("ext_integrations").insert({ tenant_id: access.tenantId, name: data.name, environment: data.environment, scopes, created_by: context.userId }).select("id").single();
    if (error || !row) throw new Error("Não foi possível criar a integração.");
    const key = await issueKey(row.id, access.tenantId, data.environment, context.userId);
    await audit(access.tenantId, context.userId, "ext_integration.created", { integration_id: row.id, environment: data.environment, scopes });
    return { id: row.id, ...key };
  });

const idInput = (d: unknown) => z.object({ id: z.string().uuid() }).parse(d);

async function ownIntegration(tenantId: string, id: string) {
  const { data } = await (await db()).from("ext_integrations").select("id, environment, status").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) throw new Error("Integração não encontrada.");
  return data;
}

export const rotateExtKey = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), financialPassword: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, context.claims);
    await requireFinancialPassword(context.userId, data.financialPassword, "ext_api_key.rotate");
    const it = await ownIntegration(access.tenantId, data.id);
    if (it.status === "revoked") throw new Error("Integração revogada.");
    const now = new Date().toISOString();
    await (await db()).from("ext_api_keys").update({ status: "revoked", revoked_at: now }).eq("integration_id", it.id).eq("status", "active");
    const key = await issueKey(it.id, access.tenantId, it.environment, context.userId);
    await audit(access.tenantId, context.userId, "ext_integration.key_rotated", { integration_id: it.id });
    return key;
  });

export const setExtIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "suspended", "revoked"]), financialPassword: z.string().min(1).max(128).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, context.claims);
    if (data.status === "revoked") {
      if (!data.financialPassword) throw new Error("Informe a senha financeira para revogar.");
      await requireFinancialPassword(context.userId, data.financialPassword, "ext_api_key.revoke");
    }
    const it = await ownIntegration(access.tenantId, data.id);
    if (it.status === "revoked") throw new Error("Uma integração revogada não pode ser reativada.");
    const d = await db();
    const now = new Date().toISOString();
    await d.from("ext_integrations").update({ status: data.status, updated_at: now }).eq("id", it.id);
    if (data.status === "revoked") await d.from("ext_api_keys").update({ status: "revoked", revoked_at: now }).eq("integration_id", it.id).eq("status", "active");
    await audit(access.tenantId, context.userId, `ext_integration.${data.status}`, { integration_id: it.id });
    return { ok: true };
  });
