import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Funções usadas pelas janelas /embed/*. Não usam login comum: cada chamada leva
 * a sessão curta da janela, validada no servidor (empresa, membro ativo e permissão).
 */
const sess = z.string().min(20).max(80);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const method = z.enum(["pix", "boleto", "credit_card", "debit_card"]);

function safeMsg(e: unknown, fallback: string) {
  const m = e instanceof Error ? e.message : "";
  return /^[A-ZÀ-Ú][^\n]{0,160}$/.test(m) && !/(relation|column|violates|syntax|postgres|sql|supabase|constraint)/i.test(m) ? m : fallback;
}

export const startEmbedSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ticket: z.string().min(20).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { exchangeTicket } = await import("./embed-session.server");
    const r = await exchangeTicket(data.ticket);
    if (!r) throw new Error("Acesso expirado. Abra a janela novamente.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const s = await import("./wiize-pay-oauth.server");
    const [{ data: c }, { data: t }, { data: services }, { data: contracts }] = await Promise.all([
      r.customerId ? db.from("customers").select("id, name").eq("tenant_id", r.tenantId).eq("id", r.customerId).maybeSingle() : Promise.resolve({ data: null }),
      db.from("tenants").select("name").eq("id", r.tenantId).maybeSingle(),
      db.from("services").select("id, name, amount, type, installments, accepted_methods").eq("tenant_id", r.tenantId).eq("active", true).order("created_at", { ascending: false }).limit(100),
      r.customerId
        ? db.from("contracts").select("id, title, amount, status, service_id, starts_on, ends_on").eq("tenant_id", r.tenantId).eq("customer_id", r.customerId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as never[] }),
      s.audit(db, { tenantId: r.tenantId, userId: r.userId, action: "wiize_pay.embed.opened", details: { kind: r.kind } }),
    ]);
    return { session: r.session, expiresAt: r.expiresAt, kind: r.kind, theme: r.theme, customer: c ? { id: c.id, name: c.name } : null, companyName: t?.name ?? null, options: { services: services ?? [], contracts: contracts ?? [] } };
  });

export const embedOptions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ session: sess }).parse(d))
  .handler(async ({ data }) => {
    const { requireEmbedSession } = await import("./embed-session.server");
    const x = await requireEmbedSession(data.session);
    const [{ data: services }, { data: contracts }] = await Promise.all([
      x.db.from("services").select("id, name, amount, type, installments, accepted_methods").eq("tenant_id", x.tenantId).eq("active", true).order("created_at", { ascending: false }).limit(100),
      x.customerId
        ? x.db.from("contracts").select("id, title, amount, status, service_id, starts_on, ends_on").eq("tenant_id", x.tenantId).eq("customer_id", x.customerId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    return { services: services ?? [], contracts: contracts ?? [] };
  });

export const embedCreateService = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    session: sess,
    name: z.string().trim().min(2).max(160),
    amount: z.number().positive().max(1_000_000),
    type: z.enum(["one_time", "installment", "recurring"]),
    installments: z.number().int().min(2).max(24).nullable(),
    methods: z.array(method).min(1).max(4),
  }).parse(d))
  .handler(async ({ data }) => {
    const { requireEmbedSession } = await import("./embed-session.server");
    const x = await requireEmbedSession(data.session);
    if (x.kind !== "service") throw new Error("Você não tem permissão para esta operação.");
    try {
      const { data: svc, error } = await x.db.from("services").insert({
        tenant_id: x.tenantId, name: data.name, amount: data.amount, type: data.type,
        installments: data.type === "installment" ? data.installments : null,
        frequency: data.type === "recurring" ? "monthly" : null,
        accepted_methods: data.methods, created_by: x.userId, active: true,
      }).select("id, name, amount").single();
      if (error || !svc) throw new Error("Não foi possível criar o serviço.");
      const s = await import("./wiize-pay-oauth.server");
      await s.audit(x.db, { tenantId: x.tenantId, userId: x.userId, action: "wiize_pay.embed.service_created", details: { service: svc.id } });
      return { id: svc.id, name: svc.name, amount: Number(svc.amount) };
    } catch (e) { throw new Error(safeMsg(e, "Não foi possível criar o serviço.")); }
  });

