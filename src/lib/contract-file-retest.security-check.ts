import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: "awaiting_customer", replaced: false, hashUpdateFailed: false }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: (arg: unknown) => unknown) => fn };
  return chain;
} }));
vi.mock("@/lib/mfa-middleware", () => ({ requireMfaAuth: {} }));
vi.mock("./member-access.server", () => ({ requireModulePerm: async () => undefined }));
vi.mock("./audit.server", () => ({ logAudit: vi.fn(), consumeRateLimit: vi.fn(), requestInfo: vi.fn() }));
vi.mock("./contracts.functions", () => ({ contractEvent: vi.fn() }));
vi.mock("pdf-lib", () => ({ PDFDocument: { load: async () => ({}) } }));
vi.mock("./contract-docs.server", () => ({ writeContractFile: async () => { state.replaced = true; return { sha256: "replacement-hash" }; } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  let write = false;
  const chain = { select: () => chain, eq: () => chain, update: () => { write = true; return chain; }, maybeSingle: async () => ({ data: { id: "contract", title: "Synthetic", current_version: 1, status: state.status } }), then: (resolve: (r: unknown) => unknown) => {
    if (table === "contract_versions" && write) state.hashUpdateFailed = true;
    return Promise.resolve({ error: { message: "Signed version is immutable" } }).then(resolve);
  } };
  return chain;
} } }));
import { attachContractFile } from "./contract-docs.functions";
const membership = { from: () => {
  const chain = { select: () => chain, eq: () => chain, limit: () => chain, maybeSingle: async () => ({ data: { tenant_id: "fixture-tenant", role: "finance" } }) };
  return chain;
} };
const invoke = attachContractFile as unknown as (arg: unknown) => Promise<unknown>;
const input = { data: { contractId: "contract", fileName: "synthetic.pdf", format: "pdf", base64: Buffer.from("%PDF-synthetic-only").toString("base64") }, context: { userId: "fixture-user", supabase: membership } };
beforeEach(() => Object.assign(state, { status: "awaiting_customer", replaced: false, hashUpdateFailed: false }));
describe("adversarial retest — original file, mocked storage and authorization", () => {
  it("positive security control: fully signed contract refuses replacement", async () => {
    state.status = "signed";
    await expect(invoke(input)).rejects.toThrow();
    expect(state.replaced).toBe(false);
  });
  it("reproduces vulnerability: partial signature permits replacement and ignores frozen-hash error", async () => {
    await expect(invoke(input)).resolves.toEqual({ sha256: "replacement-hash" });
    expect(state.replaced).toBe(true);
    expect(state.hashUpdateFailed).toBe(true);
  });
});