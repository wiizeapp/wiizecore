import { createFileRoute } from "@tanstack/react-router";

/** Troca de tokens OAuth 2.0 (servidor ↔ servidor). */
export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const db = await s.getAdmin();
        const ip = s.clientIp(request);
        const err = (error: string, status = 400) => s.oauthJson({ error }, status);
        if (!(request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) return err("invalid_request");
        const raw = await request.text();
        if (raw.length > 8192) return err("invalid_request");
        const f = new URLSearchParams(raw);
        let clientId = f.get("client_id");
        let secret = f.get("client_secret");
        const basic = /^Basic (.+)$/.exec(request.headers.get("authorization") ?? "");
        if (basic) {
          const [u, p] = Buffer.from(basic[1]!, "base64").toString("utf8").split(":");
          clientId = decodeURIComponent(u ?? ""); secret = decodeURIComponent(p ?? "");
        }
        if (!(await s.limit(db, "oauth_token", clientId ?? ip ?? "x", 10))) return s.oauthJson({ error: "slow_down" }, 429, { "Retry-After": "60" });
        const client = await s.authenticateClient(db, clientId, secret);
        if (!client) {
          await s.audit(db, { action: "oauth.token.invalid_client", outcome: "denied", ip });
          return err("invalid_client", 401);
        }
        const grant = f.get("grant_type");

        if (grant === "authorization_code") {
          const code = f.get("code"); const redirectUri = f.get("redirect_uri"); const verifier = f.get("code_verifier");
          if (!code || !redirectUri || !verifier || code.length > 200) return err("invalid_request");
          const { data: row } = await db.from("oauth_authorization_codes").select("*").eq("code_hash", s.sha256hex(code)).maybeSingle();
          if (!row || row.client_id !== client.client_id) return err("invalid_grant");
          if (row.used_at) {
            // Reuso de código: revoga tudo que foi emitido com ele.
            await s.revokeFamily(db, { codeId: row.id });
            await s.audit(db, { tenantId: row.tenant_id, action: "oauth.code.reused", outcome: "alert", ip });
            return err("invalid_grant");
          }
          // Marca como usado ANTES de emitir (condicional, evita corrida).
          const { data: claimed } = await db.from("oauth_authorization_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
          if (!claimed?.length) return err("invalid_grant");
          if (new Date(row.expires_at).getTime() < Date.now() || row.redirect_uri !== redirectUri || !s.pkceMatches(verifier, row.code_challenge)) {
            await s.audit(db, { tenantId: row.tenant_id, action: "oauth.token.invalid_grant", outcome: "denied", ip });
            return err("invalid_grant");
          }
          const tokens = await s.issueTokens(db, { clientId: client.client_id, userId: row.user_id, tenantId: row.tenant_id, scopes: row.scopes, codeId: row.id });
          await s.audit(db, { tenantId: row.tenant_id, userId: row.user_id, action: "oauth.token.issued", ip });
          return s.oauthJson(tokens);
        }

        if (grant === "refresh_token") {
          const rt = f.get("refresh_token");
          if (!rt || !/^wprt_[A-Za-z0-9_-]{20,100}$/.test(rt)) return err("invalid_grant");
          const { data: t } = await db.from("oauth_tokens").select("*").eq("refresh_token_hash", s.sha256hex(rt)).maybeSingle();
          if (!t || t.client_id !== client.client_id) return err("invalid_grant");
          if (t.revoked_at) {
            // Reuso de refresh antigo: revoga a família inteira.
            await s.revokeFamily(db, { familyId: t.family_id });
            await s.audit(db, { tenantId: t.tenant_id, action: "oauth.refresh.reused", outcome: "alert", ip });
            return err("invalid_grant");
          }
          if (!t.refresh_expires_at || new Date(t.refresh_expires_at).getTime() < Date.now()) return err("invalid_grant");
          const { data: rot } = await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id).is("revoked_at", null).select("id");
          if (!rot?.length) return err("invalid_grant");
          const tokens = await s.issueTokens(db, { clientId: t.client_id, userId: t.user_id, tenantId: t.tenant_id, scopes: t.scopes, familyId: t.family_id, rotatedFrom: t.id, codeId: t.code_id });
          await s.audit(db, { tenantId: t.tenant_id, action: "oauth.token.refreshed", ip });
          return s.oauthJson(tokens);
        }
        return err("unsupported_grant_type");
      },
    },
  },
});
