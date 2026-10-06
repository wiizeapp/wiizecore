import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { from: (t: string) => any }; userId: string; claims?: { email?: string } };
const WRITE = ["owner", "admin", "finance"];

async function membership(context: Ctx, write = true) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).limit(1).maybeSingle();
  if (!data || (write && !WRITE.includes(data.role))) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
const todayBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/** Visão da configuração fiscal: status, faltas, opções municipais (sem segredos) e progresso da jornada. */
export const getFiscalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx, false);
    const db = await admin();
    const [{ data: settings }, { data: services }, { data: tenant }, { count: invoiceCount }, { data: conn }] = await Promise.all([
      db.from("fiscal_settings").select("*").eq("tenant_id", m.tenant_id).maybeSingle(),
      db.from("fiscal_services").select("id, name, description, municipal_service_id, municipal_service_code, municipal_service_name, iss, retain_iss, service_id, active").eq("tenant_id", m.tenant_id).order("created_at"),
      db.from("tenants").select("name, legal_name, document, city, state").eq("id", m.tenant_id).maybeSingle(),
      db.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", m.tenant_id).eq("status", "AUTHORIZED"),
      db.from("provider_connections").select("environment").eq("tenant_id", m.tenant_id).eq("provider", "asaas").eq("status", "connected").limit(1).maybeSingle(),
    ]);
    const s = settings as Record<string, any> | null;
    const opts = (s?.["municipal_options"] ?? {}) as Record<string, any>;
    const activeServices = (services ?? []).filter((x) => x.active);
    const steps = {
      company: Boolean(tenant?.document && tenant?.city),
      municipality: Boolean(s && Object.keys(opts).length),
      fiscal: s?.["config_status"] === "configured",
      service: activeServices.length > 0,
      issuance: (invoiceCount ?? 0) > 0,
    };
    return {
      connected: Boolean(conn),
      environment: (conn?.environment ?? "sandbox") as "sandbox" | "production",
      canEdit: WRITE.includes(m.role),
      tenant,
      settings: s ? {
        portal: s["portal"], email: s["email"], municipalInscription: s["municipal_inscription"], simplesNacional: s["simples_nacional"],
        culturalProjectsPromoter: s["cultural_projects_promoter"], cnae: s["cnae"], specialTaxRegime: s["special_tax_regime"],
        serviceListItem: s["service_list_item"], nbsCode: s["nbs_code"], rpsSerie: s["rps_serie"], rpsNumber: s["rps_number"],
        loteNumber: s["lote_number"], nationalRegime: s["national_portal_tax_calculation_regime"],
        credentialsConfigured: s["credentials_configured"], configStatus: s["config_status"] as "pending" | "configured" | "attention",
        missing: (s["missing"] ?? []) as string[], autoIssue: s["auto_issue"], autoIssueRule: s["auto_issue_rule"], autoIssueDays: s["auto_issue_days"],
        defaultFiscalServiceId: s["default_fiscal_service_id"], defaultObservations: s["default_observations"],
        productionConfirmed: Boolean(s["production_confirmed_at"]), lastSyncedAt: s["last_synced_at"],
      } : null,
      options: opts as {
        authenticationType?: "CERTIFICATE" | "TOKEN" | "USER_AND_PASSWORD" | null; supportsCancellation?: boolean; usesSpecialTaxRegimes?: boolean;
        usesServiceListItem?: boolean; specialTaxRegimesList?: { label: string; value: string }[] | null; municipalInscriptionHelp?: string | null;
        specialTaxRegimeHelp?: string | null; serviceListItemHelp?: string | null; digitalCertificatedHelp?: string | null; accessTokenHelp?: string | null;
        municipalServiceCodeHelp?: string | null;
      },
      services: services ?? [],
      steps,
      stepsDone: Object.values(steps).filter(Boolean).length,
    };
  });

