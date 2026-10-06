/**
 * NFS-e via provedor (Asaas). Somente servidor. Endpoints conferidos na documentação oficial:
 * GET  /fiscalInfo/municipalOptions · GET /fiscalInfo (404 = sem configuração) · POST /fiscalInfo
 * GET  /fiscalInfo/services · POST /invoices · GET /invoices/{id}
 * POST /invoices/{id}/authorize · POST /invoices/{id}/cancel · POST /subscriptions/{id}/invoiceSettings
 */
import { ASAAS_BASE_URLS } from "./asaas.server";
import { decryptSecret } from "./crypto.server";
import { canTransition, invoiceStatusFromEvent, type InvoiceStatus } from "./invoice-status";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export class FiscalProviderError extends Error {
  constructor(message: string, public status: number, public technical: string) {
    super(message);
  }
}

export type MunicipalOptions = {
  authenticationType?: "CERTIFICATE" | "TOKEN" | "USER_AND_PASSWORD" | null;
  supportsCancellation?: boolean;
  usesSpecialTaxRegimes?: boolean;
  usesServiceListItem?: boolean;
  usesStateInscription?: boolean;
  specialTaxRegimesList?: { label: string; value: string }[] | null;
  municipalInscriptionHelp?: string | null;
  specialTaxRegimeHelp?: string | null;
  serviceListItemHelp?: string | null;
  digitalCertificatedHelp?: string | null;
  accessTokenHelp?: string | null;
  municipalServiceCodeHelp?: string | null;
};

export type ProviderInvoice = {
  id: string;
  status?: string;
  number?: string | null;
  validationCode?: string | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  externalReference?: string | null;
  statusDescription?: string | null;
  effectiveDate?: string | null;
};

/** Converte erro do provedor em frase amigável; o texto técnico vai só para logs. */
export function friendlyFiscalError(status: number, description?: string): string {
  if (status === 401 || status === 403) return "Não foi possível acessar o emissor de notas. Tente novamente mais tarde.";
  if (status >= 500) return "O emissor de notas está instável agora. Tente novamente em alguns minutos.";
  if (description && description.length < 220 && !/[{}<>]/.test(description)) return description;
  return "Existe uma inconsistência nos dados fiscais ou na configuração do município.";
}

