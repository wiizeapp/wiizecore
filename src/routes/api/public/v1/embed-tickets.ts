import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const body = z.object({
  kind: z.enum(["contract", "service", "charge"]),
  customer: z.object({ lead_id: z.string().min(1).max(120) }).optional(),
  theme: z.enum(["light", "dark"]).default("light"),
});

/**
 * O servidor do Wiize pede um passe de uso único (2 min) para abrir uma janela da WiizePay.
 * O passe vai no "#" do endereço: não é enviado a servidores nem fica em registros de acesso.
 */
export const Route = createFileRoute("/api/public/v1/embed-tickets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const api = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = await s.authenticateBearer(db, request, "charges.write");
        if (!tok) {
          await s.audit(db, { action: "wiize_pay.api.unauthorized", outcome: "denied", ip: s.clientIp(request) });
          return api.apiJson({ error: "unauthorized" }, 401);
        }
        if (!(await s.limit(db, "wiize_embed", tok.tenant_id, 120))) return api.apiJson({ error: "rate_limited" }, 429);
        const raw = await request.text();
        if (raw.length > 4096) return api.apiJson({ error: "payload_too_large" }, 413);
        let p;
        try { p = body.safeParse(JSON.parse(raw)); } catch { return api.apiJson({ error: "invalid_json" }, 400); }
        if (!p.success) return api.apiJson({ error: "invalid_body" }, 422);
        let customerId: string | null = null;
        if (p.data.customer) {
          const { data: l } = await db.from("wiize_customer_links").select("customer_id").eq("tenant_id", tok.tenant_id).eq("wiize_customer_id", p.data.customer.lead_id).maybeSingle();
          if (!l) return api.apiJson({ error: "customer_not_synced", message: "Envie o cliente em /api/public/v1/customers antes." }, 422);
          customerId = l.customer_id;
        }
        if (p.data.kind !== "service" && !customerId) return api.apiJson({ error: "customer_required" }, 422);
        const { issueTicket } = await import("@/lib/embed-session.server");
        const t = await issueTicket({ tenantId: tok.tenant_id, userId: tok.user_id, clientId: tok.client_id, kind: p.data.kind, customerId, theme: p.data.theme });
        const path = { contract: "contrato", service: "servico", charge: "cobranca" }[p.data.kind];
        const { DEPLOY_CONFIG } = await import("@/lib/deploy-config");
        const reqHost = new URL(request.url).hostname;
        const base = /(^|\.)wiizepay\.com(\.br)?$/.test(reqHost) ? DEPLOY_CONFIG.publicSiteUrl : api.checkoutOrigin(request);
        const url = `${base}/embed/${path}#t=${encodeURIComponent(t.ticket)}&theme=${p.data.theme}`;
        await s.audit(db, { tenantId: tok.tenant_id, userId: tok.user_id, action: "wiize_pay.embed.ticket_issued", details: { kind: p.data.kind } });
        return api.apiJson({ url, expires_at: t.expiresAt }, 201);
      },
    },
  },
});
