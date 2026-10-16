import { createFileRoute } from "@tanstack/react-router";

/** GET /api/public/v1/ext/services — serviços ativos da empresa (preço definido na Wiize Core). Exige services:read. */
export const Route = createFileRoute("/api/public/v1/ext/services")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { withExtApi, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/services", ["services:read"], async (ctx) => {
          const { data } = await ctx.db.from("services").select("id, name, description, amount, type, frequency, installments, accepted_methods, custom_amount, updated_at").eq("tenant_id", ctx.tenantId).eq("active", true).is("archived_at", null).order("name").limit(200);
          return extJson(ctx.requestId, {
            object: "list", request_id: ctx.requestId,
            data: (data ?? []).map((s) => ({ id: s.id, object: "service", name: s.name, description: s.description, amount: Number(s.amount).toFixed(2), currency: "BRL", charge_type: s.type, frequency: s.frequency, max_installments: s.installments, payment_methods: s.accepted_methods, checkout_supported: !s.custom_amount && Number(s.amount) > 0 && s.accepted_methods.length > 0, updated_at: s.updated_at })),
          });
        });
      },
    },
  },
});
