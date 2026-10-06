import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";

/** Envia a fila de avisos para o Wiize. Chamado por tarefa agendada com o segredo do webhook. */
export const Route = createFileRoute("/api/public/wiize/deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-integration.server");
        const cfg = s.wiizeConfig();
        if (!cfg.configured || !cfg.webhookSecret) return new Response("Not configured", { status: 503 });
        const ts = request.headers.get("x-wiize-timestamp");
        const body = await request.text();
        if (!s.validateTimestamp(ts) || !s.validateSignature(cfg.webhookSecret, ts!, body, request.headers.get("x-wiize-signature"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const db = await s.getAdmin();
        const { data: events } = await db.from("wiize_outbound_events").select("*").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(50);
        let sent = 0;
        for (const e of events ?? []) {
          const { data: conn } = await db.from("wiize_connections").select("wiize_organization_id, status").eq("tenant_id", e.tenant_id).maybeSingle();
          if (conn?.status !== "connected") { await db.from("wiize_outbound_events").update({ status: "discarded" }).eq("id", e.id); continue; }
          const payload = JSON.stringify({
            event_id: e.id, event_type: e.event_type, timestamp: e.created_at, organization_id: conn.wiize_organization_id,
            resource_id: e.resource_id, resource_type: e.resource_type, data: e.payload,
          });
          const t = String(Math.floor(Date.now() / 1000));
          try {
            const res = await fetch(`${cfg.baseUrl}/api/v1/webhooks/wiizepay`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-WiizePay-Timestamp": t, "X-WiizePay-Signature": s.signPayload(cfg.webhookSecret, t, payload), "X-WiizePay-Nonce": randomUUID(), "Idempotency-Key": e.id },
              body: payload,
              redirect: "error",
            });
            if (!res.ok) throw new Error(String(res.status));
            await db.from("wiize_outbound_events").update({ status: "delivered", delivered_at: new Date().toISOString(), attempts: e.attempts + 1 }).eq("id", e.id);
            sent++;
          } catch (err) {
            const attempts = e.attempts + 1;
            await db.from("wiize_outbound_events").update({
              attempts, status: attempts >= 8 ? "failed" : "pending", last_error: err instanceof Error ? err.message.slice(0, 200) : "erro",
              next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** attempts) * 1000).toISOString(),
            }).eq("id", e.id);
          }
        }
        return Response.json({ sent });
      },
    },
  },
});