/** Consulta exigências do município e a configuração atual no provedor (404 = ainda não configurado). */
export const refreshMunicipalOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const { getFiscalClient, missingFiscalFields } = await import("./asaas-invoices.server");
    const client = await getFiscalClient(db, m.tenant_id);
    if (!client) throw new Error("Conclua a ativação de pagamentos antes de configurar notas fiscais.");
    const opts = await client.municipalOptions();
    const remote = await client.fiscalInfo();
    const { data: cur } = await db.from("fiscal_settings").select("*").eq("tenant_id", m.tenant_id).maybeSingle();
    const merged: Record<string, any> = { ...(cur ?? { portal: "municipal", credentials_configured: false }) };
    if (remote) {
      merged["municipal_inscription"] ??= remote["municipalInscription"] ?? null;
      merged["simples_nacional"] ??= remote["simplesNacional"] ?? null;
      merged["cnae"] ??= remote["cnae"] ?? null;
      merged["rps_serie"] ??= remote["rpsSerie"] ?? null;
      merged["rps_number"] ??= remote["rpsNumber"] ?? null;
      merged["email"] ??= remote["email"] ?? null;
    }
    const missing = remote ? missingFiscalFields(merged, opts) : ["Configuração fiscal ainda não realizada."];
    const row = {
      tenant_id: m.tenant_id, municipal_options: (opts ?? {}) as never, last_synced_at: new Date().toISOString(),
      municipal_inscription: merged["municipal_inscription"], simples_nacional: merged["simples_nacional"], cnae: merged["cnae"],
      rps_serie: merged["rps_serie"], rps_number: merged["rps_number"], email: merged["email"],
      config_status: !remote ? "pending" : missing.length ? "attention" : "configured", missing: missing as never,
    };
    await db.from("fiscal_settings").upsert(row as never, { onConflict: "tenant_id" });
    return { configured: Boolean(remote), missing };
  });

const settingsSchema = z.object({
  portal: z.enum(["municipal", "national"]),
  email: z.string().email().max(200).nullable().optional(),
  municipalInscription: z.string().trim().max(40).nullable().optional(),
  simplesNacional: z.boolean(),
  culturalProjectsPromoter: z.boolean().default(false),
  cnae: z.string().trim().max(20).nullable().optional(),
  specialTaxRegime: z.string().trim().max(40).nullable().optional(),
  serviceListItem: z.string().trim().max(40).nullable().optional(),
  nbsCode: z.string().trim().max(40).nullable().optional(),
  rpsSerie: z.string().trim().max(20).nullable().optional(),
  rpsNumber: z.number().int().min(1).max(999999999).nullable().optional(),
  loteNumber: z.number().int().min(1).max(999999999).nullable().optional(),
  nationalRegime: z.string().trim().max(40).nullable().optional(),
  // Credenciais: repassadas ao provedor e descartadas; nunca gravadas no WiizePay.
  username: z.string().max(200).optional(),
  password: z.string().max(200).optional(),
  accessToken: z.string().max(2000).optional(),
  certificateBase64: z.string().max(200_000).optional(),
  certificateName: z.string().max(200).optional(),
  certificatePassword: z.string().max(200).optional(),
  confirmProduction: z.boolean().optional(),
});

