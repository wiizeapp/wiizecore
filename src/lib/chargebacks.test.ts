import { describe, expect, it } from "vitest";
import { eventToStatus, ASAAS_WEBHOOK_EVENTS } from "./asaas.server";
import { internalStatusFor, isChargebackEvent, ignoresStaleChargeback } from "./chargebacks.server";

describe("eventos oficiais de chargeback do Asaas", () => {
  it("os três eventos de contestação são reconhecidos", () => {
    expect(isChargebackEvent("PAYMENT_CHARGEBACK_REQUESTED")).toBe(true);
    expect(isChargebackEvent("PAYMENT_CHARGEBACK_DISPUTE")).toBe(true);
    expect(isChargebackEvent("PAYMENT_AWAITING_CHARGEBACK_REVERSAL")).toBe(true);
    expect(isChargebackEvent("PAYMENT_REFUNDED")).toBe(false);
  });

  it("nenhum evento de contestação é descartado pelo conversor de status", () => {
    expect(eventToStatus("PAYMENT_CHARGEBACK_REQUESTED")).toBe("in_analysis");
    expect(eventToStatus("PAYMENT_CHARGEBACK_DISPUTE")).toBe("in_analysis");
    expect(eventToStatus("PAYMENT_AWAITING_CHARGEBACK_REVERSAL")).toBe("in_analysis");
  });

  it("os três eventos de contestação estão na inscrição de webhooks do Asaas", () => {
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_CHARGEBACK_REQUESTED");
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_CHARGEBACK_DISPUTE");
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_AWAITING_CHARGEBACK_REVERSAL");
  });
});

describe("eventos oficiais do fluxo 3DS e análise de risco", () => {
  it("recusa de captura e falha do desafio 3DS marcam a cobrança como falha", () => {
    expect(eventToStatus("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED")).toBe("failed");
    expect(eventToStatus("PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED")).toBe("failed");
  });

  it("eventos de análise de risco do cartão não são descartados", () => {
    expect(eventToStatus("PAYMENT_AWAITING_RISK_ANALYSIS")).toBe("in_analysis");
    expect(eventToStatus("PAYMENT_APPROVED_BY_RISK_ANALYSIS")).toBe("in_analysis");
    expect(eventToStatus("PAYMENT_AUTHORIZED")).toBe("in_analysis");
    expect(eventToStatus("PAYMENT_REPROVED_BY_RISK_ANALYSIS")).toBe("failed");
  });

  it("os eventos do fluxo 3DS estão na inscrição de webhooks do Asaas", () => {
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED");
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED");
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_APPROVED_BY_RISK_ANALYSIS");
    expect(ASAAS_WEBHOOK_EVENTS).toContain("PAYMENT_AUTHORIZED");
  });
});

describe("estado interno da contestação", () => {
  it("evento atrasado não reabre disputa encerrada", () => {
    expect(ignoresStaleChargeback("reversed", "awaiting_documents")).toBe(true);
    expect(ignoresStaleChargeback("lost", "in_review")).toBe(true);
    expect(ignoresStaleChargeback("in_review", "awaiting_documents")).toBe(true);
    expect(ignoresStaleChargeback("awaiting_documents", "in_review")).toBe(false);
  });
  it("contestação recebida aguarda documentos", () => {
    expect(internalStatusFor("PAYMENT_CHARGEBACK_REQUESTED", null)).toBe("awaiting_documents");
    expect(internalStatusFor("PAYMENT_CHARGEBACK_REQUESTED", "REQUESTED")).toBe("awaiting_documents");
  });

  it("defesa apresentada fica em análise", () => {
    expect(internalStatusFor("PAYMENT_CHARGEBACK_DISPUTE", null)).toBe("in_review");
    expect(internalStatusFor("PAYMENT_CHARGEBACK_DISPUTE", "IN_DISPUTE")).toBe("in_review");
  });

  it("disputa vencida aguardando repasse é revertida", () => {
    expect(internalStatusFor("PAYMENT_AWAITING_CHARGEBACK_REVERSAL", null)).toBe("reversed");
    expect(internalStatusFor("PAYMENT_AWAITING_CHARGEBACK_REVERSAL", "REVERSED")).toBe("reversed");
  });

  it("o estado oficial do processador prevalece sobre a inferência do evento", () => {
    expect(internalStatusFor("PAYMENT_CHARGEBACK_REQUESTED", "DISPUTE_LOST")).toBe("lost");
    expect(internalStatusFor("PAYMENT_CHARGEBACK_DISPUTE", "REVERSED")).toBe("reversed");
  });

  it("valores oficiais não mapeados caem no estado do evento, sem inventar resultado", () => {
    expect(internalStatusFor("PAYMENT_CHARGEBACK_DISPUTE", "DONE")).toBe("in_review");
    expect(internalStatusFor("PAYMENT_CHARGEBACK_REQUESTED", "VALOR_FUTURO_DESCONHECIDO")).toBe("awaiting_documents");
  });
});
