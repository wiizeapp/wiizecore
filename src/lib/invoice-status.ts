/** Status de NFS-e: espelham os status oficiais do provedor + PENDING (antes da resposta). */
export type InvoiceStatus =
  | "PENDING"
  | "SCHEDULED"
  | "SYNCHRONIZED"
  | "AUTHORIZED"
  | "PROCESSING_CANCELLATION"
  | "CANCELED"
  | "CANCELLATION_DENIED"
  | "ERROR";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: "Processando",
  SCHEDULED: "Agendada",
  SYNCHRONIZED: "Processando",
  AUTHORIZED: "Emitida",
  PROCESSING_CANCELLATION: "Cancelando",
  CANCELED: "Cancelada",
  CANCELLATION_DENIED: "Cancelamento recusado",
  ERROR: "Erro",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  SCHEDULED: "neutral",
  SYNCHRONIZED: "warning",
  AUTHORIZED: "success",
  PROCESSING_CANCELLATION: "warning",
  CANCELED: "neutral",
  CANCELLATION_DENIED: "danger",
  ERROR: "danger",
};

export const INVOICE_ORIGIN_LABEL: Record<string, string> = {
  payment: "Cobrança",
  installment: "Parcelamento",
  standalone: "Avulsa",
  automatic: "Automática",
};

export const INVOICE_EVENTS = [
  "INVOICE_CREATED",
  "INVOICE_UPDATED",
  "INVOICE_SYNCHRONIZED",
  "INVOICE_AUTHORIZED",
  "INVOICE_PROCESSING_CANCELLATION",
  "INVOICE_CANCELED",
  "INVOICE_CANCELLATION_DENIED",
  "INVOICE_ERROR",
] as const;

const KNOWN = new Set<string>(["SCHEDULED", "SYNCHRONIZED", "AUTHORIZED", "PROCESSING_CANCELLATION", "CANCELED", "CANCELLATION_DENIED", "ERROR"]);

/** Resolve o novo status a partir do evento e do status informado pelo provedor. null = não altera. */
export function invoiceStatusFromEvent(event: string, providerStatus?: string | null): InvoiceStatus | null {
  switch (event) {
    case "INVOICE_AUTHORIZED": return "AUTHORIZED";
    case "INVOICE_SYNCHRONIZED": return "SYNCHRONIZED";
    case "INVOICE_PROCESSING_CANCELLATION": return "PROCESSING_CANCELLATION";
    case "INVOICE_CANCELED": return "CANCELED";
    case "INVOICE_CANCELLATION_DENIED": return "CANCELLATION_DENIED";
    case "INVOICE_ERROR": return "ERROR";
    case "INVOICE_CREATED":
    case "INVOICE_UPDATED":
      return providerStatus && KNOWN.has(providerStatus) ? (providerStatus as InvoiceStatus) : null;
    default:
      return null;
  }
}

/** Estados finais não podem voltar para estados anteriores por evento atrasado. */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return false;
  if (from === "CANCELED") return false;
  if (from === "AUTHORIZED") return to === "PROCESSING_CANCELLATION" || to === "CANCELED" || to === "CANCELLATION_DENIED";
  if (from === "PROCESSING_CANCELLATION") return to === "CANCELED" || to === "CANCELLATION_DENIED";
  if (from === "CANCELLATION_DENIED") return to === "PROCESSING_CANCELLATION" || to === "CANCELED";
  return true;
}

export const TIMELINE_LABEL: Record<string, string> = {
  REQUESTED: "Nota criada",
  INVOICE_CREATED: "Enviada para processamento",
  INVOICE_UPDATED: "Nota atualizada",
  INVOICE_SYNCHRONIZED: "Sincronizada com a prefeitura",
  INVOICE_AUTHORIZED: "Autorizada",
  INVOICE_ERROR: "Erro na emissão",
  CANCEL_REQUESTED: "Cancelamento solicitado",
  INVOICE_PROCESSING_CANCELLATION: "Cancelamento em processamento",
  INVOICE_CANCELED: "Cancelada",
  INVOICE_CANCELLATION_DENIED: "Cancelamento recusado",
  AUTHORIZE_REQUESTED: "Emissão antecipada solicitada",
};

export const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = ["PENDING", "SCHEDULED", "SYNCHRONIZED", "AUTHORIZED", "PROCESSING_CANCELLATION", "CANCELLATION_DENIED"];