export const saveFiscalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const { getFiscalClient, missingFiscalFields, ensureInvoiceWebhook } = await import("./asaas-invoices.server");
    const client = await getFiscalClient(db, m.tenant_id);
    if (!client) throw new Error("Conclua a ativação de pagamentos antes de configurar notas fiscais.");
    const { data: cur } = await db.from("fiscal_settings").select("*").eq("tenant_id", m.tenant_id).maybeSingle();
    if (client.environment === "production" && !cur?.production_confirmed_at && !data.confirmProduction) {
      throw new Error("Confirme o uso do ambiente de produção: esta ação poderá gerar documentos fiscais válidos.");
    }
    const opts = (cur?.municipal_options ?? {}) as Record<string, any>;

    const form = new FormData();
    const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== "") form.append(k, String(v)); };
    put("email", data.email ?? (context as Ctx).claims?.email);
    put("municipalInscription", data.municipalInscription);
    put("simplesNacional", data.simplesNacional);
    put("culturalProjectsPromoter", data.culturalProjectsPromoter);
    put("cnae", data.cnae);
    put("specialTaxRegime", data.specialTaxRegime);
    put("serviceListItem", data.serviceListItem);
    put("nbsCode", data.nbsCode);
    put("rpsSerie", data.rpsSerie);
    put("rpsNumber", data.rpsNumber);
    put("loteNumber", data.loteNumber);
    if (data.portal === "national") put("nationalPortalTaxCalculationRegime", data.nationalRegime);
    put("username", data.username);
    put("password", data.password);
    put("accessToken", data.accessToken);
    if (data.certificateBase64) {
      const bytes = Uint8Array.from(atob(data.certificateBase64), (c) => c.charCodeAt(0));
      form.append("certificateFile", new Blob([bytes], { type: "application/x-pkcs12" }), data.certificateName ?? "certificado.pfx");
      put("certificatePassword", data.certificatePassword);
    }
    await client.saveFiscalInfo(form);

    const sentCredentials = Boolean(data.password || data.accessToken || data.certificateBase64);
    const row: Record<string, any> = {
      tenant_id: m.tenant_id, portal: data.portal, email: data.email ?? null, municipal_inscription: data.municipalInscription ?? null,
      simples_nacional: data.simplesNacional, cultural_projects_promoter: data.culturalProjectsPromoter, cnae: data.cnae ?? null,
      special_tax_regime: data.specialTaxRegime ?? null, service_list_item: data.serviceListItem ?? null, nbs_code: data.nbsCode ?? null,
      rps_serie: data.rpsSerie ?? null, rps_number: data.rpsNumber ?? null, lote_number: data.loteNumber ?? null,
      national_portal_tax_calculation_regime: data.nationalRegime ?? null,
      credentials_configured: sentCredentials || Boolean(cur?.credentials_configured),
      ...(data.confirmProduction ? { production_confirmed_at: new Date().toISOString() } : {}),
    };
    const remote = await client.fiscalInfo();
    const missing = remote ? missingFiscalFields(row, opts) : ["Configuração fiscal ainda não realizada."];
    row["missing"] = missing;
    row["config_status"] = !remote ? "pending" : missing.length ? "attention" : "configured";
    row["last_synced_at"] = new Date().toISOString();
    await db.from("fiscal_settings").upsert(row as never, { onConflict: "tenant_id" });
    await ensureInvoiceWebhook(db, m.tenant_id, (context as Ctx).claims?.email ?? null);
    await db.from("audit_logs").insert({ tenant_id: m.tenant_id, user_id: context.userId, action: "fiscal.settings_saved", resource: "fiscal_settings", result: "success", metadata: { portal: data.portal, credentials_updated: sentCredentials } as never });
    return { status: row["config_status"] as string, missing };
  });

export const searchMunicipalServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const { data: s } = await db.from("fiscal_settings").select("portal").eq("tenant_id", m.tenant_id).maybeSingle();
    if (s?.portal === "national") return { available: false, items: [] };
    const { getFiscalClient } = await import("./asaas-invoices.server");
    const client = await getFiscalClient(db, m.tenant_id);
    if (!client) return { available: false, items: [] };
    const res = await client.municipalServices(data.q);
    const items = (res?.data ?? []).map((x) => ({ id: String(x.id), description: String(x.description) }));
    return { available: items.length > 0 || Boolean(data.q), items };
  });

const fiscalServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  municipalServiceId: z.string().trim().max(40).nullable().optional(),
  municipalServiceCode: z.string().trim().max(40).nullable().optional(),
  municipalServiceName: z.string().trim().max(300).nullable().optional(),
  iss: z.number().min(0).max(100).nullable().optional(),
  retainIss: z.boolean().default(false),
  serviceId: z.string().uuid().nullable().optional(),
}).refine((v) => v.municipalServiceId || v.municipalServiceCode, { message: "Informe o código do serviço municipal." });

