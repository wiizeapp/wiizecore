import { createFileRoute } from "@tanstack/react-router";

/** Revogação (RFC 7009): sempre responde 200. Revoga acesso e renovação da mesma conexão. */
export const Route = createFileRoute("/api/public/oauth/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const db = await s.getAdmin();
        const ok = s.oauthJson({}, 200);
        const raw = await request.text();
        if (raw.length > 8192) return ok;
        const f = new URLSearchParams(raw);
        const client = await s.authenticateClient(db, f.get("client_id"), f.get("client_secret"));
        const token = f.get("token");
        if (!client || !token) return ok;
        const h = s.sha256hex(token);
        const { data: t } = await db.from("oauth_tokens").select("family_id, tenant_id, client_id")
          .or(`access_token_hash.eq.${h},refresh_token_hash.eq.${h}`).maybeSingle();
        if (t && t.client_id === client.client_id) {
          await s.revokeFamily(db, { familyId: t.family_id });
          await s.audit(db, { tenantId: t.tenant_id, action: "oauth.token.revoked", ip: s.clientIp(request) });
        }
        return ok;
      },
    },
  },
});
