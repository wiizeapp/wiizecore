import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ ip: "203.0.113.1" as string | null, allowed: true, outage: false, auth: vi.fn(), logs: [] as unknown[], limits: [] as unknown[] }));
vi.mock("./crypto.server", () => ({ randomToken: () => "fixture", tokenFingerprint: () => "synthetic-hash" }));
vi.mock("./audit.server", () => ({ requestInfo: () => ({ ip: state.ip }), consumeRateLimit: async (_db: unknown, args: unknown) => { state.limits.push(args); if (state.outage) throw new Error("fixture outage"); return { allowed: state.allowed }; } }));
vi.mock("./ext-auth.server", () => ({ authenticateExtRequest: state.auth }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ insert: async (row: unknown) => { state.logs.push(row); return { error: null }; } }) } }));
import { withExtApi } from "./ext-api.server";
beforeEach(() => { state.ip = "203.0.113.1"; state.allowed = true; state.outage = false; state.logs = []; state.limits = []; state.auth.mockReset(); state.auth.mockResolvedValue({ ok: false, error: "invalid_key", status: 401 }); });
const run = () => withExtApi(new Request("https://fixture.test/api"), "/fixture", ["charges:read"], async () => new Response("unexpected"));
describe("external API preauth failures are closed and logged", () => {
  it("missing trusted IP denies before authentication", async () => { state.ip = null; expect((await run()).status).toBe(503); expect(state.auth).not.toHaveBeenCalled(); expect(state.logs).toHaveLength(1); });
  it("limiter outage never reaches authentication", async () => { state.outage = true; expect((await run()).status).toBe(500); expect(state.auth).not.toHaveBeenCalled(); expect(state.logs).toHaveLength(1); });
  it("preauth denial uses the shared 240-per-minute policy and logs", async () => { state.allowed = false; expect((await run()).status).toBe(429); expect(state.limits[0]).toMatchObject({ maxAttempts: 240, windowSeconds: 60 }); expect(state.auth).not.toHaveBeenCalled(); expect(state.logs).toHaveLength(1); });
  it("positive control: allowed IP reaches authentication, not handler for invalid key", async () => { expect((await run()).status).toBe(401); expect(state.auth).toHaveBeenCalledOnce(); expect(state.logs).toHaveLength(1); });
});