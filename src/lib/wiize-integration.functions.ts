import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { loadAccess } from "./team.functions";

async function ownerAccess(userId: string) {
  const access = await loadAccess(userId);
  if (access.role !== "owner" && access.role !== "admin") throw new Error("Somente o dono ou administrador pode gerenciar integrações.");
  return access;
}

export const getWiizeConnection = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { wiizeConfig, getAdmin } = await import("./wiize-integration.server");
    const access = await loadAccess(context.userId);
    const db = await getAdmin();
    const { data } = await db
      .from("wiize_connections")
      .select("status, wiize_account_name, wiize_email_masked, wiize_organization_name, connected_at, scopes, last_sync_at")
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    return {
      configured: wiizeConfig().configured,
      canManage: access.role === "owner" || access.role === "admin",
      connection: data && data.status === "connected" ? data : null,
    };
  });

export const startWiizeConnect = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const s = await import("./wiize-integration.server");
    const cfg = s.wiizeConfig();
    if (!cfg.configured) throw new Error("A conexão com o Wiize ainda não está disponível.");
    const access = await ownerAccess(context.userId);
    const db = await s.getAdmin();
    if (!(await s.rateLimit(db, `connect:${context.userId}`, 10, 3600))) throw new Error("Muitas tentativas. Tente novamente mais tarde.");
    const state = s.newState();
    const pkce = s.createPkce();
    await db.from("wiize_oauth_states").insert({
      state_hash: s.sha256(state),
      code_verifier_enc: s.sealToken(pkce.verifier),
      tenant_id: access.tenantId,
      user_id: context.userId,
      purpose: "connect",
      expires_at: new Date(Date.now() + s.STATE_TTL_MS).toISOString(),
    });
    const origin = new URL(getRequest().url).origin;
    const url = new URL(`${cfg.baseUrl}/oauth/authorize`);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId!,
      redirect_uri: `${origin}/api/public/wiize/callback`,
      scope: s.WIIZE_SCOPES.join(" "),
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    }).toString();
    await s.audit(db, { tenantId: access.tenantId, userId: context.userId, action: "wiize.connect.started" });
    return { url: url.toString() };
  });

export const startWiizeLogin = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./wiize-integration.server");
  const cfg = s.wiizeConfig();
  if (!cfg.configured) throw new Error("O acesso com o Wiize ainda não está disponível.");
  const db = await s.getAdmin();
  const ip = getRequest().headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await s.rateLimit(db, `login:${ip}`, 20, 900))) throw new Error("Muitas tentativas. Tente novamente mais tarde.");
  const state = s.newState();
  const pkce = s.createPkce();
  await db.from("wiize_oauth_states").insert({
    state_hash: s.sha256(state),
    code_verifier_enc: s.sealToken(pkce.verifier),
    purpose: "login",
    expires_at: new Date(Date.now() + s.STATE_TTL_MS).toISOString(),
  });
  const origin = new URL(getRequest().url).origin;
  const url = new URL(`${cfg.baseUrl}/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId!, redirect_uri: `${origin}/api/public/wiize/callback`,
    scope: "openid email", state, code_challenge: pkce.challenge, code_challenge_method: "S256",
  }).toString();
  return { url: url.toString() };
});

export const disconnectWiize = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const s = await import("./wiize-integration.server");
    const access = await ownerAccess(context.userId);
    const db = await s.getAdmin();
    const { data: conn } = await db.from("wiize_connections").select("id").eq("tenant_id", access.tenantId).maybeSingle();
    if (!conn) return { ok: true };
    const cfg = s.wiizeConfig();
    const { data: tok } = await db.from("wiize_tokens").select("access_token_enc, refresh_token_enc").eq("connection_id", conn.id).maybeSingle();
    if (tok && cfg.configured) {
      try {
        await fetch(`${cfg.baseUrl}/oauth/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: s.openToken(tok.refresh_token_enc ?? tok.access_token_enc), client_id: cfg.clientId!, client_secret: cfg.clientSecret! }),
        });
      } catch { /* a revogação local abaixo continua valendo */ }
    }
    await db.from("wiize_tokens").delete().eq("connection_id", conn.id);
    await db.from("wiize_connections").update({ status: "disconnected", revoked_at: new Date().toISOString() }).eq("id", conn.id);
    await s.audit(db, { tenantId: access.tenantId, userId: context.userId, action: "wiize.connection.revoked" });
    return { ok: true };
  });

