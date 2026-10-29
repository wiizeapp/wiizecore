import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ lookupError: false, existing: false, valid: false, writes: 0, checks: 0 }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: (arg: unknown) => unknown) => fn };
  return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/mfa-middleware", () => ({ requireMfaAuth: {} }));
vi.mock("./crypto.server", () => ({ hashSecretValue: () => "synthetic-hash", verifySecretValue: () => { state.checks++; return state.valid; } }));
vi.mock("./audit.server", () => ({ consumeRateLimit: async () => ({ allowed: true }), logAudit: vi.fn(), logSecurityEvent: vi.fn(), resetRateLimit: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: state.existing ? { password_hash: "existing-synthetic-hash" } : null, error: state.lookupError ? { code: "fixture_lookup_failure" } : null }), upsert: async () => { state.writes++; return { error: null }; } };
  return chain;
} } }));
import { setFinancialPassword } from "./security.functions";
// Middleware is mocked: this reproduces handler behavior after authorization,
// not real authentication, database semantics, or a production credential change.
const invoke = setFinancialPassword as unknown as (arg: { data: { newPassword: string; currentPassword: null }; context: { userId: string } }) => Promise<unknown>;
const input = { data: { newPassword: "Synthetic-only-password!123", currentPassword: null }, context: { userId: "fixture-user" } };
beforeEach(() => Object.assign(state, { lookupError: false, existing: false, valid: false, writes: 0, checks: 0 }));
describe("adversarial retest — credential lifecycle, simulated dependencies", () => {
  it("positive security control: known credential cannot be replaced without current password", async () => {
    state.existing = true;
    await expect(invoke(input)).rejects.toThrow();
    expect(state.writes).toBe(0);
  });
  it("reproduces vulnerability: lookup error is treated as absence and reaches credential overwrite", async () => {
    state.lookupError = true;
    await expect(invoke(input)).resolves.toEqual({ ok: true });
    expect(state.checks).toBe(0);
    expect(state.writes).toBe(1);
  });
});