export async function getFiscalClient(admin: AdminClient, tenantId: string) {
  const { data } = await admin
    .from("provider_connections")
    .select("environment, api_key_ciphertext, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "asaas")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.api_key_ciphertext) return null;
  const environment = data.environment as "sandbox" | "production";
  const apiKey = decryptSecret(data.api_key_ciphertext);
  const base = ASAAS_BASE_URLS[environment];

  async function call<T>(method: string, path: string, body?: unknown, opts: { allow404?: boolean; form?: FormData } = {}): Promise<T | null> {
    const headers: Record<string, string> = { access_token: apiKey, accept: "application/json", "user-agent": "WiizePay" };
    if (!opts.form) headers["content-type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: opts.form ?? (body ? JSON.stringify(body) : null) });
    const text = await res.text();
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      console.error(`NFS-e ${method} ${path.split("?")[0]!.replace(/\/[A-Za-z0-9_-]{8,}/g, "/:id")} [${res.status}]`);
      let desc: string | undefined;
      try { desc = (JSON.parse(text) as { errors?: { description?: string }[] }).errors?.[0]?.description; } catch { /* não-JSON */ }
      throw new FiscalProviderError(friendlyFiscalError(res.status, desc), res.status, text.slice(0, 800));
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    environment,
    municipalOptions: () => call<MunicipalOptions>("GET", "/fiscalInfo/municipalOptions"),
    fiscalInfo: () => call<Record<string, unknown>>("GET", "/fiscalInfo", undefined, { allow404: true }),
    saveFiscalInfo: (form: FormData) => call<Record<string, unknown>>("POST", "/fiscalInfo", undefined, { form }),
    municipalServices: (description?: string) =>
      call<{ data?: { id: string; description: string }[] }>("GET", `/fiscalInfo/services?limit=100${description ? `&description=${encodeURIComponent(description)}` : ""}`),
    createInvoice: (body: Record<string, unknown>) => call<ProviderInvoice>("POST", "/invoices", body),
    getInvoice: (id: string) => call<ProviderInvoice>("GET", `/invoices/${encodeURIComponent(id)}`),
    authorizeInvoice: (id: string) => call<ProviderInvoice>("POST", `/invoices/${encodeURIComponent(id)}/authorize`),
    cancelInvoice: (id: string) => call<ProviderInvoice>("POST", `/invoices/${encodeURIComponent(id)}/cancel`, {}),
    subscriptionInvoiceSettings: (subId: string, body: Record<string, unknown>) =>
      call<Record<string, unknown>>("POST", `/subscriptions/${encodeURIComponent(subId)}/invoiceSettings`, body),
  };
}

/** Lista o que falta na configuração, com frases para o usuário. Apenas regras vindas das opções municipais. */
export function missingFiscalFields(s: Record<string, any> | null, opts: MunicipalOptions | null): string[] {
  const miss: string[] = [];
  if (!s) return ["Dados fiscais da empresa"];
  if (!s["municipal_inscription"]) miss.push("Falta informar sua inscrição municipal.");
  if (s["simples_nacional"] === null || s["simples_nacional"] === undefined) miss.push("Falta informar se a empresa é do Simples Nacional.");
  if (!s["rps_serie"] && s["portal"] !== "national") miss.push("Falta informar a série do RPS.");
  if (!s["rps_number"] && s["portal"] !== "national") miss.push("Falta informar o próximo número do RPS.");
  if (opts?.usesSpecialTaxRegimes && !s["special_tax_regime"]) miss.push("Falta informar o regime especial de tributação.");
  if (opts?.usesServiceListItem && !s["service_list_item"]) miss.push("Falta informar o item da lista de serviço.");
  if (opts?.authenticationType && !s["credentials_configured"]) miss.push("Falta informar o acesso ao portal da prefeitura.");
  return miss;
}

/** Aplica evento de NFS-e já autenticado e persistido em webhook_events. Idempotente. */
export async function processInvoiceWebhook(
  admin: AdminClient,
  event: { id: string; tenant_id: string; event_type: string; external_event_id: string; payload: unknown },
) {
  const payload = event.payload as { invoice?: ProviderInvoice & Record<string, unknown> };
  const inv = payload.invoice;
  const done = (status: "processed" | "discarded", msg?: string) =>
    admin.from("webhook_events").update({ processing_status: status, error_message: msg ?? null, processed_at: new Date().toISOString() }).eq("id", event.id);
  if (!inv?.id) return done("discarded", "Evento sem nota");

  let { data: row } = await admin.from("invoices").select("*").eq("tenant_id", event.tenant_id).eq("provider_invoice_id", inv.id).maybeSingle();
  if (!row && inv.externalReference) {
    const { data } = await admin.from("invoices").select("*").eq("tenant_id", event.tenant_id).eq("id", inv.externalReference).maybeSingle();
    row = data;
  }
  if (!row && typeof inv["payment"] === "string") {
    // Nota criada pelo provedor a partir da regra de uma recorrência: registra no histórico do tenant.
    const { data: pay } = await admin.from("payments").select("id, customer_id, service_id, charge_group_id, gross_amount, description")
      .eq("tenant_id", event.tenant_id).eq("provider_payment_id", inv["payment"] as string).maybeSingle();
    if (pay) {
      const { data: conn } = await admin.from("provider_connections").select("environment").eq("tenant_id", event.tenant_id).maybeSingle();
      const { data: created } = await admin.from("invoices").insert({
        tenant_id: event.tenant_id, customer_id: pay.customer_id, service_id: pay.service_id, payment_id: pay.id,
        charge_group_id: pay.charge_group_id, origin: "automatic", status: "SCHEDULED",
        value: Number(inv["value"] ?? pay.gross_amount), deductions: Number(inv["deductions"] ?? 0),
        service_description: String(inv["serviceDescription"] ?? pay.description ?? "Serviço"),
        effective_date: String(inv.effectiveDate ?? new Date().toISOString().slice(0, 10)),
        provider: "asaas", provider_invoice_id: inv.id, environment: conn?.environment ?? "sandbox",
      } as never).select("*").maybeSingle();
      row = created;
    }
  }
  if (!row) return done("discarded", "Nota desconhecida");

  const { error: dupErr } = await admin.from("invoice_events").insert({
    tenant_id: row.tenant_id, invoice_id: row.id, event_type: event.event_type,
    status: inv.status ?? null, message: inv.statusDescription ?? null, provider_event_id: event.external_event_id,
  });
  if (dupErr) return done("processed", "Evento repetido"); // índice único: já aplicado

  const next = invoiceStatusFromEvent(event.event_type, inv.status ?? null);
  const patch: Record<string, unknown> = {
    last_provider_event_id: event.external_event_id,
    provider_invoice_id: inv.id,
    ...(inv.number ? { number: String(inv.number) } : {}),
    ...(inv.validationCode ? { validation_code: inv.validationCode } : {}),
    ...(inv.pdfUrl ? { pdf_url: inv.pdfUrl } : {}),
    ...(inv.xmlUrl ? { xml_url: inv.xmlUrl } : {}),
  };
  const current = row.status as InvoiceStatus;
  const changed = next && canTransition(current, next);
  if (changed) {
    patch["status"] = next;
    if (next === "AUTHORIZED") { patch["authorized_at"] = new Date().toISOString(); patch["error_message"] = null; }
    if (next === "CANCELED") patch["canceled_at"] = new Date().toISOString();
    if (next === "ERROR") patch["error_message"] = (inv.statusDescription ?? "Não foi possível emitir esta nota.").slice(0, 500);
  }
  await admin.from("invoices").update(patch as never).eq("id", row.id);
  if (changed && next === "AUTHORIZED") await chargeInvoiceFee(admin, row.id, row.tenant_id);


  if (changed) {
    const brl = Number(row.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const note =
      next === "AUTHORIZED" ? { title: "Nota fiscal autorizada", body: `Nota fiscal de ${brl} autorizada.` }
      : next === "ERROR" ? { title: "Erro na nota fiscal", body: "Não foi possível emitir uma nota fiscal." }
      : next === "CANCELED" ? { title: "Nota fiscal cancelada", body: "A NFS-e foi cancelada." }
      : next === "CANCELLATION_DENIED" ? { title: "Cancelamento recusado", body: "A prefeitura recusou o cancelamento da NFS-e." }
      : null;
    if (note) await admin.from("notifications").insert({ tenant_id: row.tenant_id, kind: `invoice.${next!.toLowerCase()}`, title: note.title, body: note.body, link: `/notas-fiscais/${row.id}` });
    await admin.from("audit_logs").insert({
      tenant_id: row.tenant_id, action: `invoice.${next!.toLowerCase()}`, resource: "invoices", resource_id: row.id,
      result: next === "ERROR" ? "failure" : "success", metadata: { source: "webhook", event: event.event_type } as never,
    });
  }
  return done("processed");
}

/** Emissão automática na confirmação do pagamento (cobranças não recorrentes; recorrências usam a regra do provedor). */
export async function autoIssueOnPayment(admin: AdminClient, paymentId: string) {
  const { data: p } = await admin.from("payments").select("id, tenant_id, customer_id, service_id, subscription_id, gross_amount, description, provider_payment_id, installment_count").eq("id", paymentId).maybeSingle();
  if (!p || p.subscription_id || !p.provider_payment_id) return;
  const { data: s } = await admin.from("fiscal_settings").select("*").eq("tenant_id", p.tenant_id).maybeSingle();
  if (!s?.auto_issue || s.auto_issue_rule !== "ON_PAYMENT_CONFIRMATION" || s.config_status !== "configured") return;
  const { data: exists } = await admin.from("invoices").select("id").eq("payment_id", p.id).not("status", "in", "(ERROR,CANCELED)").maybeSingle();
  if (exists) return;
  let fs = null as null | Record<string, any>;
  if (p.service_id) fs = (await admin.from("fiscal_services").select("*").eq("service_id", p.service_id).eq("active", true).maybeSingle()).data;
  if (!fs && s.default_fiscal_service_id) fs = (await admin.from("fiscal_services").select("*").eq("id", s.default_fiscal_service_id).eq("active", true).maybeSingle()).data;
  if (!fs) return;
  await issueInvoice(admin, {
    tenantId: p.tenant_id, userId: null, origin: "automatic", paymentId: p.id, chargeGroupId: null, customerId: p.customer_id,
    serviceId: p.service_id, fiscalService: fs, value: Number(p.gross_amount), description: fs["description"] || fs["name"] || p.description || "Serviço",
    observations: s.default_observations ?? null, effectiveDate: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10),
    providerTarget: { payment: p.provider_payment_id },
  }).catch((e) => console.error("Emissão automática falhou", e instanceof Error ? e.message : e));
}

export type IssueInput = {
  tenantId: string;
  userId: string | null;
  origin: "payment" | "installment" | "standalone" | "automatic";
  paymentId: string | null;
  chargeGroupId: string | null;
  customerId: string | null;
  serviceId: string | null;
  fiscalService: Record<string, any>;
  value: number;
  description: string;
  observations: string | null;
  effectiveDate: string;
  providerTarget: { payment?: string; installment?: string; customer?: string };
};

/** Cria o registro local (trava contra duplicidade) e agenda no provedor. Nunca marca como emitida. */
export async function issueInvoice(admin: AdminClient, input: IssueInput) {
  const client = await getFiscalClient(admin, input.tenantId);
  if (!client) throw new Error("Sua conta de recebimentos ainda não está conectada.");
  const fs = input.fiscalService;
  const { data: row, error } = await admin.from("invoices").insert({
    tenant_id: input.tenantId, customer_id: input.customerId, service_id: input.serviceId, fiscal_service_id: fs["id"],
    payment_id: input.paymentId, charge_group_id: input.chargeGroupId, origin: input.origin, status: "PENDING",
    value: input.value, service_description: input.description, observations: input.observations,
    effective_date: input.effectiveDate, municipal_service_code: fs["municipal_service_code"] ?? null,
    municipal_service_name: fs["municipal_service_name"] ?? fs["name"], environment: client.environment, requested_by: input.userId,
  }).select("*").single();
  if (error || !row) {
    if (error?.code === "23505") throw new Error("Já existe uma nota fiscal ativa para esta cobrança.");
    throw new Error("Não foi possível registrar a nota.");
  }
  await admin.from("invoice_events").insert({ tenant_id: input.tenantId, invoice_id: row.id, event_type: "REQUESTED", status: "PENDING", actor_id: input.userId });

  const taxes = { retainIss: Boolean(fs["retain_iss"]), iss: Number(fs["iss"] ?? 0), cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0, ...(fs["taxes"] ?? {}) };
  const body: Record<string, unknown> = {
    ...input.providerTarget,
    serviceDescription: input.description.slice(0, 2000),
    observations: (input.observations ?? "").slice(0, 2000) || "Nota emitida pelo WiizePay.",
    externalReference: row.id,
    value: input.value,
    deductions: 0,
    effectiveDate: input.effectiveDate,
    municipalServiceName: fs["municipal_service_name"] ?? fs["name"],
    taxes,
  };
  if (fs["municipal_service_id"]) body["municipalServiceId"] = fs["municipal_service_id"];
  else body["municipalServiceCode"] = fs["municipal_service_code"];

  try {
    const created = await client.createInvoice(body);
    const st = created?.status && ["SCHEDULED", "SYNCHRONIZED", "AUTHORIZED", "ERROR"].includes(created.status) ? created.status : "SCHEDULED";
    await admin.from("invoices").update({ provider_invoice_id: created!.id, status: st === "AUTHORIZED" ? "SYNCHRONIZED" : st }).eq("id", row.id);
    await admin.from("audit_logs").insert({ tenant_id: input.tenantId, user_id: input.userId, action: "invoice.requested", resource: "invoices", resource_id: row.id, result: "success", metadata: { origin: input.origin, payment_id: input.paymentId, customer_id: input.customerId, service_id: input.serviceId } as never });
    return { id: row.id as string, status: st === "AUTHORIZED" ? "SYNCHRONIZED" : st };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível emitir a nota.";
    await admin.from("invoices").update({ status: "ERROR", error_message: msg.slice(0, 500) }).eq("id", row.id);
    await admin.from("invoice_events").insert({ tenant_id: input.tenantId, invoice_id: row.id, event_type: "INVOICE_ERROR", status: "ERROR", message: msg.slice(0, 500) });
    await admin.from("audit_logs").insert({ tenant_id: input.tenantId, user_id: input.userId, action: "invoice.requested", resource: "invoices", resource_id: row.id, result: "failure", metadata: { technical: e instanceof FiscalProviderError ? e.technical.slice(0, 400) : null } as never });
    throw new Error(msg);
  }
}

/** Liga avisos de NFS-e reutilizando o mesmo token já cadastrado (não invalida o aviso de pagamentos). */
export async function ensureInvoiceWebhook(admin: AdminClient, tenantId: string, userEmail: string | null) {
  const { data: s } = await admin.from("fiscal_settings").select("invoice_webhook_id").eq("tenant_id", tenantId).maybeSingle();
  if (s?.invoice_webhook_id) return;
  const { data: conn } = await admin.from("provider_connections").select("environment, api_key_ciphertext, webhook_token_ciphertext, webhook_url")
    .eq("tenant_id", tenantId).eq("provider", "asaas").eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.api_key_ciphertext || !conn.webhook_token_ciphertext || !conn.webhook_url) return;
  const { INVOICE_EVENTS } = await import("./invoice-status");
  const res = await fetch(`${ASAAS_BASE_URLS[conn.environment as string]}/webhooks`, {
    method: "POST",
    headers: { access_token: decryptSecret(conn.api_key_ciphertext), "content-type": "application/json", accept: "application/json", "user-agent": "WiizePay" },
    body: JSON.stringify({
      name: "WiizePay NFS-e", url: conn.webhook_url, email: userEmail ?? "wiizepay@gmail.com", enabled: true, interrupted: false,
      apiVersion: 3, authToken: decryptSecret(conn.webhook_token_ciphertext), sendType: "SEQUENTIALLY", events: [...INVOICE_EVENTS],
    }),
  });
  const text = await res.text();
  if (!res.ok) { console.error("Aviso de NFS-e não registrado", res.status); return; }
  const id = (JSON.parse(text) as { id?: string }).id ?? "registered";
  await admin.from("fiscal_settings").update({ invoice_webhook_id: id }).eq("tenant_id", tenantId);
}

/**
 * Taxa por nota autorizada (platform_settings.invoice_fee_amount): o emissor desconta R$ 0,49 direto da subconta;
 * os R$ 2,00 da WiizePay são transferidos da subconta para a conta principal. Uma única vez por nota.
 */
export async function chargeInvoiceFee(admin: AdminClient, invoiceId: string, tenantId: string) {
  const { data: margin, error } = await admin.rpc("charge_invoice_fee" as never, { _invoice_id: invoiceId } as never);
  const wiize = Number(margin ?? 0);
  if (error || wiize <= 0) return;
  const walletId = process.env["ASAAS_MASTER_WALLET_ID"];
  const { getTenantProvider } = await import("./billing.server");
  const prov = await getTenantProvider(admin, tenantId);
  if (!walletId || !prov) return;
  try {
    const t = await prov.provider.createTransfer({ value: wiize, walletId, description: `Taxa WiizePay — nota fiscal ${invoiceId}` });
    await admin.from("invoices").update({ fee_transfer_id: t.id } as never).eq("id", invoiceId);
  } catch (e) {
    await admin.from("audit_logs").insert({
      tenant_id: tenantId, action: "invoice.fee_transfer", resource: "invoices", resource_id: invoiceId,
      result: "failure", metadata: { error: e instanceof Error ? e.message : "erro" } as never,
    });
  }
}
