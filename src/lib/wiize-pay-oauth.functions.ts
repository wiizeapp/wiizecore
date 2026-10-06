import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const params = z.object({
  response_type: z.string().max(20).optional(),
  client_id: z.string().max(200).optional(),
  redirect_uri: z.string().max(500).optional(),
  scope: z.string().max(500).optional(),
  state: z.string().max(500).optional(),
  code_challenge: z.string().max(200).optional(),
  code_challenge_method: z.string().max(10).optional(),
});

const SCOPE_LABELS: Record<string, string> = {
  "crm.read": "Ler dados gerais do CRM", "contacts.read": "Ler contatos", "companies.read": "Ler empresas",
  "deals.read": "Ler negócios", "sales.read": "Ler vendas", "products.read": "Ler produtos", "charges.write": "Criar e cancelar cobranças",
};

async function ctx(userId: string) {
  const { loadAccess } = await import("./team.functions");
  try { return await loadAccess(userId); } catch { return null; }
}

/** Detalhes da tela de consentimento. Só dono/admin da empresa pode autorizar. */
export const getAuthorizeDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => params.parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("./wiize-pay-oauth.server");
    const db = await s.getAdmin();
    const v = await s.validateAuthorize(db, data);
    if ("error" in v) return { error: v.error };
    const access = await ctx(context.userId);
    if (!access) return { error: "Sua conta não pertence a uma empresa ativa." };
    const { data: t } = await db.from("tenants").select("name").eq("id", access.tenantId).maybeSingle();
    return {
      clientName: v.client.name, redirectHost: new URL(v.redirectUri).host, tenantName: t?.name ?? "",
      canApprove: access.role === "owner" || access.role === "admin",
      scopes: v.scopes.map((sc) => SCOPE_LABELS[sc] ?? `Permissão adicional: ${sc}`),
    };
  });

/** Aprovar ou negar. Revalida tudo no servidor; o código dura 60 s e é guardado só como hash. */
export const decideAuthorize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => params.extend({ approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("./wiize-pay-oauth.server");
    const db = await s.getAdmin();
    const v = await s.validateAuthorize(db, data);
    if ("error" in v) return { error: v.error };
    const back = new URL(v.redirectUri);
    back.searchParams.set("state", v.state);
    if (!data.approve) {
      back.searchParams.set("error", "access_denied");
      await s.audit(db, { userId: context.userId, action: "oauth.authorize.denied" });
      return { redirect: back.toString() };
    }
    const access = await ctx(context.userId);
    if (!access || !(access.role === "owner" || access.role === "admin")) return { error: "Apenas dono ou administrador pode conectar." };
    if (!(await s.limit(db, "oauth_authorize", context.userId, 10))) return { error: "Muitas tentativas. Aguarde um minuto." };
    const code = s.newCode();
    const { error } = await db.from("oauth_authorization_codes").insert({
      code_hash: s.sha256hex(code), client_id: v.client.client_id, user_id: context.userId, tenant_id: access.tenantId,
      scopes: v.scopes, redirect_uri: v.redirectUri, code_challenge: v.challenge,
      expires_at: new Date(Date.now() + s.CODE_TTL_S * 1000).toISOString(),
    });
    if (error) return { error: "Não foi possível autorizar agora." };
    await s.audit(db, { tenantId: access.tenantId, userId: context.userId, action: "oauth.authorize.approved", details: { client: v.client.client_id } });
    back.searchParams.set("code", code);
    return { redirect: back.toString() };
  });

/** Admin da plataforma (com 2FA) cria ou gira o segredo do Wiize. O segredo aparece uma única vez. */
export const provisionWiizeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
    if (!isAdmin) throw new Error("Acesso negado.");
    if ((context.claims as { aal?: string }).aal !== "aal2") throw new Error("Confirme o 2FA para continuar.");
    const s = await import("./wiize-pay-oauth.server");
    const db = await s.getAdmin();
    const secret = `wpcs_${s.randomSecret(40)}`;
    const hash = s.hashClientSecret(secret);
    const webhookSecret = `wpwh_${s.randomSecret(40)}`;
    const { encryptSecret } = await import("./crypto.server");
    const webhookEnc = encryptSecret(webhookSecret);
    const { data: existing } = await db.from("oauth_clients").select("client_id, client_secret_hash").eq("name", s.WIIZE_CLIENT_NAME).maybeSingle();
    let clientId: string;
    if (existing) {
      clientId = existing.client_id;
      await db.from("oauth_clients").update({
        client_secret_hash: hash, previous_secret_hash: existing.client_secret_hash,
        previous_secret_expires_at: new Date(Date.now() + s.SECRET_GRACE_MS).toISOString(),
        redirect_uris: s.WIIZE_REDIRECT_URIS, allowed_scopes: s.WIIZE_ALLOWED_SCOPES, active: true, webhook_secret_enc: webhookEnc,
      }).eq("client_id", clientId);
    } else {
      clientId = `wiize_${s.randomSecret(12)}`;
      const { error } = await db.from("oauth_clients").insert({ client_id: clientId, name: s.WIIZE_CLIENT_NAME, client_secret_hash: hash, redirect_uris: s.WIIZE_REDIRECT_URIS, allowed_scopes: s.WIIZE_ALLOWED_SCOPES, active: true, webhook_secret_enc: webhookEnc });
      if (error) throw new Error("Não foi possível criar o aplicativo.");
    }
    await s.audit(db, { userId: context.userId, action: existing ? "oauth.client.secret_rotated" : "oauth.client.created", details: { client: clientId } });
    return { clientId, clientSecret: secret, webhookSecret, rotated: Boolean(existing) };
  });
