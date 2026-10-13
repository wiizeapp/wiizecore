import { describe, expect, it } from "vitest";
import { canUseDashboardMockup, dashboardMockupData } from "./mockup-data";

describe("dashboard screenshot fixtures", () => {
  it("allows only the requested account", () => {
    expect(canUseDashboardMockup("caiowiize@gmail.com")).toBe(true);
    expect(canUseDashboardMockup("CAIOWIIZE@gmail.com")).toBe(true);
    expect(canUseDashboardMockup(undefined)).toBe(false);
    expect(canUseDashboardMockup("other@example.com")).toBe(false);
  });
  it("fills every data source with isolated, local examples", () => {
    const data = dashboardMockupData({ start: new Date("2026-10-01"), end: new Date("2026-11-01"), prevStart: new Date("2026-09-01"), prevEnd: new Date("2026-10-01") }, (key) => key);
    expect(data.payments.length).toBeGreaterThan(200);
    expect(data.payments.every((row) => row.id.startsWith("mock-"))).toBe(true);
    expect(data.payments.some((row) => row.status === "paid")).toBe(true);
    expect(data.payments.some((row) => row.status === "overdue")).toBe(true);
    expect(data.payments.some((row) => row.status === "pending")).toBe(true);
    expect(data.payments.some((row) => row.subscription_id)).toBe(true);
    expect(data.extras.transactions).toHaveLength(5);
    expect(data.refunds[0]?.refund_amount).toBeGreaterThan(0);
  });
});