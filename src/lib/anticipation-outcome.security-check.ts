import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ timeout: false, statuses: [] as string[] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const c = { middleware: () => c, inputValidator: () => c, handler: (fn: unknown) => fn }; return c; } }));
vi.mock("./mfa-middleware", () => ({ requireMfaAuth: {} }));
vi.mock("./member-access.server", () => ({ requireModulePerm: async () => undefined }));
vi.mock("./audit.server", () => ({ logAudit: vi.fn() }));
vi.mock("./finance.server", () => ({ assertTwoFactor: vi.fn(), assertFinancialPassword: async () => undefined }));
vi.mock("./activation.server", () => ({ assertCanReceivePayments: async () => undefined }));
vi.mock("./anticipation.server", () => ({ simulateAnticipationFor: async () => ({ simulation: { paymentId: "payment", netAmount: 60, wiizeFee: 1, providerFee: 1 } }) }));
vi.mock("./financial-origin.server", () => ({ getPaymentProvider: async () => ({ provider: { createAnticipation: async () => { if (state.timeout) throw new Error("synthetic uncertainty"); return { id: "synthetic", status: "PENDING" }; } } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => { const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: null }), insert: (row: { status: string }) => { state.statuses.push(row.status); return c; }, update: (row: { status?: string; anticipation_status?: string }) => { const s = row.status ?? row.anticipation_status; if (s) state.statuses.push(s); return c; }, single: async () => ({ data: table === "payments" ? { provider_payment_id: "synthetic" } : { id: "request" }, error: null }), then: (resolve: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; return c; } } }));
import { requestAnticipation } from "./anticipation.functions";
const member = { from: () => { const c = { select: () => c, eq: () => c, limit: () => c, maybeSingle: async () => ({ data: { tenant_id: "tenant", role: "owner" } }) }; return c; } };
const run = () => (requestAnticipation as unknown as (input: unknown) => Promise<unknown>)({ context: { userId: "user", claims: { aal: "aal2" }, supabase: member }, data: { paymentId: "payment", expectedNet: 60, financialPassword: "synthetic", idempotencyKey: "fixture-key" } });
beforeEach(() => { state.timeout = false; state.statuses = []; });
describe("anticipation uncertainty preserves admission", () => {
  it("provider error does not mark failed or unlock payment", async () => { state.timeout = true; await expect(run()).resolves.toEqual({ id: "request", status: "pending" }); expect(state.statuses).toEqual(["pending", "pending"]); });
  it("positive control: successful submission advances processing", async () => { await expect(run()).resolves.toEqual({ id: "request", status: "processing" }); expect(state.statuses).toEqual(["pending", "pending", "processing", "processing"]); });
});