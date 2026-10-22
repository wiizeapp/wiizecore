import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/resend-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleResendInbound } = await import("@/lib/resend-inbound.server");
        // Lazily loaded: invalid/irrelevant events never access private data.
        const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
        return handleResendInbound(request, {
          secret: process.env["RESEND_WEBHOOK_SECRET"],
          apiKey: process.env["RESEND_API_KEY"],
          exists: async (emailId) => {
            const { data, error } = await (await db()).from("inbound_emails").select("id").eq("provider_email_id", emailId).maybeSingle();
            if (error) throw new Error("inbound_lookup_failed");
            return Boolean(data);
          },
          resolveTenant: async (local) => {
            const { createHmac } = await import("node:crypto");
            const { data, error } = await (await db()).from("tenants").select("id");
            if (error) throw new Error("tenant_lookup_failed");
            return (data ?? []).find((t) => `conta-${createHmac("sha256", "wiizepay-signup-email").update(t.id).digest("hex").slice(0, 12)}` === local)?.id ?? null;
          },
          save: async (record) => {
            const { error } = await (await db()).from("inbound_emails").upsert(record, { onConflict: "provider_email_id", ignoreDuplicates: true });
            if (error) throw new Error("inbound_save_failed");
          },
        });
      },
    },
  },
});
