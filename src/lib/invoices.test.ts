import { describe, expect, it, vi } from "vitest";

vi.mock("./crypto.server", () => ({ decryptSecret: async () => "x" }));
vi.mock("./asaas.server", () => ({ ASAAS_BASE_URLS: { sandbox: "https://sandbox", production: "https://prod" } }));

import { buildSubscriptionInvoiceSettings } from "./invoice-payloads";
import { missingFiscalFields, processInvoiceWebhook } from "./asaas-invoices.server";

/** Banco em memória mínimo com a mesma API encadeada usada pelo código. */
function fakeDb(seed: Record<string, any[]>) {
  const t: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  const uniq: Record<string, string> = { invoice_events: "provider_event_id" };
  const q = (table: string) => {
    const filters: [string, unknown][] = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: any = null;
    const rows = () => (t[table] ??= []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
      not: () => b,
      limit: () => b,
      update: (p: any) => { op = "update"; payload = p; return b; },
      insert: (p: any) => {
        op = "insert";
        const k = uniq[table];
        if (k && (t[table] ??= []).some((r) => r[k] === p[k])) { payload = { error: { code: "23505" } }; return b; }
        const row = { id: crypto.randomUUID(), ...p };
        (t[table] ??= []).push(row); payload = { row };
        return b;
      },
      maybeSingle: async () => op === "insert" ? { data: payload.row ?? null, error: payload.error ?? null } : { data: rows()[0] ?? null, error: null },
      then: (res: any) => {
        if (op === "update") rows().forEach((r) => Object.assign(r, payload));
        if (op === "insert") return res({ data: payload.row ?? null, error: payload.error ?? null });
        return res({ data: rows(), error: null });
      },
    };
    return b;
  };
  return { db: { from: q, rpc: async () => ({ data: 0, error: null }) } as any, t: t as any };
}

const T = "tenant-a";
const baseSeed = () => ({
  webhook_events: [{ id: "we1", processing_status: "received" }],
  invoices: [{ id: "inv1", tenant_id: T, provider_invoice_id: "prov_1", status: "SCHEDULED", value: 100 }],
  invoice_events: [], notifications: [], audit_logs: [],
  payments: [{ id: "pay1", tenant_id: T, provider_payment_id: "pay_prov", gross_amount: 250, description: "Mensalidade" }],
  provider_connections: [{ tenant_id: T, environment: "sandbox" }],
});
const ev = (type: string, status: string, extra: Record<string, unknown> = {}, id = "evt_1", tenant = T) => ({
  id: "we1", tenant_id: tenant, event_type: type, external_event_id: id,
  payload: { invoice: { id: "prov_1", status, ...extra } },
});

describe("configuração fiscal", () => {
  it("sem configuração pede os dados fiscais", () => {
    expect(missingFiscalFields(null, null)).toEqual(["Dados fiscais da empresa"]);
  });
  it("Portal Nacional não exige RPS", () => {
    const miss = missingFiscalFields({ portal: "national", municipal_inscription: "1", simples_nacional: true }, null);
    expect(miss).toEqual([]);
  });
  it("exige regime especial e acesso quando a prefeitura pede", () => {
    const miss = missingFiscalFields(
      { portal: "municipal", municipal_inscription: "1", simples_nacional: false, rps_serie: "A", rps_number: 1 },
      { usesSpecialTaxRegimes: true, authenticationType: "TOKEN" },
    );
    expect(miss).toHaveLength(2);
  });
});

