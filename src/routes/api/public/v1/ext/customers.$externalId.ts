import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/v1/ext/customers/:external_customer_id — vínculo do cliente e link da central.
 * Devolve só o que o SaaS já conhece (sem CPF/CNPJ completo). Exige customers:read.
 * O link da central não dá acesso sozinho: o cliente ainda entra com e-mail + CPF/CNPJ.
 */
export const Route = createFileRoute("/api/public/v1/ext/customers/$externalId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { withExtApi, extError, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/customers/:external_customer_id", ["customers:read"], async (ctx) => {
          const ext = decodeURIComponent(params.externalId);
          if (!ext || ext.length > 128) return extError(ctx.requestId, "not_found", 404);
          const base = (await import("@/lib/billing.server")).publicBaseUrl(null);
          if (ctx.environment === "test") {
            const { data: rows } = await ctx.db.from("ext_sandbox_charges").select("id, customer_name, created_at").eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).eq("external_customer_id", ext).order("created_at", { ascending: false }).limit(1);
            if (rows?.length) return extJson(ctx.requestId, { object: "customer", livemode: false, sandbox: true, id: null, external_customer_id: ext, name: rows[0]!.customer_name, portal_url: null, last_charge_id: rows[0]!.id, request_id: ctx.requestId });
          }
          const { data: link } = await ctx.db.from("ext_customer_links").select("customer_id, created_at").eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).eq("external_customer_id", ext).maybeSingle();
          if (!link) return extError(ctx.requestId, "not_found", 404);
          const { data: c } = await ctx.db.from("customers").select("id, name, email").eq("id", link.customer_id).eq("tenant_id", ctx.tenantId).maybeSingle();
          if (!c) return extError(ctx.requestId, "not_found", 404);
          const { data: last } = await ctx.db.from("ext_checkout_sessions").select("charge_group_id").eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).eq("customer_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          return extJson(ctx.requestId, {
            object: "customer", livemode: ctx.environment === "live", sandbox: false, id: c.id, external_customer_id: ext, name: c.name, email: c.email,
            portal_url: base ? `${base}/portal/${ctx.tenantId}` : null, last_charge_id: last?.charge_group_id ?? null, linked_at: link.created_at, request_id: ctx.requestId,
          });
        });
      },
    },
  },
});
