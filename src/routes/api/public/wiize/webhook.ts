import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAX_BODY = 64 * 1024;
const eventSchema = z.object({
  event_id: z.string().min(8).max(100),
  event_type: z.enum(["customer.created", "customer.updated", "sale.created", "connection.revoked"]),
  timestamp: z.string().max(40),
  organization_id: z.string().min(1).max(100),
  resource_id: z.string().max(100),
  resource_type: z.string().max(40),
  data: z.record(z.string(), z.unknown()).optional(),
});

/** Avisos recebidos do Wiize: assinatura, horário e repetição verificados antes de qualquer ação. */
export const Route = createFileRoute("/api/public/wiize/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const s = await import("@/lib/wiize-integration.server");
        const cfg = s.wiizeConfig();
        if (!cfg.webhookSecret) return new Response("Not configured", { status: 503 });
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX_BODY) return new Response("Too large", { status: 413 });
        const body = await request.text();
        if (body.length > MAX_BODY) return new Response("Too large", { status: 413 });
        const ts = request.headers.get("x-wiize-timestamp");
        const sig = request.headers.get("x-wiize-signature");
        const db = await s.getAdmin();
        if (!s.validateTimestamp(ts) || !s.validateSignature(cfg.webhookSecret, ts!, body, sig)) {
          await s.audit(db, { action: "wiize.webhook.bad_signature", outcome: "denied", ip: request.headers.get("cf-connecting-ip") });
          return new Response("Invalid signature", { status: 401 });
        }
        let evt: z.infer<typeof eventSchema>;
        try { evt = eventSchema.parse(JSON.parse(body)); } catch { return new Response("Bad payload", { status: 400 }); }
        const { error: dup } = await db.from("wiize_inbound_events").insert({ event_id: evt.event_id, event_type: evt.event_type });
        if (dup) return new Response("ok"); // repetido: já processado
        const { data: conn } = await db.from("wiize_connections").select("id, tenant_id").eq("wiize_organization_id", evt.organization_id).eq("status", "connected").maybeSingle();
        if (!conn) return new Response("ok");
        if (evt.event_type === "connection.revoked") {
          await db.from("wiize_tokens").delete().eq("connection_id", conn.id);
          await db.from("wiize_connections").update({ status: "disconnected", revoked_at: new Date().toISOString() }).eq("id", conn.id);
        }
        await s.audit(db, { tenantId: conn.tenant_id, action: "wiize.webhook.received", details: { type: evt.event_type } });
        return new Response("ok");
      },
    },
  },
});