describe("nota automática em recorrência", () => {
  const fs = { name: "Consultoria", municipal_service_id: null, municipal_service_code: "01.07", municipal_service_name: null, iss: "2", retain_iss: false, taxes: { pis: 0.65, nbsCode: "123" } };
  it("segue o formato oficial", () => {
    const b = buildSubscriptionInvoiceSettings(fs, { rule: "BEFORE_PAYMENT_DUE_DATE", days: 10 });
    expect(b).toMatchObject({ municipalServiceCode: "01.07", effectiveDatePeriod: "BEFORE_PAYMENT_DUE_DATE", daysBeforeDueDate: 10, receivedOnly: false, updatePayment: false });
    expect(b["taxes"]).toMatchObject({ iss: 2, pis: 0.65, cofins: 0, csll: 0, inss: 0, ir: 0, retainIss: false, nbsCode: "123" });
    expect(b).not.toHaveProperty("municipalServiceId");
  });
  it("na confirmação do pagamento emite só para cobranças pagas", () => {
    expect(buildSubscriptionInvoiceSettings(fs, { rule: "ON_PAYMENT_CONFIRMATION" })["receivedOnly"]).toBe(true);
  });
  it("Portal Nacional: sempre envia o código, nunca o ID municipal", () => {
    const b = buildSubscriptionInvoiceSettings({ ...fs, municipal_service_id: "srv_9" }, { rule: "ON_NEXT_MONTH" });
    expect(b["municipalServiceCode"]).toBe("01.07");
    expect(b).not.toHaveProperty("municipalServiceId");
  });
  it("recusa serviço sem código", () => {
    expect(() => buildSubscriptionInvoiceSettings({ ...fs, municipal_service_code: null }, { rule: "ON_NEXT_MONTH" })).toThrow();
  });
});

describe("avisos do provedor (webhook)", () => {
  it("autoriza a nota e avisa o usuário", async () => {
    const { db, t } = fakeDb(baseSeed());
    await processInvoiceWebhook(db, ev("INVOICE_AUTHORIZED", "AUTHORIZED", { number: "55", pdfUrl: "https://pdf" }));
    expect(t.invoices[0]).toMatchObject({ status: "AUTHORIZED", number: "55", pdf_url: "https://pdf" });
    expect(t.notifications).toHaveLength(1);
    expect(t.webhook_events[0].processing_status).toBe("processed");
  });
  it("evento repetido não duplica aviso", async () => {
    const { db, t } = fakeDb(baseSeed());
    await processInvoiceWebhook(db, ev("INVOICE_AUTHORIZED", "AUTHORIZED"));
    await processInvoiceWebhook(db, ev("INVOICE_AUTHORIZED", "AUTHORIZED"));
    expect(t.notifications).toHaveLength(1);
    expect(t.invoice_events).toHaveLength(1);
  });
  it("não volta uma nota autorizada para agendada", async () => {
    const { db, t } = fakeDb(baseSeed());
    await processInvoiceWebhook(db, ev("INVOICE_AUTHORIZED", "AUTHORIZED"));
    await processInvoiceWebhook(db, ev("INVOICE_SYNCHRONIZED", "SYNCHRONIZED", {}, "evt_2"));
    expect(t.invoices[0].status).toBe("AUTHORIZED");
  });
  it("registra erro com mensagem", async () => {
    const { db, t } = fakeDb(baseSeed());
    await processInvoiceWebhook(db, ev("INVOICE_ERROR", "ERROR", { statusDescription: "Inscrição inválida" }));
    expect(t.invoices[0]).toMatchObject({ status: "ERROR", error_message: "Inscrição inválida" });
  });
  it("cria a nota gerada por uma recorrência", async () => {
    const seed = baseSeed(); seed.invoices = [];
    const { db, t } = fakeDb(seed);
    await processInvoiceWebhook(db, ev("INVOICE_CREATED", "SCHEDULED", { payment: "pay_prov", value: 250 }));
    expect(t.invoices).toHaveLength(1);
    expect(t.invoices[0]).toMatchObject({ tenant_id: T, payment_id: "pay1", origin: "automatic", provider_invoice_id: "prov_1" });
  });
});

describe("isolamento entre empresas", () => {
  it("evento de outra empresa não altera notas deste tenant", async () => {
    const { db, t } = fakeDb(baseSeed());
    await processInvoiceWebhook(db, ev("INVOICE_AUTHORIZED", "AUTHORIZED", { payment: "pay_prov" }, "evt_x", "tenant-b"));
    expect(t.invoices).toHaveLength(1);
    expect(t.invoices[0].status).toBe("SCHEDULED");
    expect(t.notifications).toHaveLength(0);
    expect(t.webhook_events[0].processing_status).toBe("discarded");
  });
});
