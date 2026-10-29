import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ assert: vi.fn(), from: vi.fn(), audit: vi.fn() }));
vi.mock("./admin-session.server", () => ({ assertAdminPage: mocks.assert }));
vi.mock("./audit.server", () => ({ logAudit: mocks.audit }));
import { readAdminChargebacks, readAdminCaseHistory, setAdminThreeDs } from "./admin-chargebacks.server";
const context = { userId: "user", claims: {}, supabase: { rpc: vi.fn() } };
describe("chargebacks administrativos", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CHECKOUT_3DS_ENABLED", "false"); });
  it("bloqueia listagem sem desbloqueio Admin antes de ler dados", async () => {
    mocks.assert.mockRejectedValue(new Error("locked"));
    await expect(readAdminChargebacks(context, { page: 0 })).rejects.toThrow("locked");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("protege também histórico e alteração do controle", async () => {
    mocks.assert.mockRejectedValue(new Error("locked"));
    await expect(readAdminCaseHistory(context, "case")).rejects.toThrow("locked");
    await expect(setAdminThreeDs(context, false, false)).rejects.toThrow("locked");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("recusa liberação quando o ambiente está desligado", async () => {
    mocks.assert.mockResolvedValue({ admin: { from: mocks.from } });
    await expect(setAdminThreeDs(context, true, true)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("recusa liberação sem confirmação explícita", async () => {
    vi.stubEnv("CHECKOUT_3DS_ENABLED", "true");
    mocks.assert.mockResolvedValue({ admin: { from: mocks.from } });
    await expect(setAdminThreeDs(context, true, false)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("permite desativar e audita a operação", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert }); mocks.assert.mockResolvedValue({ admin: { from: mocks.from } });
    await expect(setAdminThreeDs(context, false, false)).resolves.toEqual({ allowed: false });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ allowed: false, updated_by: "user" }));
    expect(mocks.audit).toHaveBeenCalled();
  });
  it("aplica filtro de empresa e não retorna campos privados", async () => {
    const selected: string[] = [], filters: unknown[][] = [];
    mocks.from.mockImplementation((table: string) => {
      const value = table === "chargeback_cases" ? { data: [], count: 0, error: null } : table === "checkout_3ds_control" ? { data: null, error: null } : { data: [], error: null };
      const q: any = { then: (resolve: (v: unknown) => void) => Promise.resolve(value).then(resolve) };
      for (const k of ["select", "eq", "order", "range", "limit", "maybeSingle"]) q[k] = (...args: unknown[]) => { if (k === "select") selected.push(String(args[0])); if (k === "eq") filters.push(args); return q; };
      return q;
    });
    mocks.assert.mockResolvedValue({ admin: { from: mocks.from } });
    const r = await readAdminChargebacks(context, { page: 0, tenantId: "tenant-a" });
    expect(filters.filter(f => f[0] === "tenant_id" && f[1] === "tenant-a")).toHaveLength(2);
    for (const projection of selected) { expect(projection).not.toContain("*"); expect(projection).not.toContain("error_message"); expect(projection).not.toContain("storage_path"); expect(projection).not.toContain("correlation_id"); }
    expect(r.control.effective).toBe(false);
  });
});