const customerQuery = z.object({ search: z.string().trim().max(120).optional(), page: z.number().int().min(1).max(1000).default(1) });

export const listWiizeCustomers = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .inputValidator((d) => customerQuery.parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("./wiize-integration.server");
    const access = await loadAccess(context.userId);
    const db = await s.getAdmin();
    if (!(await s.rateLimit(db, `customers:${access.tenantId}`, 120, 60))) throw new Error("Muitas consultas. Aguarde um instante.");
    const qs = new URLSearchParams({ page: String(data.page), limit: "25", ...(data.search ? { search: data.search } : {}) });
    const res = (await s.wiizeApi(db, access.tenantId, `/api/v1/customers?${qs}`)) as { data?: unknown[] };
    const item = z.object({ id: z.string().max(100), name: z.string().max(200), email: z.string().max(254).nullish(), document: z.string().max(20).nullish(), phone: z.string().max(30).nullish() });
    const items = z.array(item).max(100).parse(res.data ?? []);
    await db.from("wiize_connections").update({ last_sync_at: new Date().toISOString() }).eq("tenant_id", access.tenantId);
    return { items };
  });

const importInput = z.object({
  wiizeCustomerId: z.string().min(1).max(100),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  document: z.string().regex(/^\d{11}$|^\d{14}$/).optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

/** Vincula ou cria cliente Wiize Core a partir do Wiize, sem duplicar. */
export const importWiizeCustomer = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((d) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("./wiize-integration.server");
    const access = await loadAccess(context.userId);
    const db = await s.getAdmin();
    const t = access.tenantId;
    const { data: prev } = await db.from("integration_idempotency").select("result").eq("tenant_id", t).eq("key", data.idempotencyKey).maybeSingle();
    if (prev) return prev.result as { customerId: string; matched: string };

    const { data: link } = await db.from("wiize_customer_links").select("customer_id").eq("tenant_id", t).eq("wiize_customer_id", data.wiizeCustomerId).maybeSingle();
    let customerId = link?.customer_id ?? null;
    let matched = "link";
    if (!customerId && data.document) {
      const { data: c } = await db.from("customers").select("id").eq("tenant_id", t).eq("document", data.document).maybeSingle();
      if (c) { customerId = c.id; matched = "document"; }
    }
    if (!customerId && data.email) {
      const { data: c } = await db.from("customers").select("id").eq("tenant_id", t).ilike("email", data.email).limit(2);
      if (c?.length === 1) { customerId = c[0]!.id; matched = "email"; }
    }
    if (!customerId) {
      const { data: created, error } = await db.from("customers").insert({
        tenant_id: t, name: data.name, email: data.email || null, document: data.document || null, phone: data.phone || null,
      } as never).select("id").single();
      if (error) throw new Error("Não foi possível criar o cliente.");
      customerId = created.id; matched = "created";
      await s.enqueueWiizeEvent(db, t, "customer.created", "customer", customerId, { wiize_customer_id: data.wiizeCustomerId });
    }
    if (!link) await db.from("wiize_customer_links").upsert({ tenant_id: t, wiize_customer_id: data.wiizeCustomerId, customer_id: customerId, match_method: matched }, { onConflict: "tenant_id,wiize_customer_id" });
    const result = { customerId, matched };
    await db.from("integration_idempotency").insert({ tenant_id: t, key: data.idempotencyKey, operation: "customer.import", result: result as never });
    await s.audit(db, { tenantId: t, userId: context.userId, action: "wiize.customer.synced", details: { matched } });
    return result;
  });
