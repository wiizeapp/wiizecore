import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateFeeFromConfig } from "./fee-engine.server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const core = read("src/lib/charges-core.server.ts");
const fns = read("src/lib/charges.functions.ts");
const webhook = read("src/routes/api/public/webhooks/asaas.ts");

describe("tentativas de burlar o sistema", () => {
  it("taxa enviada pela tela é ignorada: o servidor só aceita a parte repassada e recalcula", () => {
    // O formulário não tem campo de taxa; qualquer 'fee' extra é descartado pela validação.
    expect(fns).not.toMatch(/fixedFee|percentageFee|totalFee|netAmount/);
    expect(fns).toMatch(/O servidor recalcula tudo/);
    expect(core).toMatch(/computePlatformFeeDetails\(admin/);
  });

  it("taxa calculada não depende de valores vindos do navegador", () => {
    const cfg = { id: "v5", fixed_fee: 2.49, percentage_fee: 0.99 };
    const a = calculateFeeFromConfig({ grossAmount: 1000, installments: 1, paymentMethod: "pix", config: cfg });
    const b = calculateFeeFromConfig({ grossAmount: 1000, installments: 1, paymentMethod: "pix", config: cfg, totalFee: 0, netAmount: 1000 } as never);
    expect(b.totalFee).toBe(a.totalFee);
    expect(b.netAmount).toBe(987.61);
  });

  it("débito em conta é bloqueado no servidor", () => {
    expect(core).toMatch(/data\.method === "debit_card"\) throw new Error/);
  });

  it("checkout público e prévia não oferecem débito", () => {
    for (const f of ["src/routes/pagar.$token.tsx", "src/routes/_authenticated/checkout-personalizado.tsx"]) {
      expect(read(f), f).not.toMatch(/["']debit_card["']\s*[,:]\s*\{?\s*(label|title)/);
    }
  });

  it("mesma cobrança enviada duas vezes reaproveita a primeira (idempotência)", () => {
    expect(fns).toMatch(/idempotencyKey: z\.string\(\)\.min\(16\)/);
    expect(core).toMatch(/\.eq\("idempotency_key", data\.idempotencyKey\)/);
  });

  it("aviso de pagamento duplicado não é processado de novo", () => {
    expect(webhook).toMatch(/scopedProviderEventId\(matched\.id, parsed\.id\)/);
    expect(webhook).toMatch(/external_event_id: externalId/);
    expect(webhook).toMatch(/processing_status === "processed"/);
    expect(webhook).toMatch(/"duplicate", \{ status: 200 \}/);
  });

  it("aviso sem token válido é recusado", () => {
    expect(webhook).toMatch(/Unauthorized", \{ status: 401 \}/);
  });
});
