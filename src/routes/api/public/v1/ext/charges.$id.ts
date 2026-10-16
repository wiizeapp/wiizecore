import { createFileRoute } from "@tanstack/react-router";

/** GET /api/public/v1/ext/charges/:id — status atual para conciliação. Exige charges:read. */
export const Route = createFileRoute("/api/public/v1/ext/charges/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { withExtApi, extError, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/charges/:id", ["charges:read"], async (ctx) => {
          const read = await import("@/lib/ext-read.server");
          if (!read.isUuid(params.id)) return extError(ctx.requestId, "not_found", 404);
          if (ctx.environment === "test") {
            const { data: r } = await ctx.db.from("ext_sandbox_charges").select("*").eq("id", params.id).eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).maybeSingle();
            if (r) {
              const { sandboxChargeView } = await import("@/lib/ext-sandbox.server");
              const base = (await import("@/lib/billing.server")).publicBaseUrl(null);
              return extJson(ctx.requestId, { ...sandboxChargeView(r, base), request_id: ctx.requestId });
            }
          }
          const v = await read.liveChargeView(ctx, params.id);
          if (!v || v.livemode !== (ctx.environment === "live")) return extError(ctx.requestId, "not_found", 404);
          return extJson(ctx.requestId, { ...v, request_id: ctx.requestId });
        });
      },
    },
  },
});
