import { createFileRoute } from "@tanstack/react-router";

/** Envia a fila de avisos da Integração Externa. Chamado pela tarefa agendada (senha do cron). */
export const Route = createFileRoute("/api/public/ext/deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWiizePayCron } = await import("@/lib/cron-auth.server");
        const denied = authenticateWiizePayCron(request);
        if (denied) return denied;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { deliverOne } = await import("@/lib/ext-webhooks.server");
        const { data: rows } = await db.from("ext_webhook_deliveries").select("id, endpoint_id, body, attempts").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(50);
        let delivered = 0;
        for (const r of rows ?? []) if ((await deliverOne(db, r)).ok) delivered += 1;
        return Response.json({ processed: rows?.length ?? 0, delivered });
      },
    },
  },
});
