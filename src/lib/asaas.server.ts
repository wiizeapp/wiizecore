/**
 * Abstração do provedor de pagamentos. O restante do sistema fala com
 * `PaymentProvider`; o Asaas é apenas a primeira implementação.
 */
export type ProviderBillingType = "UNDEFINED" | "PIX" | "BOLETO" | "CREDIT_CARD";

export type ProviderPayment = {
  id: string;
  status?: string;
  value?: number;
  netValue?: number;
  dueDate?: string;
  billingType?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  installment?: string | null;
  installmentNumber?: number | null;
  subscription?: string | null;
  dateCreated?: string;
  anticipable?: boolean;
  anticipated?: boolean;
};

export type ProviderSubaccount = { id: string; walletId: string; apiKey: string };
export type PixAutomaticAuthorization = {
  id: string;
  status?: string;
  value?: number;
  immediateQrCode?: { encodedImage?: string; payload?: string; conciliationIdentifier?: string } | null;
  payload?: string;
  encodedImage?: string;
};

/** Status do provedor → status interno da autorização. */
export function pixAutomaticStatus(s?: string): "pending" | "active" | "refused" | "cancelled" | "expired" {
  switch ((s ?? "").toUpperCase()) {
    case "ACTIVE":
    case "ACTIVATED":
      return "active";
    case "REFUSED":
    case "DENIED":
      return "refused";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}
export type ProviderTransfer = { id: string; status?: string };
export type ProviderAnticipation = {
  id: string;
  status?: string;
  value?: number;
  totalValue?: number;
  netValue?: number;
  fee?: number;
  anticipationDays?: number;
  anticipationDate?: string;
  dueDate?: string;
  payment?: string | null;
};
export type ProviderAnticipationSimulation = Omit<ProviderAnticipation, "id" | "status"> & { isDocumentationRequired?: boolean };

export interface PaymentProvider {
  createCustomer(input: Record<string, unknown>): Promise<{ id: string }>;
  updateCustomer(id: string, input: Record<string, unknown>): Promise<{ id: string }>;
  createPayment(input: Record<string, unknown>): Promise<ProviderPayment>;
  updatePayment(paymentId: string, input: Record<string, unknown>): Promise<ProviderPayment>;
  updateSubscription(subscriptionId: string, input: Record<string, unknown>): Promise<{ id: string }>;
  listInstallmentPayments(installmentId: string): Promise<ProviderPayment[]>;
  createSubscription(input: Record<string, unknown>): Promise<{ id: string }>;
  listSubscriptionPayments(subscriptionId: string): Promise<ProviderPayment[]>;
  getPixQrCode(paymentId: string): Promise<{ encodedImage: string; payload: string; expirationDate?: string }>;
  getBoletoLine(paymentId: string): Promise<{ identificationField: string; barCode?: string }>;
  cancelPayment(paymentId: string): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  registerWebhook(input: { url: string; email: string; authToken: string }): Promise<{ id: string }>;
  createSubaccount(input: Record<string, unknown>): Promise<ProviderSubaccount>;
  getAccountStatus(): Promise<Record<string, unknown>>;
  getMyFees?(): Promise<Record<string, unknown>>;
  listMyDocuments(): Promise<AsaasDocumentsResponse>;
  uploadMyDocument(groupId: string, type: string, file: { bytes: Uint8Array; mime: string; name: string }): Promise<unknown>;
  getBalance(): Promise<{ balance: number }>;
  createTransfer(input: Record<string, unknown>): Promise<ProviderTransfer>;
  getPayment(paymentId: string): Promise<ProviderPayment>;
  simulateAnticipation(input: Record<string, unknown>): Promise<ProviderAnticipationSimulation>;
  createAnticipation(input: Record<string, unknown>): Promise<ProviderAnticipation>;
  listCustomerNotifications?(customerId: string): Promise<ProviderNotification[]>;
  updateNotifications?(customerId: string, notifications: Record<string, unknown>[]): Promise<void>;
}

export type ProviderNotification = { id: string; event: string; scheduleOffset?: number; enabled?: boolean };

export const ASAAS_BASE_URLS: Record<string, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

export type AsaasDocumentGroup = {
  id: string; status: string; type: string; title?: string; description?: string;
  onboardingUrl?: string | null; onboardingUrlExpirationDate?: string | null;
  responsible?: { name?: string; type?: string } | null;
  documents?: { id: string; status: string }[];
};
export type AsaasDocumentsResponse = { rejectReasons?: string | null; data?: AsaasDocumentGroup[] };

export const ASAAS_WEBHOOK_EVENTS = [
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_APPROVED",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_PENDING",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_REJECTED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_APPROVED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_PENDING",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_REJECTED",
  "ACCOUNT_STATUS_DOCUMENT_APPROVED",
  "ACCOUNT_STATUS_DOCUMENT_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_DOCUMENT_PENDING",
  "ACCOUNT_STATUS_DOCUMENT_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_REFUND_DENIED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "RECEIVABLE_ANTICIPATION_PENDING",
  "RECEIVABLE_ANTICIPATION_SCHEDULED",
  "RECEIVABLE_ANTICIPATION_CREDITED",
  "RECEIVABLE_ANTICIPATION_DEBITED",
  "RECEIVABLE_ANTICIPATION_DENIED",
  "RECEIVABLE_ANTICIPATION_CANCELLED",
  "RECEIVABLE_ANTICIPATION_OVERDUE",
  "INVOICE_CREATED",
  "INVOICE_UPDATED",
  "INVOICE_SYNCHRONIZED",
  "INVOICE_AUTHORIZED",
  "INVOICE_PROCESSING_CANCELLATION",
  "INVOICE_CANCELED",
  "INVOICE_CANCELLATION_DENIED",
  "INVOICE_ERROR",
];

/** Evento de antecipação do Asaas → status interno. */
export function anticipationEventToStatus(event: string): "processing" | "completed" | "failed" | "cancelled" | null {
  switch (event) {
    case "RECEIVABLE_ANTICIPATION_PENDING":
    case "RECEIVABLE_ANTICIPATION_SCHEDULED":
      return "processing";
    case "RECEIVABLE_ANTICIPATION_CREDITED":
      return "completed";
    case "RECEIVABLE_ANTICIPATION_DENIED":
      return "failed";
    case "RECEIVABLE_ANTICIPATION_CANCELLED":
      return "cancelled";
    default:
      return null; // DEBITED / OVERDUE: impacto posterior, registrado sem mudar status
  }
}

export class AsaasProvider implements PaymentProvider {
  constructor(
    private apiKey: string,
    private environment: "sandbox" | "production",
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${ASAAS_BASE_URLS[this.environment]}${path}`, {
      method,
      headers: {
        access_token: this.apiKey,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "WiizePay",
      },
      body: body ? JSON.stringify(body) : null,
    });
    const text = await response.text();
    if (!response.ok) {
      // Só status e códigos de erro; o corpo pode conter dados pessoais. IDs no caminho são omitidos.
      let errCodes = "";
      try { errCodes = ((JSON.parse(text) as { errors?: { code?: string }[] }).errors ?? []).map((e) => e.code).filter(Boolean).join(","); } catch { /* não-JSON */ }
      console.error(`Asaas ${method} ${path.split("?")[0]!.replace(/\/[A-Za-z0-9_-]{8,}/g, "/:id")} falhou [${response.status}]${errCodes ? ` códigos: ${errCodes}` : ""}`);
      let message = "O provedor de pagamentos recusou a operação.";
      try {
        const parsed = JSON.parse(text) as { errors?: { description?: string }[] };
        if (parsed.errors?.[0]?.description) message = `${parsed.errors[0].description}`;
      } catch {
        /* resposta não-JSON */
      }
      throw new Error(message);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  createCustomer(input: Record<string, unknown>) {
    return this.request<{ id: string }>("POST", "/customers", input);
  }
  updateCustomer(id: string, input: Record<string, unknown>) {
    return this.request<{ id: string }>("PUT", `/customers/${encodeURIComponent(id)}`, input);
  }
  createPayment(input: Record<string, unknown>) {
    return this.request<ProviderPayment>("POST", "/payments", input);
  }
  updatePayment(paymentId: string, input: Record<string, unknown>) {
    return this.request<ProviderPayment>("PUT", `/payments/${encodeURIComponent(paymentId)}`, input);
  }
  updateSubscription(subscriptionId: string, input: Record<string, unknown>) {
    return this.request<{ id: string }>("PUT", `/subscriptions/${encodeURIComponent(subscriptionId)}`, input);
  }
  async listCustomerNotifications(customerId: string) {
    const res = await this.request<{ data: ProviderNotification[] }>("GET", `/customers/${encodeURIComponent(customerId)}/notifications`);
    return res.data ?? [];
  }
  async updateNotifications(customerId: string, notifications: Record<string, unknown>[]) {
    await this.request("PUT", "/notifications/batch", { customer: customerId, notifications });
  }
  async listInstallmentPayments(installmentId: string) {
    const res = await this.request<{ data: ProviderPayment[] }>(
      "GET",
      `/payments?installment=${encodeURIComponent(installmentId)}&limit=100`,
    );
    return res.data ?? [];
  }
  createSubscription(input: Record<string, unknown>) {
    return this.request<{ id: string }>("POST", "/subscriptions", input);
  }
  async listSubscriptionPayments(subscriptionId: string) {
    const res = await this.request<{ data: ProviderPayment[] }>(
      "GET",
      `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    );
    return res.data ?? [];
  }
  getPixQrCode(paymentId: string) {
    return this.request<{ encodedImage: string; payload: string; expirationDate?: string }>(
      "GET",
      `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    );
  }
  getBoletoLine(paymentId: string) {
    return this.request<{ identificationField: string; barCode?: string }>(
      "GET",
      `/payments/${encodeURIComponent(paymentId)}/identificationField`,
    );
  }
  async cancelPayment(paymentId: string) {
    await this.request("DELETE", `/payments/${encodeURIComponent(paymentId)}`);
  }
  /** Paga uma cobrança existente com cartão. Os dados do cartão só trafegam nesta chamada e nunca são guardados. */
  payWithCreditCard(paymentId: string, body: Record<string, unknown>) {
    return this.request<{ status: string }>("POST", `/payments/${encodeURIComponent(paymentId)}/payWithCreditCard`, body);
  }
  /** Somente sandbox: confirma o pagamento de teste (dispara webhook real). */
  async sandboxConfirmPayment(paymentId: string) {
    if (this.environment !== "sandbox") throw new Error("Disponível apenas no ambiente de teste.");
    await this.request("POST", `/sandbox/payment/${encodeURIComponent(paymentId)}/confirm`);
  }
  async cancelSubscription(subscriptionId: string) {
    await this.request("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }
  registerWebhook(input: { url: string; email: string; authToken: string }) {
    return this.request<{ id: string }>("POST", "/webhooks", {
      name: "WiizePay",
      url: input.url,
      email: input.email,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: input.authToken,
      sendType: "SEQUENTIALLY",
      events: ASAAS_WEBHOOK_EVENTS,
    });
  }
  createSubaccount(input: Record<string, unknown>) {
    return this.request<ProviderSubaccount>("POST", "/accounts", input);
  }
  getAccountStatus() {
    return this.request<Record<string, unknown>>("GET", "/myAccount/status");
  }
  /** Taxas atuais da conta (custo do Asaas por forma de pagamento). */
  getMyFees() {
    return this.request<Record<string, unknown>>("GET", "/myAccount/fees");
  }
  listMyDocuments() {
    return this.request<AsaasDocumentsResponse>("GET", "/myAccount/documents");
  }
  /** Envia um arquivo para um grupo de documentos pendente da própria conta (multipart). */
  async uploadMyDocument(groupId: string, type: string, file: { bytes: Uint8Array; mime: string; name: string }) {
    const form = new FormData();
    form.append("type", type);
    form.append("documentFile", new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mime }), file.name);
    const response = await fetch(`${ASAAS_BASE_URLS[this.environment]}/myAccount/documents/${encodeURIComponent(groupId)}`, {
      method: "POST",
      headers: { access_token: this.apiKey, accept: "application/json", "user-agent": "WiizePay" },
      body: form,
    });
    const text = await response.text();
    if (!response.ok) {
      // Registra só o status e os códigos de erro — nunca o corpo completo (pode conter dados pessoais).
      let codes = "";
      try { codes = ((JSON.parse(text) as { errors?: { code?: string }[] }).errors ?? []).map((e) => e.code).filter(Boolean).join(","); } catch { /* não-JSON */ }
      console.error(`Asaas upload de documento falhou [${response.status}]${codes ? ` códigos: ${codes}` : ""}`);
      let message = "O Asaas recusou o documento.";
      try { const parsed = JSON.parse(text) as { errors?: { description?: string }[] }; if (parsed.errors?.[0]?.description) message = parsed.errors[0].description; } catch { /* não-JSON */ }
      throw new Error(message);
    }
    return text ? JSON.parse(text) : {};
  }
  getBalance() {
    return this.request<{ balance: number }>("GET", "/finance/balance");
  }
  createTransfer(input: Record<string, unknown>) {
    return this.request<ProviderTransfer>("POST", "/transfers", input);
  }
  /** Estorno oficial: POST /v3/payments/{id}/refund com value (parcial) e description. */
  refundPayment(paymentId: string, input: { value: number; description?: string; splitRefunds?: { id: string; value: number }[] }) {
    return this.request<ProviderPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, input);
  }
  getPayment(paymentId: string) {
    return this.request<ProviderPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
  }
  simulateAnticipation(input: Record<string, unknown>) {
    return this.request<ProviderAnticipationSimulation>("POST", "/anticipations/simulate", input);
  }
  createAnticipation(input: Record<string, unknown>) {
    return this.request<ProviderAnticipation>("POST", "/anticipations", input);
  }
  /** Pix Automático (Banco Central): autorização recorrente com QR de adesão. */
  createPixAutomaticAuthorization(input: Record<string, unknown>) {
    return this.request<PixAutomaticAuthorization>("POST", "/pix/automatic/authorizations", input);
  }
  getPixAutomaticAuthorization(id: string) {
    return this.request<PixAutomaticAuthorization>("GET", `/pix/automatic/authorizations/${encodeURIComponent(id)}`);
  }
  cancelPixAutomaticAuthorization(id: string) {
    return this.request("DELETE", `/pix/automatic/authorizations/${encodeURIComponent(id)}`);
  }
}

export const frequencyToCycle: Record<string, string> = {
  weekly: "WEEKLY",
  biweekly: "BIWEEKLY",
  monthly: "MONTHLY",
  bimonthly: "BIMONTHLY",
  quarterly: "QUARTERLY",
  semiannual: "SEMIANNUALLY",
  semiannually: "SEMIANNUALLY",
  yearly: "YEARLY",
};

export function billingTypeToMethod(billingType?: string | null): "pix" | "boleto" | "credit_card" | "debit_card" | null {
  if (billingType === "PIX") return "pix";
  if (billingType === "BOLETO") return "boleto";
  if (billingType === "CREDIT_CARD") return "credit_card";
  if (billingType === "DEBIT_CARD") return "debit_card";
  return null;
}

/** Converte o evento do Asaas em status interno. `null` = evento sem efeito no status. */
export function eventToStatus(event: string): string | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "paid";
    case "PAYMENT_OVERDUE":
      return "overdue";
    case "PAYMENT_DELETED":
      return "cancelled";
    case "PAYMENT_REFUNDED":
      return "refunded";
    case "PAYMENT_AWAITING_RISK_ANALYSIS":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return "in_analysis";
    case "PAYMENT_REPROVED_BY_RISK_ANALYSIS":
      return "failed";
    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED":
      return "awaiting_payment";
    default:
      return null;
  }
}
