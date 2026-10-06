import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z
  .object({
    id: z.string().min(1).max(200),
    event: z.string().min(1).max(100),
    payment: z.object({ id: z.string().min(1).max(100) }).passthrough().optional(),
  })
  .passthrough();

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("asaas-access-token") ?? "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const raw = await request.text();
        if (raw.length > 200_000) return new Response("Payload too large", { status: 413 });
        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { processWebhookEvent } = await import("@/lib/billing.server");
        const { decryptSecret } = await import("@/lib/crypto.server");

        const { tokenFingerprint } = await import("@/lib/crypto.server");
        const { data: conn } = await admin
          .from("provider_connections")
          .select("tenant_id, webhook_token_ciphertext")
          .eq("provider", "asaas")
          .eq("webhook_token_hash", tokenFingerprint(token))
          .not("webhook_token_ciphertext", "is", null);
        const matched = (conn ?? []).find((c) => {
          try {
            return c.webhook_token_ciphertext ? safeEqual(decryptSecret(c.webhook_token_ciphertext), token) : false;
          } catch {
            return false;
          }
        });
        if (!matched) return new Response("Unauthorized", { status: 401 });
        const tenantId = matched.tenant_id;

        const { data: inserted, error } = await admin
          .from("webhook_events")
          .insert({
            provider: "asaas",
            external_event_id: parsed.id,
            event_type: parsed.event,
            tenant_id: tenantId,
            payload: parsed as never,
            payload_hash: createHash("sha256").update(raw).digest("hex"),
          })
          .select("id")
          .single();

        let eventId = inserted?.id;
        if (error) {
          // Evento repetido (idempotência): reprocessa apenas se ainda não foi concluído.
          const { data: existing } = await admin
            .from("webhook_events")
            .select("id, processing_status")
            .eq("provider", "asaas")
            .eq("external_event_id", parsed.id)
            .maybeSingle();
          if (!existing) return new Response("error", { status: 500 });
          if (existing.processing_status === "processed" || existing.processing_status === "discarded") {
            return new Response("duplicate", { status: 200 });
          }
          eventId = existing.id;
        }

        await processWebhookEvent(admin, eventId!);
        return new Response("ok", { status: 200 });
      },
    },
  },
});
