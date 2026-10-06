import { describe, expect, it } from "vitest";
import { canTransition, invoiceStatusFromEvent } from "./invoice-status";

describe("status da NFS-e", () => {
  it("mapeia eventos oficiais", () => {
    expect(invoiceStatusFromEvent("INVOICE_AUTHORIZED")).toBe("AUTHORIZED");
    expect(invoiceStatusFromEvent("INVOICE_SYNCHRONIZED")).toBe("SYNCHRONIZED");
    expect(invoiceStatusFromEvent("INVOICE_ERROR")).toBe("ERROR");
    expect(invoiceStatusFromEvent("INVOICE_PROCESSING_CANCELLATION")).toBe("PROCESSING_CANCELLATION");
    expect(invoiceStatusFromEvent("INVOICE_CANCELED")).toBe("CANCELED");
    expect(invoiceStatusFromEvent("INVOICE_CANCELLATION_DENIED")).toBe("CANCELLATION_DENIED");
  });
  it("criada usa o status informado", () => {
    expect(invoiceStatusFromEvent("INVOICE_CREATED", "SCHEDULED")).toBe("SCHEDULED");
    expect(invoiceStatusFromEvent("INVOICE_UPDATED", "QUALQUER")).toBeNull();
  });
  it("evento desconhecido não altera", () => {
    expect(invoiceStatusFromEvent("INVOICE_NOVO_EVENTO")).toBeNull();
  });
  it("nota autorizada não volta para processando", () => {
    expect(canTransition("AUTHORIZED", "SYNCHRONIZED")).toBe(false);
    expect(canTransition("AUTHORIZED", "PROCESSING_CANCELLATION")).toBe(true);
    expect(canTransition("CANCELED", "AUTHORIZED")).toBe(false);
    expect(canTransition("PROCESSING_CANCELLATION", "CANCELLATION_DENIED")).toBe(true);
    expect(canTransition("SCHEDULED", "AUTHORIZED")).toBe(true);
  });
});
