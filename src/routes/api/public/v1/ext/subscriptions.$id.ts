import { createFileRoute } from "@tanstack/react-router";

/** GET /api/public/v1/ext/subscriptions/:id — plano, ciclos e status. Exige subscriptions:read. */
export const Route = createFileRoute("/api/public/v1/ext/subscriptions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { withExtApi, extError, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/subscriptions/:id", ["subscriptions:read"], async (ctx) => {
          const read = await import("@/lib/ext-read.server");
          if (!read.isUuid(params.id)) return extError(ctx.requestId, "not_found", 404);
          if (ctx.environment === "test") {
            const { data: r } = await ctx.db.from("ext_sandbox_charges").select("*").eq("id", params.id).eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).eq("charge_type", "recurring").maybeSingle();
            if (r) return extJson(ctx.requestId, { ...read.sandboxSubscriptionView(r), request_id: ctx.requestId });
          }
          const v = await read.liveSubscriptionView(ctx, params.id);
          if (!v) return extError(ctx.requestId, "not_found", 404);
          return extJson(ctx.requestId, { ...v, request_id: ctx.requestId });
        });
      },
    },
  },
});
