import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const tokenSchema = z.object({
  access_token: z.string().min(10).max(4096),
  refresh_token: z.string().max(4096).optional(),
  expires_in: z.number().int().positive().max(60 * 60 * 24 * 90).optional(),
  scope: z.string().max(500).optional(),
});
const meSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(200).nullish(),
  organization: z.object({ id: z.string().min(1).max(100), name: z.string().max(200).nullish() }).nullish(),
});

const back = (origin: string, path: string) => Response.redirect(`${origin}${path}`, 302);

export const Route = createFileRoute("/api/public/wiize/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await import("@/lib/wiize-integration.server");
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const db = await s.getAdmin();
        const ip = request.headers.get("cf-connecting-ip");
        if (!code || !state || code.length > 2048 || state.length > 200) return back(origin, "/configuracoes?wiize=erro");
        if (!(await s.rateLimit(db, `callback:${ip ?? "x"}`, 30, 600))) return back(origin, "/configuracoes?wiize=erro");

        const { data: st } = await db.from("wiize_oauth_states").select("*").eq("state_hash", s.sha256(state)).maybeSingle();
        const failPath = st?.purpose === "login" ? "/auth?wiize=erro" : "/configuracoes?wiize=erro";
        if (!st || st.used_at || new Date(st.expires_at).getTime() < Date.now()) {
          await s.audit(db, { action: "wiize.callback.invalid_state", outcome: "denied", ip });
          return back(origin, failPath);
        }
        await db.from("wiize_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", st.id).is("used_at", null);

        const cfg = s.wiizeConfig();
        if (!cfg.configured) return back(origin, failPath);
        try {
          const tokRes = await fetch(`${cfg.baseUrl}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code", code, redirect_uri: `${origin}/api/public/wiize/callback`,
              client_id: cfg.clientId!, client_secret: cfg.clientSecret!, code_verifier: s.openToken(st.code_verifier_enc),
            }),
            redirect: "error",
          });
          if (!tokRes.ok) throw new Error(`token ${tokRes.status}`);
          const tok = tokenSchema.parse(await tokRes.json());
          const meRes = await fetch(`${cfg.baseUrl}/api/v1/me`, { headers: { Authorization: `Bearer ${tok.access_token}` }, redirect: "error" });
          if (!meRes.ok) throw new Error(`me ${meRes.status}`);
          const me = meSchema.parse(await meRes.json());

          if (st.purpose === "login") {
            // Só entra quem já tem conta WiizePay com o mesmo e-mail; não cria contas automaticamente.
            const { data: profile } = await db.from("profiles").select("id").ilike("email", me.email).maybeSingle();
            if (!profile) return back(origin, "/auth?wiize=sem-conta");
            const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: me.email, options: { redirectTo: `${origin}/painel` } });
            if (error || !link.properties?.action_link) throw new Error("link");
            await s.audit(db, { userId: profile.id, action: "wiize.login", ip });
            return Response.redirect(link.properties.action_link, 302);
          }

          if (!st.tenant_id || !me.organization) throw new Error("org");
          // Mesmo par de organizações = mesmo vínculo, venha de qualquer lado.
          const { data: other } = await db.from("wiize_connections").select("tenant_id").eq("wiize_organization_id", me.organization.id).eq("status", "connected").neq("tenant_id", st.tenant_id).maybeSingle();
          if (other) {
            await s.audit(db, { tenantId: st.tenant_id, userId: st.user_id, action: "wiize.connect.org_in_use", outcome: "denied" });
            return back(origin, "/configuracoes?wiize=em-uso");
          }
          const { data: conn, error } = await db.from("wiize_connections").upsert({
            tenant_id: st.tenant_id, wiize_organization_id: me.organization.id, wiize_organization_name: me.organization.name ?? null,
            wiize_account_name: me.name ?? null, wiize_email_masked: s.maskEmail(me.email),
            scopes: (tok.scope ?? s.WIIZE_SCOPES.join(" ")).split(" ").filter(Boolean).slice(0, 20),
            status: "connected", connected_by: st.user_id, connected_at: new Date().toISOString(), revoked_at: null,
          }, { onConflict: "tenant_id" }).select("id").single();
          if (error) throw error;
          await db.from("wiize_tokens").upsert({
            connection_id: conn.id, access_token_enc: s.sealToken(tok.access_token),
            refresh_token_enc: tok.refresh_token ? s.sealToken(tok.refresh_token) : null,
            expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          });
          await s.audit(db, { tenantId: st.tenant_id, userId: st.user_id, action: "wiize.connection.authorized" });
          return back(origin, "/configuracoes?wiize=conectado");
        } catch (e) {
          console.error("wiize callback failed", e instanceof Error ? e.message : "unknown");
          await s.audit(db, { tenantId: st.tenant_id, userId: st.user_id, action: "wiize.callback.error", outcome: "error" });
          return back(origin, failPath);
        }
      },
    },
  },
});
