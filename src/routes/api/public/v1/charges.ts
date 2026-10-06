import { createFileRoute } from "@tanstack/react-router";

/** API de cobranças usada pelo Wiize. A empresa vem sempre do token, nunca do corpo. */
export const Route = createFileRoute("/api/public/v1/charges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-pay-oauth.server");
        const api = await import("@/lib/wiize-pay-api.server");
        const db = await s.getAdmin();
        const tok = await s.authenticateBearer(db, request, "charges.write");
        if (!tok) {
          await s.audit(db, { action: "wiize_pay.api.unauthorized", outcome: "denied", ip: s.clientIp(request) });
          return api.apiJson({ error: "unauthorized" }, 401);
        }
        if (!(await s.limit(db, "wiize_charges", tok.tenant_id, 60))) return api.apiJson({ error: "rate_limited" }, 429);
        const key = request.headers.get("idempotency-key");
        if (!key || key.length > 120 || !/^[A-Za-z0-9_\-:.]+$/.test(key)) return api.apiJson({ error: "Idempotency-Key obrigatório." }, 400);
        const raw = await request.text();
        if (raw.length > 32768) return api.apiJson({ error: "payload_too_large" }, 413);
        const checksum = request.headers.get("x-wiize-checksum");
        if (checksum) {
          const c = checksum.replace(/^sha256=/, "").toLowerCase();
          if (c !== s.sha256hex(raw)) return api.apiJson({ error: "checksum_mismatch" }, 400);
        }
        let parsed;
        try { parsed = api.chargeBody.safeParse(JSON.parse(raw)); } catch { return api.apiJson({ error: "invalid_json" }, 400); }
        if (!parsed.success) return api.apiJson({ error: "invalid_body", fields: parsed.error.issues.slice(0, 10).map((i) => i.path.join(".")) }, 422);
        try {
          const r = await api.createWiizeCharge(db, request, tok, key, checksum, parsed.data);
          return api.apiJson(r.body, r.status);
        } catch (e) {
          // Não devolve detalhes internos ao chamador; registra só no servidor.
          console.error("wiize charge failed", e instanceof Error ? e.message : e);
          const msg = e instanceof Error && /^[A-ZÀ-Ú][^\n]{0,160}$/.test(e.message) && !/(relation|column|violates|syntax|postgres|sql|supabase|constraint)/i.test(e.message) ? e.message : "Não foi possível criar a cobrança.";
          return api.apiJson({ error: "unprocessable", message: msg }, 422);
        }
      },
    },
  },
});
