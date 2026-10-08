import { createFileRoute } from "@tanstack/react-router";

/** Serviços ativos da empresa conectada. A empresa vem do token. */
export const Route = createFileRoute("/api/public/v1/services")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const api = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = await s.authenticateBearer(db, request, "charges.write");
        if (!tok) return api.apiJson({ error: "unauthorized" }, 401);
        if (!(await s.limit(db, "wiize_list", tok.tenant_id, 240))) return api.apiJson({ error: "rate_limited" }, 429);
        const { data } = await db.from("services").select("id, name, amount, type, installments, accepted_methods")
          .eq("tenant_id", tok.tenant_id).eq("active", true).order("created_at", { ascending: false }).limit(100);
        return api.apiJson({ data: (data ?? []).map((v) => ({ ...v, amount_cents: Math.round(Number(v.amount) * 100), amount: undefined })) });
      },
    },
  },
});
