import { describe, expect, it } from "vitest";
import { claimRecoveryCode } from "./recovery-code.server";
import { canAssignCustomRole, scopedRolePermissions } from "./team-role-policy";
import { assertCheckoutReady, checkoutReadiness } from "./checkout-readiness.server";
import { withIdempotency } from "./ext-idempotency.server";
import type { ExtCtx } from "./ext-api.server";

type Result = { data: unknown; error: unknown };
function mockDb(resolve: (table: string, filters: Record<string, unknown>, operation: string, value: unknown) => Result | Promise<Result>) {
  return { from(table: string) {
    const filters: Record<string, unknown> = {};
    let operation = "read", value: unknown;
    const run = () => resolve(table, filters, operation, value);
    const chain = {
      select() { return chain; }, limit() { return chain; },
      eq(key: string, val: unknown) { filters[key] = val; return chain; },
      is(key: string, val: unknown) { filters[key] = val; return chain; },
      contains(key: string, val: unknown) { filters[key] = val; return chain; },
      update(val: unknown) { operation = "update"; value = val; return chain; },
      insert(val: unknown) { operation = "insert"; value = val; return chain; },
      delete() { operation = "delete"; return chain; },
      maybeSingle: run,
      then(onfulfilled: (result: Result) => unknown, onrejected?: (reason: unknown) => unknown) { return Promise.resolve(run()).then(onfulfilled, onrejected); },
    };
    return chain;
  } } as unknown as ExtCtx["db"];
}

describe("código reserva de uso único", () => {
  it("duas operações concorrentes só consomem o código uma vez", async () => {
    let used = false;
    const db = mockDb((_table, filters) => {
      expect(filters).toEqual({ id: "code", user_id: "A", used_at: null });
      if (used) return { data: null, error: null };
      used = true; return { data: { id: "code" }, error: null };
    });
    const results = await Promise.allSettled([claimRecoveryCode(db, "code", "A"), claimRecoveryCode(db, "code", "A")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("erro ao consumir nunca autoriza remoção do segundo fator", async () => {
    await expect(claimRecoveryCode(mockDb(() => ({ data: null, error: { code: "down" } })), "code", "A")).rejects.toThrow();
  });
});

describe("permissões por empresa", () => {
  it("A não pode atribuir cargo da empresa B", () => expect(canAssignCustomRole("A", ["charges.create"], { tenant_id: "B", permissions: ["charges.create"] })).toBe(false));
  it("não concede permissão que o concedente não possui", () => expect(canAssignCustomRole("A", ["team.manage"], { tenant_id: "A", permissions: ["charges.create"] })).toBe(false));
  it("aceita cargo local com subconjunto permitido", () => expect(canAssignCustomRole("A", ["team.manage", "charges.create"], { tenant_id: "A", permissions: ["charges.create"] })).toBe(true));
  it("cargo estrangeiro legado não contribui para acesso", () => expect(scopedRolePermissions("A", { tenant_id: "B", permissions: ["team.manage"] })).toEqual([]));
});

const link = { tenant_id: "A", charge_group_id: "group", customer_id: "customer", contract_id: "contract" };
function readinessDb(opts: { confirmed?: boolean; signature?: boolean; version?: string; error?: boolean } = {}) {
  return mockDb((table, filters) => {
    if (opts.error) return { data: null, error: { code: "down" } };
    if (table === "checkout_events") {
      expect(filters).toMatchObject({ tenant_id: "A", charge_group_id: "group", customer_id: "customer", event: "data_confirmed", metadata: { termsAccepted: true } });
      return { data: opts.confirmed ? { id: "event" } : null, error: null };
    }
    if (table === "contracts") return { data: { id: "contract", status: "signed", current_version: 2 }, error: null };
    if (table === "contract_versions") { expect(filters["version"]).toBe(2); return { data: { id: "v2", content_hash: "hash2" }, error: null }; }
    if (table === "contract_signatures") return { data: opts.signature && filters["contract_version_id"] === (opts.version ?? "v2") ? { id: "signature" } : null, error: null };
    throw new Error("unexpected table");
  });
}
describe("ordem obrigatória do checkout", () => {
  it("sem confirmação dos dados e termos não paga", async () => await expect(assertCheckoutReady(readinessDb(), link)).rejects.toThrow());
  it("contrato vigente não assinado não paga", async () => await expect(assertCheckoutReady(readinessDb({ confirmed: true }), link)).rejects.toThrow());
  it("assinatura de versão antiga não libera pagamento", async () => expect(await checkoutReadiness(readinessDb({ confirmed: true, signature: true, version: "v1" }), link)).toBe(false));
  it("confirmação e assinatura atual liberam pagamento", async () => expect(await checkoutReadiness(readinessDb({ confirmed: true, signature: true }), link)).toBe(true));
  it("sem contrato ainda exige dados e termos", async () => expect(await checkoutReadiness(readinessDb({ confirmed: true }), { ...link, contract_id: null })).toBe(true));
  it("erro de consulta falha fechado", async () => expect(await checkoutReadiness(readinessDb({ error: true }), link)).toBe(false));
});

describe("reserva antes dos efeitos externos", () => {
  function setup() {
    let row: Record<string, unknown> | null = null;
    const db = mockDb((_table, _filters, operation, value) => {
      if (operation === "insert") {
        if (row) return { data: null, error: { code: "23505" } };
        row = { ...(value as object), id: "claim", state: "in_progress" }; return { data: row, error: null };
      }
      if (operation === "update") { row = { ...row, ...(value as object) }; return { data: row, error: null }; }
      if (operation === "delete") { row = null; return { data: null, error: null }; }
      return { data: row, error: null };
    });
    const ctx: ExtCtx = { db, tenantId: "A", integrationId: "integration", environment: "test", requestId: "r", createdBy: "A", scopes: [] };
    const request = new Request("https://example.test", { headers: { "idempotency-key": "test-key-123" } });
    return { ctx, request };
  }
  it("corpo adulterado nunca executa o efeito", async () => {
    const { ctx, request } = setup(); let calls = 0;
    const run = async () => { calls++; return Response.json({ ok: true }); };
    await withIdempotency(ctx, request, "checkout", { customer: "A" }, run);
    expect((await withIdempotency(ctx, request, "checkout", { customer: "B" }, run)).status).toBe(409);
    expect(calls).toBe(1);
  });
  it("timeout preserva reserva e impede nova criação", async () => {
    const { ctx, request } = setup(); let calls = 0;
    const run = async () => { calls++; throw new Error("timeout after provider accepted"); };
    expect((await withIdempotency(ctx, request, "checkout", {}, run, { retainOnFailure: true })).status).toBe(409);
    expect((await withIdempotency(ctx, request, "checkout", {}, run, { retainOnFailure: true })).status).toBe(409);
    expect(calls).toBe(1);
  });
  it("falha 502 não libera reserva do checkout", async () => {
    const { ctx, request } = setup(); let calls = 0;
    const run = async () => { calls++; return Response.json({ error: "provider_unavailable" }, { status: 502 }); };
    await withIdempotency(ctx, request, "checkout", {}, run, { retainOnFailure: true });
    expect((await withIdempotency(ctx, request, "checkout", {}, run, { retainOnFailure: true })).status).toBe(409);
    expect(calls).toBe(1);
  });
});