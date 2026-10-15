/** Montagem pura dos corpos enviados ao provedor fiscal (testável, sem rede). */
export type SubscriptionRule = "ON_PAYMENT_CONFIRMATION" | "ON_PAYMENT_DUE_DATE" | "BEFORE_PAYMENT_DUE_DATE" | "ON_DUE_DATE_MONTH" | "ON_NEXT_MONTH";

export type FiscalServiceRow = {
  name: string;
  municipal_service_id: string | null;
  municipal_service_code: string | null;
  municipal_service_name: string | null;
  iss: number | string | null;
  retain_iss: boolean;
  taxes: unknown;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Corpo de POST /v3/subscriptions/{id}/invoiceSettings conforme OpenAPI oficial. */
export function buildSubscriptionInvoiceSettings(
  fs: FiscalServiceRow,
  opts: { rule: SubscriptionRule; days?: number | null; observations?: string | null },
): Record<string, unknown> {
  if (!fs.municipal_service_code) throw new Error("Serviço fiscal sem código de serviço.");
  const t = (fs.taxes && typeof fs.taxes === "object" ? fs.taxes : {}) as Record<string, unknown>;
  const taxes: Record<string, unknown> = {
    retainIss: Boolean(fs.retain_iss),
    iss: num(fs.iss),
    pis: num(t["pis"]), cofins: num(t["cofins"]), csll: num(t["csll"]), inss: num(t["inss"]), ir: num(t["ir"]),
  };
  // Campos opcionais oficiais (Portal Nacional / reforma tributária) só quando informados.
  for (const k of ["nbsCode", "taxSituationCode", "taxClassificationCode", "operationIndicatorCode", "pisCofinsTaxStatus"]) {
    if (typeof t[k] === "string" && t[k]) taxes[k] = t[k];
  }
  const body: Record<string, unknown> = {
    municipalServiceName: fs.municipal_service_name ?? fs.name,
    effectiveDatePeriod: opts.rule,
    receivedOnly: opts.rule === "ON_PAYMENT_CONFIRMATION",
    updatePayment: false,
    deductions: 0,
    observations: opts.observations || "Nota emitida pelo Wiize Core.",
    taxes,
  };
  if (opts.rule === "BEFORE_PAYMENT_DUE_DATE") body["daysBeforeDueDate"] = opts.days ?? 5;
  body["municipalServiceCode"] = fs.municipal_service_code;
  return body;
}