export const saveFiscalService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => fiscalServiceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    if (data.serviceId) {
      const { data: svc } = await db.from("services").select("id").eq("id", data.serviceId).eq("tenant_id", m.tenant_id).maybeSingle();
      if (!svc) throw new Error("Serviço não encontrado.");
      await db.from("fiscal_services").update({ service_id: null }).eq("tenant_id", m.tenant_id).eq("service_id", data.serviceId).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const row = {
      tenant_id: m.tenant_id, name: data.name, description: data.description ?? null,
      municipal_service_id: data.municipalServiceId || null, municipal_service_code: data.municipalServiceCode || null,
      municipal_service_name: data.municipalServiceName ?? data.name, iss: data.iss ?? null, retain_iss: data.retainIss,
      service_id: data.serviceId ?? null, active: true,
    };
    if (data.id) {
      const { error } = await db.from("fiscal_services").update(row).eq("id", data.id).eq("tenant_id", m.tenant_id);
      if (error) throw new Error("Não foi possível salvar o serviço fiscal.");
      return { id: data.id };
    }
    const { data: ins, error } = await db.from("fiscal_services").insert({ ...row, created_by: context.userId }).select("id").single();
    if (error) throw new Error("Não foi possível salvar o serviço fiscal.");
    return { id: ins.id };
  });

export const archiveFiscalService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    await db.from("fiscal_services").update({ active: false, service_id: null }).eq("id", data.id).eq("tenant_id", m.tenant_id);
    return { ok: true };
  });

export const saveIssuanceDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    autoIssue: z.boolean(),
    rule: z.enum(["ON_PAYMENT_CONFIRMATION", "ON_PAYMENT_DUE_DATE", "BEFORE_PAYMENT_DUE_DATE", "ON_DUE_DATE_MONTH", "ON_NEXT_MONTH"]),
    days: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).nullable(),
    defaultFiscalServiceId: z.string().uuid().nullable(),
    defaultObservations: z.string().max(2000).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    if (data.defaultFiscalServiceId) {
      const { data: fs } = await db.from("fiscal_services").select("id").eq("id", data.defaultFiscalServiceId).eq("tenant_id", m.tenant_id).maybeSingle();
      if (!fs) throw new Error("Serviço fiscal não encontrado.");
    }
    await db.from("fiscal_settings").upsert({
      tenant_id: m.tenant_id, auto_issue: data.autoIssue, auto_issue_rule: data.rule,
      auto_issue_days: data.rule === "BEFORE_PAYMENT_DUE_DATE" ? data.days ?? 5 : null,
      default_fiscal_service_id: data.defaultFiscalServiceId, default_observations: data.defaultObservations,
    } as never, { onConflict: "tenant_id" });
    return { ok: true };
  });

