import { createFileRoute } from "@tanstack/react-router";

/** Contratos existentes de um cliente do Wiize. A empresa vem do token. */
export const Route = createFileRoute("/api/public/v1/contracts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const api = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = await s.authenticateBearer(db, request, "charges.write");
        if (!tok) return api.apiJson({ error: "unauthorized" }, 401);
        if (!(await s.limit(db, "wiize_list", tok.tenant_id, 240))) return api.apiJson({ error: "rate_limited" }, 429);
        const lead = new URL(request.url).searchParams.get("lead_id") ?? "";
        if (!lead || lead.length > 120) return api.apiJson({ error: "lead_id obrigatório." }, 400);
        const { data: l } = await db.from("wiize_customer_links").select("customer_id").eq("tenant_id", tok.tenant_id).eq("wiize_customer_id", lead).maybeSingle();
        if (!l) return api.apiJson({ data: [] });
        const { data } = await db.from("contracts").select("id, title, amount, status, service_id, starts_on, ends_on")
          .eq("tenant_id", tok.tenant_id).eq("customer_id", l.customer_id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50);
        return api.apiJson({ data: (data ?? []).map((c) => ({ ...c, amount_cents: Math.round(Number(c.amount) * 100), amount: undefined })) });
      },
    },
  },
});
