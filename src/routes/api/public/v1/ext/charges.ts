import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const query = z.object({
  external_customer_id: z.string().trim().min(1).max(128).optional(),
  status: z.enum(["created", "awaiting_payment", "pending", "processing", "in_analysis", "paid", "failed", "overdue", "cancelled", "refunded"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  created_before: z.string().datetime().optional(),
}).strict();

/** GET /api/public/v1/ext/charges — lista para conciliação, paginada por data (created_before). Exige charges:read. */
export const Route = createFileRoute("/api/public/v1/ext/charges")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { withExtApi, extError, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/charges", ["charges:read"], async (ctx) => {
          const p = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
          if (!p.success) return extError(ctx.requestId, "invalid_query", 422, { fields: p.error.issues.slice(0, 10).map((i) => i.path.join(".")) });
          const f = p.data;
          const { db } = ctx;
          if (ctx.environment === "test") {
            let q = db.from("ext_sandbox_charges").select("*").eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).order("created_at", { ascending: false }).limit(f.limit + 1);
            if (f.external_customer_id) q = q.eq("external_customer_id", f.external_customer_id);
            if (f.status) q = q.eq("status", f.status);
            if (f.created_before) q = q.lt("created_at", f.created_before);
            const { data: rows } = await q;
            const { data: conn } = await db.from("provider_connections").select("environment").eq("tenant_id", ctx.tenantId).eq("provider", "asaas").eq("status", "connected").limit(1).maybeSingle();
            if (conn?.environment !== "sandbox") {
              const { sandboxChargeView } = await import("@/lib/ext-sandbox.server");
              const base = (await import("@/lib/billing.server")).publicBaseUrl(null);
              const list = (rows ?? []).slice(0, f.limit);
              return extJson(ctx.requestId, { object: "list", has_more: (rows ?? []).length > f.limit, data: list.map((r) => sandboxChargeView(r, base)), request_id: ctx.requestId });
            }
          }
          let q = db.from("ext_checkout_sessions").select("charge_group_id, created_at").eq("tenant_id", ctx.tenantId).eq("integration_id", ctx.integrationId).order("created_at", { ascending: false }).limit(f.status ? 200 : f.limit + 1);
          if (f.external_customer_id) q = q.eq("external_customer_id", f.external_customer_id);
          if (f.created_before) q = q.lt("created_at", f.created_before);
          const { data: sessions } = await q;
          const { liveChargeView } = await import("@/lib/ext-read.server");
          const out = [];
          for (const s of sessions ?? []) {
            const v = await liveChargeView(ctx, s.charge_group_id);
            if (v && (!f.status || v.status === f.status)) out.push(v);
            if (out.length > f.limit) break;
          }
          return extJson(ctx.requestId, { object: "list", has_more: out.length > f.limit, data: out.slice(0, f.limit), request_id: ctx.requestId });
        });
      },
    },
  },
});