/** Cobranças e parcelamentos que podem receber nota (existem no provedor, não canceladas, sem nota ativa). */
export const listInvoiceSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const [{ data: pays }, { data: active }] = await Promise.all([
      db.from("payments").select("id, charge_group_id, description, gross_amount, due_on, method, status, installment_number, installment_count, provider_payment_id, provider_installment_id, customer_id, service_id, customers(name), services(name)")
        .eq("tenant_id", m.tenant_id).not("provider_payment_id", "is", null).not("status", "in", "(cancelled,refunded,failed)").order("due_on", { ascending: false }).limit(300),
      db.from("invoices").select("payment_id, charge_group_id, origin").eq("tenant_id", m.tenant_id).not("status", "in", "(ERROR,CANCELED)"),
    ]);
    const usedPay = new Set((active ?? []).map((a) => a.payment_id).filter(Boolean));
    const usedGroup = new Set((active ?? []).filter((a) => a.origin === "installment").map((a) => a.charge_group_id));
    const payments = (pays ?? []).filter((p) => !usedPay.has(p.id)).map((p: any) => ({
      id: p.id, description: p.description, amount: Number(p.gross_amount), dueOn: p.due_on, method: p.method, status: p.status,
      installment: p.installment_count ? `${p.installment_number}/${p.installment_count}` : null,
      customerId: p.customer_id, customer: p.customers?.name ?? "—", serviceId: p.service_id, service: p.services?.name ?? null,
    }));
    const groups = new Map<string, any>();
    for (const p of (pays ?? []) as any[]) {
      if (!p.provider_installment_id || usedGroup.has(p.charge_group_id)) continue;
      const g = groups.get(p.charge_group_id) ?? { id: p.charge_group_id, description: p.description, amount: 0, count: p.installment_count, customerId: p.customer_id, customer: p.customers?.name ?? "—", serviceId: p.service_id, service: p.services?.name ?? null, firstDue: p.due_on };
      g.amount += Number(p.gross_amount);
      if (p.due_on < g.firstDue) g.firstDue = p.due_on;
      groups.set(p.charge_group_id, g);
    }
    return { payments, installments: [...groups.values()] };
  });

const createSchema = z.object({
  origin: z.enum(["payment", "installment", "standalone"]),
  paymentId: z.string().uuid().optional(),
  chargeGroupId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  fiscalServiceId: z.string().uuid(),
  value: z.number().positive().max(10_000_000).optional(),
  description: z.string().trim().min(3).max(2000),
  observations: z.string().trim().max(2000).nullable().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const { data: s } = await db.from("fiscal_settings").select("config_status, missing").eq("tenant_id", m.tenant_id).maybeSingle();
    if (s?.config_status !== "configured") {
      const miss = (s?.missing as string[] | null)?.[0];
      throw new Error(miss ?? "Você precisa concluir sua configuração fiscal antes de emitir notas.");
    }
    const { data: fs } = await db.from("fiscal_services").select("*").eq("id", data.fiscalServiceId).eq("tenant_id", m.tenant_id).eq("active", true).maybeSingle();
    if (!fs) throw new Error("Selecione um serviço fiscal válido.");
    const eff = data.effectiveDate && data.effectiveDate > todayBR() ? data.effectiveDate : todayBR();
    const { issueInvoice } = await import("./asaas-invoices.server");

    if (data.origin === "payment") {
      if (!data.paymentId) throw new Error("Selecione a cobrança.");
      const { data: p } = await db.from("payments").select("id, customer_id, service_id, gross_amount, status, provider_payment_id").eq("id", data.paymentId).eq("tenant_id", m.tenant_id).maybeSingle();
      if (!p?.provider_payment_id || ["cancelled", "refunded", "failed"].includes(p.status)) throw new Error("Esta cobrança não pode receber nota fiscal.");
      return issueInvoice(db, { tenantId: m.tenant_id, userId: context.userId, origin: "payment", paymentId: p.id, chargeGroupId: null, customerId: p.customer_id, serviceId: p.service_id, fiscalService: fs, value: Number(p.gross_amount), description: data.description, observations: data.observations ?? null, effectiveDate: eff, providerTarget: { payment: p.provider_payment_id } });
    }
    if (data.origin === "installment") {
      if (!data.chargeGroupId) throw new Error("Selecione o parcelamento.");
      const { data: ps } = await db.from("payments").select("gross_amount, customer_id, service_id, provider_installment_id, status").eq("charge_group_id", data.chargeGroupId).eq("tenant_id", m.tenant_id);
      const inst = ps?.find((x) => x.provider_installment_id)?.provider_installment_id;
      if (!ps?.length || !inst) throw new Error("Este parcelamento não pode receber nota fiscal.");
      const total = ps.filter((x) => !["cancelled", "refunded", "failed"].includes(x.status)).reduce((t, x) => t + Number(x.gross_amount), 0);
      return issueInvoice(db, { tenantId: m.tenant_id, userId: context.userId, origin: "installment", paymentId: null, chargeGroupId: data.chargeGroupId, customerId: ps[0]!.customer_id, serviceId: ps[0]!.service_id, fiscalService: fs, value: Math.round(total * 100) / 100, description: data.description, observations: data.observations ?? null, effectiveDate: eff, providerTarget: { installment: inst } });
    }
    if (!data.customerId || !data.value) throw new Error("Informe o cliente e o valor.");
    const { data: c } = await db.from("customers").select("id, name, document, email, city, state, address, provider_customer_id").eq("id", data.customerId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!c) throw new Error("Cliente não encontrado.");
    if (!c.document) throw new Error("Este dado é necessário para emitir a NFS-e: CPF/CNPJ do cliente.");
    let providerCustomer = c.provider_customer_id;
    if (!providerCustomer) {
      const { getTenantProvider } = await import("./billing.server");
      const conn = await getTenantProvider(db, m.tenant_id);
      if (!conn) throw new Error("Sua conta de recebimentos ainda não está conectada.");
      const created = await conn.provider.createCustomer({ name: c.name, cpfCnpj: c.document, email: c.email ?? undefined, externalReference: c.id } as never);
      providerCustomer = created.id;
      await db.from("customers").update({ provider_customer_id: providerCustomer }).eq("id", c.id);
    }
    return issueInvoice(db, { tenantId: m.tenant_id, userId: context.userId, origin: "standalone", paymentId: null, chargeGroupId: null, customerId: c.id, serviceId: fs.service_id, fiscalService: fs, value: Math.round(data.value * 100) / 100, description: data.description, observations: data.observations ?? null, effectiveDate: eff, providerTarget: { customer: providerCustomer } });
  });

