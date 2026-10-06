import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/charges/$id/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const api = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = await s.authenticateBearer(db, request, "charges.write");
        if (!tok) return api.apiJson({ error: "unauthorized" }, 401);
        if (!(await s.limit(db, "wiize_charges", tok.tenant_id, 60))) return api.apiJson({ error: "rate_limited" }, 429);
        if (!/^chg_[A-Za-z0-9_-]{10,40}$/.test(params.id)) return api.apiJson({ error: "not_found" }, 404);
        try {
          const r = await api.cancelWiizeCharge(db, tok.tenant_id, params.id, tok.user_id);
          return r ? api.apiJson(r) : api.apiJson({ error: "not_found" }, 404);
        } catch (e) {
          return api.apiJson({ error: "unprocessable", message: e instanceof Error ? e.message : "Erro" }, 409);
        }
      },
    },
  },
});
