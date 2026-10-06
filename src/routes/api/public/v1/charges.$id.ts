import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/charges/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const { apiJson } = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = await s.authenticateBearer(db, request, "charges.write");
        if (!tok) return apiJson({ error: "unauthorized" }, 401);
        if (!(await s.limit(db, "wiize_charges_read", tok.tenant_id, 120))) return apiJson({ error: "rate_limited" }, 429);
        if (!/^chg_[A-Za-z0-9_-]{10,40}$/.test(params.id)) return apiJson({ error: "not_found" }, 404);
        const { data: c } = await db.from("wiize_charges").select("public_id, status").eq("tenant_id", tok.tenant_id).eq("public_id", params.id).maybeSingle();
        if (!c) return apiJson({ error: "not_found" }, 404);
        return apiJson({ id: c.public_id, status: c.status });
      },
    },
  },
});
