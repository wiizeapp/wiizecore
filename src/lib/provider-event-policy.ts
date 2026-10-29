/** Cash bookkeeping never demonstrates provider-held funds, even in an old queued reconciliation. */
export function isExternalCashReceipt(eventType: string, providerStatus: unknown): boolean {
  return eventType === "PAYMENT_RECEIVED_IN_CASH" || providerStatus === "RECEIVED_IN_CASH";
}

const statusEvents: Readonly<Record<string, string>> = {
  RECEIVED: "PAYMENT_RECEIVED",
  CONFIRMED: "PAYMENT_CONFIRMED",
  OVERDUE: "PAYMENT_OVERDUE",
  REFUNDED: "PAYMENT_REFUNDED",
  DELETED: "PAYMENT_DELETED",
  AWAITING_RISK_ANALYSIS: "PAYMENT_AWAITING_RISK_ANALYSIS",
};

export function reconciliationEventForStatus(status: unknown): string | null {
  return typeof status === "string" ? statusEvents[status] ?? null : null;
}