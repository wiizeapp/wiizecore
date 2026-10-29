import { beforeEach, describe, expect, it, vi } from "vitest";
import { isExternalCashReceipt, reconciliationEventForStatus } from "./provider-event-policy";

const state = vi.hoisted(() => ({
  writes: [] as string[],
  remote: { id: "provider-payment", status: "RECEIVED_IN_CASH", value: 100 },
  eventType: "PAYMENT_RECEIVED",
  contractTenant: "B",
  queryError: false,
}));

function query(table: string) {
  const filters: Record<string, unknown> = {};
  let operation = "read";
  const execute = () => {
    if (operation !== "read") {
      state.writes.push(table);
      return { data: [{ id: "event" }], error: null };
    }
    if (state.queryError && table === "contracts") return { data: null, error: { code: "unavailable" } };
    if (table === "contract_links") return { data: { id: "link", tenant_id: "A", contract_id: "contract", expires_at: "2099-01-01", revoked_at: null }, error: null };
    if (table === "contracts") return { data: filters["tenant_id"] === state.contractTenant ? { id: "contract", tenant_id: state.contractTenant, status: "draft", current_version: 1, customers: { name: "Fixture" } } : null, error: null };
    if (table === "contract_versions") return { data: { id: "version", body: "Fixture contract", version: 1 }, error: null };
    if (table === "contract_signatures") return { data: [], error: null };
    if (table === "provider_connections") return { data: { id: "connection", environment: "sandbox", api_key_ciphertext: "synthetic", status: "connected" }, error: null };
    if (table === "payments") return { data: { id: "payment", provider_payment_id: "provider-payment", gross_amount: 100, platform_fee_amount: 0 }, error: null };
    if (table === "webhook_events") return { data: { id: "event", tenant_id: "A", provider_connection_id: "connection", processing_status: "received", event_type: state.eventType, payload: { payment: state.remote } }, error: null };
    throw new Error(`Unexpected table: ${table}`);
  };
  const chain = {
    select() { return chain; }, limit() { return chain; }, order() { return chain; },
    eq(k: string, v: unknown) { filters[k] = v; return chain; },
    or() { return chain; },
    update() { operation = "update"; return chain; },
    insert() { operation = "insert"; return chain; },
    upsert() { operation = "upsert"; return chain; },
    maybeSingle: async () => execute(), single: async () => execute(),
    then(resolve: (r: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve); },
  };
  return chain;
}

const admin = { from: query, rpc: vi.fn() };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: (arg: { data: unknown }) => unknown) => (input: { data: unknown }) => fn(input) };
  return chain;
} }));
vi.mock("./mfa-middleware", () => ({ requireMfaAuth: {} }));
vi.mock("./contracts.functions", () => ({ contractEvent: vi.fn() }));
vi.mock("./crypto.server", () => ({ tokenFingerprint: (s: string) => s, decryptSecret: () => "synthetic" }));
vi.mock("./audit.server", () => ({ consumeRateLimit: async () => ({ allowed: true }), logAudit: vi.fn() }));
vi.mock("./contract-docs.server", () => ({ signingProgress: async () => [] }));
vi.mock("./financial-origin.server", () => ({ getPaymentProvider: async () => ({ connection: { id: "connection" }, provider: { getPayment: async () => state.remote } }) }));
vi.mock("./asaas.server", () => ({ AsaasProvider: class {}, billingTypeToMethod: () => "pix", eventToStatus: () => "paid" }));
vi.mock("./chargebacks.server", () => ({ isChargebackEvent: () => false }));
vi.mock("./fee-engine.server", () => ({ calculatePaymentFee: vi.fn() }));

import { getPublicContract, signContractAsCustomer } from "./contract-links.functions";
import { processWebhookEvent, reconcilePaymentFromProvider } from "./billing.server";

beforeEach(() => {
  state.writes = []; state.contractTenant = "B"; state.queryError = false;
  state.remote = { id: "provider-payment", status: "RECEIVED_IN_CASH", value: 100 };
  state.eventType = "PAYMENT_RECEIVED"; admin.rpc.mockClear();
});

describe("contrato público isolado por empresa — funções com banco simulado", () => {
  const input = { data: { token: "synthetic-public-token-123456" } };
  it("link de A não revela contrato de B", async () => {
    await expect(getPublicContract(input)).rejects.toThrow();
    expect(state.writes).toEqual([]);
  });
  it("link de A não assina contrato de B", async () => {
    await expect(signContractAsCustomer({ data: { ...input.data, signerName: "Fixture User", signerDocument: "00000000000", signature: null } })).rejects.toThrow();
    expect(state.writes).not.toContain("contract_signatures");
  });
  it("controle positivo: link de A mostra contrato de A", async () => {
    state.contractTenant = "A";
    await expect(getPublicContract(input)).resolves.toMatchObject({ body: "Fixture contract", version: 1 });
  });
  it("falha na conferência nunca libera o contrato", async () => {
    state.queryError = true;
    await expect(getPublicContract(input)).rejects.toThrow();
  });
});

describe("dinheiro externo não gera saldo — fluxo com provedor simulado", () => {
  it("reconciliação de RECEIVED_IN_CASH não cria evento financeiro nem chama RPC", async () => {
    const result = await reconcilePaymentFromProvider(admin as never, "A", "payment");
    expect(result.status).toBe("unchanged");
    expect(state.writes).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("evento legado normalizado não credita, liquida nem libera coprodução", async () => {
    await processWebhookEvent(admin as never, "event");
    expect(state.writes).toEqual(["webhook_events", "webhook_events"]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("evento explícito em dinheiro bloqueia efeitos mesmo sem status no payload", async () => {
    state.eventType = "PAYMENT_RECEIVED_IN_CASH"; state.remote.status = "";
    await processWebhookEvent(admin as never, "event");
    expect(state.writes).toEqual(["webhook_events", "webhook_events"]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("identidade divergente não permite reconciliação", async () => {
    state.remote.id = "foreign-provider-payment";
    await expect(reconcilePaymentFromProvider(admin as never, "A", "payment")).rejects.toThrow("provider_payment_mismatch");
    expect(state.writes).toEqual([]);
  });
  it("controle positivo: recebimento real continua mapeado e dinheiro externo não", () => {
    expect(reconciliationEventForStatus("RECEIVED")).toBe("PAYMENT_RECEIVED");
    expect(reconciliationEventForStatus("RECEIVED_IN_CASH")).toBeNull();
    expect(isExternalCashReceipt("PAYMENT_RECEIVED", "RECEIVED")).toBe(false);
  });
});