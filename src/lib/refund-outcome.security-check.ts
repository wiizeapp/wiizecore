import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ timeout: false, calls: [] as string[], audit: vi.fn() }));
vi.mock("./financial-origin.server", () => ({ getPaymentProvider: async () => ({ provider: { getPayment: async () => ({}), refundPayment: async () => { if (state.timeout) throw new Error("synthetic provider error"); return { status: "REFUNDED" }; } } }) }));
vi.mock("./coproduction.server", () => ({ refundSharesFor: async () => [] }));
vi.mock("./audit.server", () => ({ logAudit: state.audit }));
import { sendRefundToProvider } from "./refunds.server";
const db = {
  from: (table: string) => { const q = { select: () => q, eq: () => q, single: async () => ({ data: table === "refunds" ? { id: "refund", tenant_id: "tenant", payment_id: "payment", status: "requested", refund_amount: "40.00", reason: "fixture" } : { provider_payment_id: "synthetic" } }) }; return q; },
  rpc: async (_name: string, args: { _status: string }) => { state.calls.push(args._status); return { error: null }; },
};
beforeEach(() => { state.timeout = false; state.calls = []; state.audit.mockClear(); });
describe("refund outcome is not a rejection or webhook", () => {
  it("transport uncertainty never releases the reservation", async () => {
    state.timeout = true;
    await sendRefundToProvider(db as never, "refund");
    expect(state.calls).toEqual([]);
    expect(state.audit).toHaveBeenCalledWith(db, expect.objectContaining({ metadata: { code: "provider_outcome_unknown" } }));
  });
  it("synchronous refunded response does not finalize money", async () => {
    await sendRefundToProvider(db as never, "refund");
    expect(state.calls).toEqual(["processing"]);
  });
});