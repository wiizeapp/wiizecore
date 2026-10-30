import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email.server";
const patches: unknown[] = [];
const db = { from: () => {
  const chain = { insert: () => chain, select: () => chain, single: async () => ({ data: { id: "fixture" }, error: null }), update: (patch: unknown) => { patches.push(patch); return chain; }, eq: async () => ({ error: null }) };
  return chain;
} };
const opts = { tenantId: null, kind: "fixture", dedupeKey: "fixture-only", email: { to: "fixture@example.invalid", subject: "fixture", title: "fixture", intro: "fixture" } };
beforeEach(() => { patches.length = 0; vi.stubEnv("RESEND_API_KEY", "synthetic-fixture-only"); });
describe("email failure redaction", () => {
  it("provider response body is never stored on delivery failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic-sensitive-body", { status: 400 })));
    await sendEmail(db as never, opts);
    expect(patches).toContainEqual({ status: "failed", error_message: "Email delivery failed (400)" });
    expect(JSON.stringify(patches)).not.toContain("synthetic-sensitive-body");
  });
  it("network exception content is never stored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("synthetic-sensitive-exception"); }));
    await sendEmail(db as never, opts);
    expect(patches).toContainEqual({ status: "failed", error_message: "Email delivery unavailable" });
    expect(JSON.stringify(patches)).not.toContain("synthetic-sensitive-exception");
  });
});