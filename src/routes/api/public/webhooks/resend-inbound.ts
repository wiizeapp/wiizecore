import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

/** Verifica a assinatura enviada pelo Resend (padrão Svix). */
function verify(secret: string, id: string, ts: string, sig: string, body: string) {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sig.split(" ").some((part) => {
    const v = Buffer.from(part.split(",")[1] ?? "", "base64");
    return v.length === expected.length && timingSafeEqual(v, expected);
  });
}

const Payload = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().min(1).max(200),
    from: z.string().max(500).optional(),
    to: z.array(z.string().max(500)).optional(),
    subject: z.string().max(1000).optional(),
  }).passthrough(),
});

const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export const Route = createFileRoute("/api/public/webhooks/resend-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RESEND_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        const id = request.headers.get("svix-id") ?? "";
        const ts = request.headers.get("svix-timestamp") ?? "";
        const sig = request.headers.get("svix-signature") ?? "";
        if (!id || !ts || !sig || !verify(secret, id, ts, sig, body)) return new Response("Invalid signature", { status: 401 });

        const parsed = Payload.safeParse(JSON.parse(body));
        if (!parsed.success) return new Response("Bad payload", { status: 400 });
        if (parsed.data.type !== "email.received") return new Response("ignored");
        const d = parsed.data.data;

        // O aviso não traz o conteúdo: buscamos a mensagem completa na API do Resend.
        let html = "", text = "";
        const apiKey = process.env["RESEND_API_KEY"];
        if (apiKey) {
          const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
          if (r.ok) {
            const full = (await r.json()) as { html?: string | null; text?: string | null };
            html = full.html ?? ""; text = full.text ?? "";
          } else console.error(`Resend receiving fetch failed [${r.status}]: ${await r.text()}`);
        }
        const links = Array.from(new Set((`${html} ${text}`.match(/https:\/\/[^\s"'<>)]+/g) ?? []).map((u) => u.replace(/&amp;/g, "&"))))
          .filter((u) => !/\.(png|jpe?g|gif|svg|css)(\?|$)/i.test(u)).slice(0, 20);

        const to = (d.to ?? []).map((t) => (t.match(/<([^>]+)>/)?.[1] ?? t).trim().toLowerCase());
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Descobre a empresa pelo e-mail exclusivo (conta-<hash>@...).
        let tenantId: string | null = null;
        const local = to.map((t) => t.split("@")[0]).find((l) => /^conta-[a-f0-9]{12}$/.test(l ?? ""));
        if (local) {
          const { data: tenants } = await supabaseAdmin.from("tenants").select("id");
          tenantId = (tenants ?? []).find((t) => `conta-${createHmac("sha256", "wiizepay-signup-email").update(t.id).digest("hex").slice(0, 12)}` === local)?.id ?? null;
        }
        const { error } = await supabaseAdmin.from("inbound_emails").upsert({
          provider_email_id: d.email_id, tenant_id: tenantId, to_address: to.join(", ").slice(0, 500),
          from_address: (d.from ?? "").slice(0, 500), subject: (d.subject ?? "").slice(0, 1000),
          text_body: (text || stripHtml(html)).slice(0, 20000), links,
        }, { onConflict: "provider_email_id", ignoreDuplicates: true });
        if (error) { console.error("inbound email save failed", error.message); return new Response("error", { status: 500 }); }
        return new Response("ok");
      },
    },
  },
});
