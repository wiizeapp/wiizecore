import { describe, expect, it, vi } from "vitest";
import { syncAuthFromWebhook, checkoutThreeDsAllowed } from "./threeds.server";
describe("sincronização 3DS", () => {
  it("evento final repetido ou fora de ordem não reabre autenticação", async () => {
    const update = vi.fn();
    const q: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }), update };
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.in.mockReturnValue(q);
    const admin: any = { from: vi.fn().mockReturnValue(q) };
    await syncAuthFromWebhook(admin, { tenantId: "tenant-a", connectionId: "conn-a", providerPaymentId: "pay", eventType: "PAYMENT_CONFIRMED", externalEventId: "evt" });
    expect(q.eq).toHaveBeenCalledWith("tenant_id", "tenant-a");
    expect(q.eq).toHaveBeenCalledWith("provider_connection_id", "conn-a");
    expect(q.in).toHaveBeenCalledWith("status", ["started", "challenge_redirected", "returned"]);
    expect(update).not.toHaveBeenCalled();
  });
  it("mesmo identificador de evento não escreve duas vezes", async () => {
    const q: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "a", status: "started", external_event_id: "evt" } }), update: vi.fn() };
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.in.mockReturnValue(q);
    await syncAuthFromWebhook({ from: () => q } as any, { tenantId: "t", connectionId: "c", providerPaymentId: "p", eventType: "PAYMENT_CONFIRMED", externalEventId: "evt" });
    expect(q.update).not.toHaveBeenCalled();
  });
  it("flag desligado preserva checkout sem leitura do controle", async () => {
    vi.stubEnv("CHECKOUT_3DS_ENABLED", "false"); const from = vi.fn();
    expect(await checkoutThreeDsAllowed({ from } as any)).toBe(false); expect(from).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
});