async function ownedInvoice(db: any, tenantId: string, id: string) {
  const { data } = await db.from("invoices").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) throw new Error("Nota não encontrada.");
  return data;
}

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const inv = await ownedInvoice(db, m.tenant_id, data.id);
    const { data: s } = await db.from("fiscal_settings").select("municipal_options").eq("tenant_id", m.tenant_id).maybeSingle();
    if (!(s?.municipal_options as any)?.supportsCancellation) throw new Error("O cancelamento automático não está disponível no seu município.");
    if (!inv.provider_invoice_id || !["AUTHORIZED", "CANCELLATION_DENIED", "SCHEDULED"].includes(inv.status)) throw new Error("Esta nota não pode ser cancelada agora.");
    const { getFiscalClient } = await import("./asaas-invoices.server");
    const client = await getFiscalClient(db, m.tenant_id);
    if (!client) throw new Error("Sua conta de recebimentos ainda não está conectada.");
    await client.cancelInvoice(inv.provider_invoice_id);
    await db.from("invoices").update({ status: inv.status === "SCHEDULED" ? "CANCELED" : "PROCESSING_CANCELLATION", ...(inv.status === "SCHEDULED" ? { canceled_at: new Date().toISOString() } : {}) }).eq("id", inv.id);
    await db.from("invoice_events").insert({ tenant_id: m.tenant_id, invoice_id: inv.id, event_type: "CANCEL_REQUESTED", actor_id: context.userId });
    await db.from("audit_logs").insert({ tenant_id: m.tenant_id, user_id: context.userId, action: "invoice.cancel_requested", resource: "invoices", resource_id: inv.id, result: "success", metadata: {} as never });
    return { ok: true };
  });

export const authorizeInvoiceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const inv = await ownedInvoice(db, m.tenant_id, data.id);
    if (inv.status !== "SCHEDULED" || !inv.provider_invoice_id) throw new Error("Somente notas agendadas podem ser antecipadas.");
    const { getFiscalClient } = await import("./asaas-invoices.server");
    const client = await getFiscalClient(db, m.tenant_id);
    if (!client) throw new Error("Sua conta de recebimentos ainda não está conectada.");
    await client.authorizeInvoice(inv.provider_invoice_id);
    await db.from("invoices").update({ status: "SYNCHRONIZED" }).eq("id", inv.id);
    await db.from("invoice_events").insert({ tenant_id: m.tenant_id, invoice_id: inv.id, event_type: "AUTHORIZE_REQUESTED", actor_id: context.userId });
    return { ok: true };
  });

