import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ tenant: "A", email: "fixture@example.invalid", valid: true, rpcOk: true, consumed: false, expires: false, attempts: 0, sent: true, binding: "customer:synthetic-contract-token-123", payload: "", calls: [] as Record<string, unknown>[] }));
vi.mock("./crypto.server", () => ({ tokenFingerprint: (s: string) => s, encryptSecret: () => "encrypted-private-identity", hashSecretValue: () => "hashed-code", verifySecretValue: () => state.valid }));
vi.mock("./audit.server", () => ({ requestInfo: () => ({ ip: "fixture", userAgent: "fixture" }), consumeRateLimit: async () => ({ allowed: true }), logAudit: vi.fn() }));
vi.mock("./contract-docs.server", () => ({ parseSignatureInput: () => ({ mode: "typed" }), signatureColumns: () => ({ signature_mode: "typed" }), notifyContractSigned: vi.fn() }));
vi.mock("./email.server", () => ({ sendEmail: async () => ({ sent: state.sent }), maskEmail: () => "fi***@example.invalid" }));
import { finishPublicSigning, issueSigningCode } from "./contract-signing.server";
const input = { token: "synthetic-contract-token-123", source: "customer" as const, signerName: "Fixture Person", signerDocument: "00000000000", birthDate: "2000-01-01", signature: { mode: "typed" }, challengeId: "fixture-challenge", code: "123456" };
function query(table: string) {
  const filters: Record<string, unknown> = {}; let write = false;
  const execute = () => {
    if (write) return { data: null, error: null };
    let data: unknown = null;
    if (table === "contract_links") data = { tenant_id: "A", contract_id: "contract", expires_at: "2099-01-01" };
    if (table === "contracts" && filters["tenant_id"] === state.tenant) data = { id: "contract", tenant_id: state.tenant, customer_id: "customer", current_version: 1, title: "Fixture", status: "draft" };
    if (table === "customers") data = { email: state.email, document: "00000000000" };
    if (table === "contract_versions") data = { id: "version", content_hash: "content" };
    if (table === "contract_signature_challenges") data = { id: "fixture-challenge", binding_hash: state.binding, recipient: "fixture@example.invalid", code_hash: "hashed-code" };
    return { data, error: null };
  };
  const chain = { select() { return chain; }, eq(k: string, v: unknown) { filters[k] = v; return chain; }, insert() { write = true; return chain; }, update() { write = true; return chain; }, maybeSingle: async () => execute(), then(resolve: (r: unknown) => unknown) { return Promise.resolve(execute()).then(resolve); } };
  return chain;
}
const admin = { from: query, rpc: async (fn: string, args: Record<string, unknown>) => {
  state.calls.push(args);
  if (fn === "contract_signature_issue") return { data: "fixture-challenge", error: null };
  const ok = state.rpcOk && args["_valid"] && !state.consumed && !state.expires && state.attempts < 5;
  state.attempts++;
  if (ok) state.consumed = true;
  return { data: { ok, status: "awaiting_provider" }, error: null };
} };
beforeEach(() => { Object.assign(state, { tenant: "A", email: "fixture@example.invalid", valid: true, rpcOk: true, consumed: false, expires: false, attempts: 0, sent: true, binding: "customer:synthetic-contract-token-123", calls: [] }); });
describe("real signing service with isolated dependencies", () => {
  it("positive control signs and encrypts birthdate without recording code", async () => {
    await expect(finishPublicSigning(admin as never, input)).resolves.toEqual({ status: "awaiting_provider" });
    expect(state.calls[0]?.["_signature"]).toMatchObject({ identity_enc: "encrypted-private-identity" });
    expect(JSON.stringify(state.calls)).not.toContain("123456");
  });
  it("rejects foreign tenant", async () => { state.tenant = "B"; await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); expect(state.calls).toHaveLength(0); });
  it("rejects changed recipient", async () => { state.email = "other@example.invalid"; await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); expect(state.calls).toHaveLength(0); });
  it("rejects foreign capability", async () => { state.binding = "other"; await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); expect(state.calls).toHaveLength(0); });
  it("rejects wrong code", async () => { state.valid = false; await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); expect(state.calls[0]?.["_valid"]).toBe(false); });
  it("rejects expired code", async () => { state.expires = true; await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); });
  it("rejects reused code", async () => { await finishPublicSigning(admin as never, input); await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); });
  it("rejects exhausted attempts", async () => { state.attempts = 5; await expect(finishPublicSigning(admin as never, input)).rejects.toThrow(); });
  it("rejects missing birthdate", async () => { await expect(finishPublicSigning(admin as never, { ...input, birthDate: "" })).rejects.toThrow(); expect(state.calls).toHaveLength(0); });
  it("does not authorize failed delivery", async () => { state.sent = false; await expect(issueSigningCode(admin as never, input)).rejects.toThrow(); });
});