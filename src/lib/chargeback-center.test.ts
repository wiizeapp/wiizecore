import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), from: vi.fn(), provider: vi.fn(), audit: vi.fn() }));
vi.mock("./member-access.server", () => ({ requireModulePerm: mocks.permission }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./billing.server", () => ({ getTenantProvider: mocks.provider }));
vi.mock("./audit.server", () => ({ logAudit: mocks.audit }));
import { caseAccess, readCases, sendDefense } from "./chargeback-center.server";
describe("acesso às contestações", () => {
  beforeEach(() => vi.resetAllMocks());
  it("bloqueia membro sem permissão antes de ler dados", async () => {
    mocks.permission.mockRejectedValue(new Error("denied"));
    await expect(readCases("user-a", 1)).rejects.toThrow("denied");
    expect(mocks.permission).toHaveBeenCalledWith("user-a", "charges.view");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("filtra o caso pela empresa da sessão e bloqueia caso de outra empresa", async () => {
    mocks.permission.mockResolvedValue({ tenantId: "tenant-a", permissions: [] });
    const eq = vi.fn();
    const query = { select: vi.fn(), eq, maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    query.select.mockReturnValue(query); eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    await expect(caseAccess("user-a", "case-b")).rejects.toThrow("Contestação não encontrada.");
    expect(eq).toHaveBeenCalledWith("tenant_id", "tenant-a");
    expect(eq).toHaveBeenCalledWith("id", "case-b");
  });
  it("exige permissão de edição para alterar documentos", async () => {
    mocks.permission.mockRejectedValue(new Error("denied"));
    await expect(caseAccess("restricted", "case-a", true)).rejects.toThrow();
    expect(mocks.permission).toHaveBeenCalledWith("restricted", "charges.edit");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("não envia defesa quando a contestação não pertence à sessão", async () => {
    mocks.permission.mockResolvedValue({ tenantId: "tenant-a", permissions: ["charges.edit", "charges.view"] });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    await expect(sendDefense("user-a", "case-b")).rejects.toThrow("Contestação não encontrada.");
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});