export const embedCreateContract = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    session: sess,
    title: z.string().trim().min(2).max(160),
    serviceId: z.string().uuid(),
    startsOn: date,
    endsOn: date.nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { requireEmbedSession } = await import("./embed-session.server");
    const x = await requireEmbedSession(data.session);
    if (x.kind !== "contract" || !x.customerId) throw new Error("Você não tem permissão para esta operação.");
    if (data.endsOn && data.endsOn <= data.startsOn) throw new Error("A data final deve ser depois da data inicial.");
    const { data: svc } = await x.db.from("services").select("id, amount").eq("tenant_id", x.tenantId).eq("id", data.serviceId).maybeSingle();
    if (!svc) throw new Error("Serviço não encontrado.");
    const { data: ctr, error } = await x.db.from("contracts").insert({
      tenant_id: x.tenantId, title: data.title, customer_id: x.customerId, service_id: svc.id,
      amount: svc.amount, starts_on: data.startsOn, ends_on: data.endsOn, status: "draft", created_by: x.userId,
    }).select("id, title").single();
    if (error || !ctr) throw new Error(safeMsg(error, "Não foi possível criar o contrato."));
    const s = await import("./wiize-pay-oauth.server");
    await s.audit(x.db, { tenantId: x.tenantId, userId: x.userId, action: "wiize_pay.embed.contract_created", details: { contract: ctr.id } });
    return { id: ctr.id, title: ctr.title };
  });

export const embedCreateCharge = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    session: sess,
    serviceId: z.string().uuid(),
    contractId: z.string().uuid().nullable(),
    dueOn: date,
    method: z.enum(["undefined", "pix", "boleto", "credit_card", "debit_card"]),
    requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  }).parse(d))
  .handler(async ({ data }) => {
    const { requireEmbedSession } = await import("./embed-session.server");
    const x = await requireEmbedSession(data.session);
    if (x.kind !== "charge" || !x.customerId) throw new Error("Você não tem permissão para esta operação.");
    const [{ data: svc }, ctrRes] = await Promise.all([
      x.db.from("services").select("id").eq("tenant_id", x.tenantId).eq("id", data.serviceId).maybeSingle(),
      data.contractId ? x.db.from("contracts").select("id").eq("tenant_id", x.tenantId).eq("customer_id", x.customerId).eq("id", data.contractId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!svc) throw new Error("Serviço não encontrado.");
    if (data.contractId && !ctrRes.data) throw new Error("Contrato não encontrado.");
    const { DEPLOY_CONFIG } = await import("./deploy-config");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("host") ?? "";
    const origin = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `https://${host}`;
    const site = host ? origin : DEPLOY_CONFIG.publicSiteUrl;
    try {
      const { createChargeCore } = await import("./charges-core.server");
      const r = await createChargeCore(x.tenantId, x.userId, site, {
        customerId: x.customerId, serviceId: svc.id, contractId: data.contractId, dueOn: data.dueOn,
        method: data.method, idempotencyKey: `embed:${x.tenantId}:${data.requestId}`, linkDays: 7,
        collectCustomerData: false, feePassShare: 0,
      });
      const s = await import("./wiize-pay-oauth.server");
      await s.audit(x.db, { tenantId: x.tenantId, userId: x.userId, action: "wiize_pay.embed.charge_created", details: { group: r.chargeGroupId } });
      return { chargeGroupId: r.chargeGroupId, checkoutUrl: `${site}/pagar/${r.token}` };
    } catch (e) { throw new Error(safeMsg(e, "Não foi possível criar a cobrança.")); }
  });
