import { Webhook } from "standardwebhooks";
import { z } from "zod";

const Payload = z.object({
  type: z.literal("email.received"),
  data: z.object({
    email_id: z.string().min(1).max(200),
    from: z.string().max(500).optional(),
    to: z.array(z.string().max(500)).max(100).optional(),
    subject: z.string().max(1000).optional(),
  }),
});
const Message = z.object({ html: z.string().nullable().optional(), text: z.string().nullable().optional() });
type InboundRecord = {
  provider_email_id: string; tenant_id: string | null; to_address: string;
  from_address: string; subject: string; text_body: string; links: string[];
};
type Dependencies = {
  secret: string | undefined;
  apiKey: string | undefined;
  exists: (emailId: string) => Promise<boolean>;
  resolveTenant: (local: string) => Promise<string | null>;
  save: (record: InboundRecord) => Promise<void>;
  fetch?: typeof globalThis.fetch;
};
const reply = (text: string, status = 200) => new Response(text, {
  status, headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "60" } : {}) },
});

/** Verifies raw bytes before any lookup; never acknowledges a failed content fetch. */
export async function handleResendInbound(request: Request, deps: Dependencies): Promise<Response> {
  if (!deps.secret) {
    console.error("resend_inbound: signing_configuration_missing");
    return reply("Not configured", 503);
  }
  let verifier: Webhook;
  try { verifier = new Webhook(deps.secret); }
  catch {
    console.error("resend_inbound: signing_configuration_invalid");
    return reply("Not configured", 503);
  }
  const body = await request.text();
  try {
    verifier.verify(body, {
      "webhook-id": request.headers.get("svix-id") ?? "",
      "webhook-timestamp": request.headers.get("svix-timestamp") ?? "",
      "webhook-signature": request.headers.get("svix-signature") ?? "",
    }, { jsonParse: false });
  } catch {
    console.warn("resend_inbound: signature_rejected");
    return reply("Invalid signature", 401);
  }
  let json: unknown;
  try { json = JSON.parse(body); } catch { return reply("Invalid payload", 400); }
  if (!json || typeof json !== "object" || !("type" in json)) return reply("Invalid payload", 400);
  // Sent/delivered events are acknowledged but are not inbox messages.
  if (json.type !== "email.received") return reply("ignored");
  const parsed = Payload.safeParse(json);
  if (!parsed.success) return reply("Invalid payload", 400);
  const d = parsed.data.data;
  try {
    if (await deps.exists(d.email_id)) return reply("ok");
    if (!deps.apiKey) {
      console.error("resend_inbound: receiving_configuration_missing");
      return reply("Receiving unavailable", 503);
    }
    const response = await (deps.fetch ?? globalThis.fetch)(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`,
      { headers: { Authorization: `Bearer ${deps.apiKey}` }, redirect: "error", signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
      // Response bodies may contain addresses or message contents; never log them.
      console.error("resend_inbound: receiving_fetch_failed", { status: response.status });
      return reply("Receiving unavailable", 503);
    }
    const full = Message.safeParse(await response.json());
    if (!full.success || !("html" in full.data || "text" in full.data)) {
      console.error("resend_inbound: receiving_payload_invalid");
      return reply("Receiving unavailable", 503);
    }
    const html = full.data.html ?? "", text = full.data.text ?? "";
    const links = Array.from(new Set((`${html} ${text}`.match(/https:\/\/[^\s"'<>)]+/g) ?? []).map((u) => u.replace(/&amp;/g, "&"))))
      .filter((u) => !/\.(png|jpe?g|gif|svg|css)(\?|$)/i.test(u)).slice(0, 20);
    const to = (d.to ?? []).map((t) => (t.match(/<([^>]+)>/)?.[1] ?? t).trim().toLowerCase());
    const local = to.map((t) => t.split("@")[0]).find((l) => /^conta-[a-f0-9]{12}$/.test(l ?? ""));
    const tenantId = local ? await deps.resolveTenant(local) : null;
    const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    await deps.save({
      provider_email_id: d.email_id, tenant_id: tenantId, to_address: to.join(", ").slice(0, 500),
      from_address: (d.from ?? "").slice(0, 500), subject: (d.subject ?? "").slice(0, 1000),
      text_body: (text || stripped).slice(0, 20000), links,
    });
    return reply("ok");
  } catch {
    console.error("resend_inbound: processing_failed");
    return reply("Temporarily unavailable", 503);
  }
}