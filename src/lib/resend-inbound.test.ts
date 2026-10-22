import { describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { handleResendInbound } from "./resend-inbound.server";

// Public test fixture only; never uses environment/provider credentials.
const secret = `whsec_${Buffer.from("isolated-test-fixture-not-a-production-secret").toString("base64")}`;
function request(type = "email.received", date = new Date(), extraSignature = "") {
  const body = JSON.stringify({ type, data: { email_id: "fixture-email", from: "sender@example.test", to: ["Inbox <conta-abcdef123456@example.test>"], subject: "Fixture" } });
  return new Request("https://example.test/api/public/webhooks/resend-inbound", {
    method: "POST", body, headers: {
      "svix-id": "fixture-event", "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
      "svix-signature": extraSignature + new Webhook(secret).sign("fixture-event", date, body),
    },
  });
}
function dependencies() {
  return {
    secret, apiKey: "isolated-test-credential",
    exists: vi.fn(async () => false), resolveTenant: vi.fn(async () => "tenant-fixture"),
    save: vi.fn(async () => {}),
    fetch: vi.fn(async () => Response.json({ html: "<p>Message</p>", text: "Message https://example.test/document" })),
  };
}
describe("Resend inbound", () => {
  it("stores a valid received message and its tenant only after verification", async () => {
    const deps = dependencies();
    expect((await handleResendInbound(request(), deps)).status).toBe(200);
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ provider_email_id: "fixture-email", tenant_id: "tenant-fixture", text_body: "Message https://example.test/document" }));
    expect(deps.resolveTenant).toHaveBeenCalledWith("conta-abcdef123456");
  });
  it("rejects altered raw content before accessing private data", async () => {
    const deps = dependencies(), original = request();
    const modified = new Request(original.url, { method: "POST", headers: original.headers, body: (await original.text()).replace("Fixture", "Altered") });
    expect((await handleResendInbound(modified, deps)).status).toBe(401);
    expect(deps.exists).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("rejects missing signature headers", async () => {
    const deps = dependencies();
    expect((await handleResendInbound(new Request("https://example.test", { method: "POST", body: "{}" }), deps)).status).toBe(401);
    expect(deps.exists).not.toHaveBeenCalled();
  });
  it("rejects an expired signature", async () => {
    const deps = dependencies();
    expect((await handleResendInbound(request("email.received", new Date(Date.now() - 301_000)), deps)).status).toBe(401);
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("accepts a valid signature among multiple rotation signatures", async () => {
    const deps = dependencies();
    expect((await handleResendInbound(request("email.received", new Date(), "v1,invalid "), deps)).status).toBe(200);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });
  it.each(["email.sent", "email.delivered"])("acknowledges %s without accessing the inbox", async (type) => {
    const deps = dependencies();
    const response = await handleResendInbound(request(type), deps);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ignored");
    expect(deps.exists).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("acknowledges a duplicate without fetching or saving again", async () => {
    const deps = dependencies(); deps.exists.mockResolvedValue(true);
    expect((await handleResendInbound(request(), deps)).status).toBe(200);
    expect(deps.fetch).not.toHaveBeenCalled(); expect(deps.save).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 429, 500])("retries receiving failure %s without saving an empty message", async (status) => {
    const deps = dependencies(); deps.fetch.mockResolvedValue(new Response("private provider body", { status }));
    const response = await handleResendInbound(request(), deps);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("retries timeouts without saving", async () => {
    const deps = dependencies(); deps.fetch.mockRejectedValue(new Error("timeout"));
    expect((await handleResendInbound(request(), deps)).status).toBe(503);
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("retries missing content fields instead of saving an incomplete message", async () => {
    const deps = dependencies(); deps.fetch.mockResolvedValue(Response.json({}));
    expect((await handleResendInbound(request(), deps)).status).toBe(503);
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("retries database save failures", async () => {
    const deps = dependencies(); deps.save.mockRejectedValue(new Error("database"));
    expect((await handleResendInbound(request(), deps)).status).toBe(503);
  });
  it("retries missing receiving configuration", async () => {
    const deps = { ...dependencies(), apiKey: undefined };
    expect((await handleResendInbound(request(), deps)).status).toBe(503);
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("reports missing signing configuration without accessing private data", async () => {
    const deps = { ...dependencies(), secret: undefined };
    expect((await handleResendInbound(request(), deps)).status).toBe(503);
    expect(deps.exists).not.toHaveBeenCalled();
  });
});