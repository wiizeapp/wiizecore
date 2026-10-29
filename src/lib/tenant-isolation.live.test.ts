/**
 * Testes de isolamento entre empresas contra o backend real (somente homologação).
 * Só rodam com as variáveis abaixo; caso contrário, ficam marcados como "skipped" (NÃO aprovados).
 *   ISO_URL, ISO_ANON_KEY            — endereço e chave pública do backend de homologação
 *   ISO_A_TOKEN, ISO_A_TENANT        — sessão (aal2) de um usuário da empresa A e o id da empresa A
 *   ISO_B_TENANT                     — id da empresa B (dados simulados)
 *   ISO_B_PAYMENT, ISO_B_CUSTOMER    — ids de uma cobrança e de um cliente simulados da empresa B
 * Nenhum teste cria movimentação financeira: escritas usam ids da empresa B e devem afetar 0 linhas.
 */
import { describe, it, expect } from "vitest";
import { assertIsolationDenied, isolationRows as rows } from "./isolation-response";

const env = process.env;
const ready = env["ISO_ISOLATED_CONFIRMED"] === "yes" && ["ISO_URL", "ISO_ANON_KEY", "ISO_A_TOKEN", "ISO_A_TENANT", "ISO_B_TENANT", "ISO_B_PAYMENT", "ISO_B_CUSTOMER"].every((k) => env[k]);
const suite = ready ? describe : describe.skip;

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${env["ISO_URL"]}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env["ISO_ANON_KEY"] ?? "",
      authorization: `Bearer ${env["ISO_A_TOKEN"]}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

const tables = [
  "payments", "customers", "bank_accounts", "documents", "notifications", "transactions",
  "withdrawals", "wallets", "refunds", "invoices", "contracts", "audit_logs", "provider_connections",
  "payment_activations", "subscriptions", "customer_documents",
];

suite("isolamento entre empresas (A não alcança B)", () => {
  for (const t of tables) {
    it(`A não lê ${t} da empresa B`, async () => {
      expect(await rows(await rest(`${t}?tenant_id=eq.${env["ISO_B_TENANT"]}&select=*&limit=5`))).toHaveLength(0);
    });
  }

  it("A não altera cobrança da empresa B", async () => {
    const r = await rest(`payments?id=eq.${env["ISO_B_PAYMENT"]}`, { method: "PATCH", body: JSON.stringify({ description: "x" }) });
    expect(await rows(r)).toHaveLength(0);
  });

  it("A não exclui cliente da empresa B", async () => {
    const r = await rest(`customers?id=eq.${env["ISO_B_CUSTOMER"]}`, { method: "DELETE" });
    expect(await rows(r)).toHaveLength(0);
  });

  it("A não cria cliente dentro da empresa B", async () => {
    const r = await rest("customers", { method: "POST", body: JSON.stringify({ tenant_id: env["ISO_B_TENANT"], name: "teste-isolamento" }) });
    await assertIsolationDenied(r);
  });

  it("A não marca avisos da empresa B como lidos", async () => {
    const r = await rest("rpc/mark_notifications_read", { method: "POST", body: JSON.stringify({ _tenant_id: env["ISO_B_TENANT"], _ids: [] }) });
    await assertIsolationDenied(r);
  });

  it("A não lê arquivos privados de ativação da empresa B", async () => {
    const r = await fetch(`${env["ISO_URL"]}/storage/v1/object/list/kyc-documents`, {
      method: "POST",
      headers: { apikey: env["ISO_ANON_KEY"] ?? "", authorization: `Bearer ${env["ISO_A_TOKEN"]}`, "content-type": "application/json" },
      body: JSON.stringify({ prefix: `${env["ISO_B_TENANT"]}/` }),
    });
    expect(await rows(r)).toHaveLength(0);
  });

  it("controle: A enxerga a própria empresa", async () => {
    const r = await rest(`tenants?id=eq.${env["ISO_A_TENANT"]}&select=id`);
    expect(await rows(r)).toHaveLength(1);
  });
});

