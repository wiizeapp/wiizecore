import { createFileRoute } from "@tanstack/react-router";

/** Recebe clientes do Wiize (novos ou editados). A empresa vem sempre do token, nunca do corpo. */
export const Route = createFileRoute("/api/public/v1/customers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const api = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = (await s.authenticateBearer(db, request, "customers.write")) ?? (await s.authenticateBearer(db, request, "charges.write"));
        if (!tok) {
          await s.audit(db, { action: "wiize_pay.api.unauthorized", outcome: "denied", ip: s.clientIp(request) });
          return api.apiJson({ error: "unauthorized" }, 401);
        }
        if (!(await s.limit(db, "wiize_customers", tok.tenant_id, 60))) return api.apiJson({ error: "rate_limited" }, 429);
        const raw = await request.text();
        if (raw.length > 262144) return api.apiJson({ error: "payload_too_large" }, 413);
        let parsed;
        try {
          const j = JSON.parse(raw);
          parsed = api.syncCustomersBody.safeParse(Array.isArray(j?.customers) ? j : { customers: [j] });
        } catch { return api.apiJson({ error: "invalid_json" }, 400); }
        if (!parsed.success) return api.apiJson({ error: "invalid_body", fields: parsed.error.issues.slice(0, 10).map((i) => i.path.join(".")) }, 422);
        const results = await api.upsertWiizeCustomers(db, tok, parsed.data.customers);
        return api.apiJson({ results }, 200);
      },
    },
  },
});