/** Recuperação pontual (não é polling): atualiza documentos e status a partir do provedor. */
export const syncInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx, false);
    const db = await admin();
    const inv = await ownedInvoice(db, m.tenant_id, data.id);
    if (!inv.provider_invoice_id) return { ok: false };
    const { getFiscalClient } = await import("./asaas-invoices.server");
    const { canTransition } = await import("./invoice-status");
    const client = await getFiscalClient(db, m.tenant_id);
    const r = client ? await client.getInvoice(inv.provider_invoice_id) : null;
    if (!r) return { ok: false };
    const patch: Record<string, unknown> = {
      ...(r.number ? { number: String(r.number) } : {}), ...(r.validationCode ? { validation_code: r.validationCode } : {}),
      ...(r.pdfUrl ? { pdf_url: r.pdfUrl } : {}), ...(r.xmlUrl ? { xml_url: r.xmlUrl } : {}),
    };
    if (r.status && canTransition(inv.status, r.status as never)) {
      patch["status"] = r.status;
      if (r.status === "AUTHORIZED") patch["authorized_at"] = new Date().toISOString();
      if (r.status === "ERROR") patch["error_message"] = (r.statusDescription ?? inv.error_message ?? "Não foi possível emitir esta nota.").slice(0, 500);
    }
    await db.from("invoices").update(patch as never).eq("id", inv.id);
    return { ok: true };
  });

/** Emissão automática para uma recorrência, via configuração oficial de assinaturas do provedor. */
export const configureSubscriptionInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    subscriptionId: z.string().uuid(),
    fiscalServiceId: z.string().uuid(),
    rule: z.enum(["ON_PAYMENT_CONFIRMATION", "ON_PAYMENT_DUE_DATE", "BEFORE_PAYMENT_DUE_DATE", "ON_DUE_DATE_MONTH", "ON_NEXT_MONTH"]),
    days: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).nullable().optional(),
    observations: z.string().max(2000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const db = await admin();
    const [{ data: sub }, { data: fs }, { data: s }] = await Promise.all([
      db.from("subscriptions").select("provider_subscription_id").eq("id", data.subscriptionId).eq("tenant_id", m.tenant_id).maybeSingle(),
      db.from("fiscal_services").select("*").eq("id", data.fiscalServiceId).eq("tenant_id", m.tenant_id).maybeSingle(),
      db.from("fiscal_settings").select("config_status").eq("tenant_id", m.tenant_id).maybeSingle(),
    ]);
    if (s?.config_status !== "configured") throw new Error("Você precisa concluir sua configuração fiscal antes de emitir notas.");
    if (!sub?.provider_subscription_id || !fs) throw new Error("Recorrência ou serviço fiscal não encontrado.");
    const { getFiscalClient } = await import("./asaas-invoices.server");
    const client = await getFiscalClient(db, m.tenant_id);
    if (!client) throw new Error("Sua conta de recebimentos ainda não está conectada.");
    const { buildSubscriptionInvoiceSettings } = await import("./invoice-payloads");
    const body = buildSubscriptionInvoiceSettings(fs as never, { rule: data.rule, days: data.days ?? null, observations: data.observations ?? null });
    await client.subscriptionInvoiceSettings(sub.provider_subscription_id, body);
    await db.from("audit_logs").insert({ tenant_id: m.tenant_id, user_id: context.userId, action: "invoice.subscription_configured", resource: "subscriptions", resource_id: data.subscriptionId, result: "success", metadata: { rule: data.rule } as never });
    return { ok: true };
  });
