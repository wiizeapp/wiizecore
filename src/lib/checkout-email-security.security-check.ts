import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ written: false }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: (arg: unknown) => unknown) => fn };
  return chain;
} }));
vi.mock("./crypto.server", () => ({ tokenFingerprint: (s: string) => s }));
vi.mock("./audit.server", () => ({ consumeRateLimit: async () => ({ allowed: true }), requestInfo: () => ({ ip: "synthetic" }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const chain = { select: () => chain, eq: () => chain, update: () => { state.written = true; return chain; }, maybeSingle: async () => ({ data: table === "payment_links" ? { id: "fixture", tenant_id: "A", customer_id: "C", charge_group_id: "G", contract_id: null } : { email: "original@example.invalid" }, error: null }) };
  return chain;
} } }));
import { updateCheckoutCustomer } from "./checkout.functions";
describe("sibling checkout recipient protection", () => {
  it("link without contract cannot redirect the shared customer's email", async () => {
    const fn = updateCheckoutCustomer as unknown as (input: unknown) => Promise<unknown>;
    await expect(fn({ data: { token: "fixture-token", email: "replacement@example.invalid", state: "SP" } })).rejects.toThrow();
    expect(state.written).toBe(false);
  });
});