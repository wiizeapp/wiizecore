import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Checkout aberto por serviço: um link fixo onde quem paga informa os próprios dados,
 * escolhe a forma de pagamento e segue para o checkout normal (/pagar). Valor e tipo
 * vêm SEMPRE da versão emitida pela empresa; cliente e cobrança são criados no servidor.
 */
const tokenSchema = z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/);
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function base() {
  const { getRequest } = await import("@tanstack/react-start/server");
  return new URL(getRequest().url).origin;
}

// ---------- Área interna ----------

export const listServiceCheckoutLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await (await import("./member-access.server")).requireModulePerm(context.userId, "services.view");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./crypto.server");
    const { data } = await db.from("service_checkout_links").select("service_id, token_ciphertext, active, current_version_id").eq("tenant_id", access.tenantId);
    if (!data) throw new Error("Não foi possível carregar os links.");
    const { data: versions, error } = await db.from("service_checkout_versions").select("id, token_ciphertext, amount, charge_type, max_installments").eq("tenant_id", access.tenantId);
    if (error) throw new Error("Não foi possível carregar os links.");
    const b = await base();
    return (data ?? []).map((l) => {
      const v = versions?.find((v) => v.id === l.current_version_id);
      return { serviceId: l.service_id, active: l.active, amount: v?.amount, chargeType: v?.charge_type, url: l.active ? `${b}/checkout/${decryptSecret(v?.token_ciphertext ?? l.token_ciphertext)}` : null };
    });
  });

export const setServiceCheckoutLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { serviceId: string; active: boolean; amount?: string; chargeType?: "one_time" | "installment" | "recurring"; frequency?: string; maxInstallments?: number; newVersion?: boolean }) => z.object({
    serviceId: z.string().uuid(), active: z.boolean(), amount: z.string().regex(/^\d{1,10}([.,]\d{1,2})?$/).optional(),
    chargeType: z.enum(["one_time", "installment", "recurring"]).optional(),
    frequency: z.enum(["weekly","biweekly","monthly","quarterly","semiannual","yearly"]).optional(),
    maxInstallments: z.number().int().min(1).max(21).optional(), newVersion: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const access = await (await import("./member-access.server")).requireModulePerm(context.userId, "services.edit");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: svc } = await db.from("services").select("*").eq("id", data.serviceId).eq("tenant_id", access.tenantId).maybeSingle();
    if (!svc) throw new Error("Serviço não encontrado.");
    if (data.active && (!svc.active || svc.archived_at)) throw new Error("Ative o serviço antes de criar o link.");
    const { randomToken, tokenFingerprint, encryptSecret, decryptSecret } = await import("./crypto.server");
    const { data: existing, error: lookupError } = await db.from("service_checkout_links").select("id, token_ciphertext, current_version_id").eq("service_id", svc.id).eq("tenant_id", access.tenantId).maybeSingle();
    if (lookupError) throw new Error("Não foi possível carregar o link.");
    if (!data.active) {
      if (existing) {
        const { error } = await db.from("service_checkout_links").update({ active: false, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("tenant_id", access.tenantId);
        if (error) throw new Error("Não foi possível desativar o link.");
      }
    } else {
      let token = existing ? decryptSecret(existing.token_ciphertext) : randomToken(32);
      let linkId = existing?.id;
      if (!existing) {
        const { data: row, error } = await db.from("service_checkout_links").insert({ tenant_id: access.tenantId, service_id: svc.id, token_hash: tokenFingerprint(token), token_ciphertext: encryptSecret(token), created_by: context.userId }).select("id").single();
        if (error || !row) throw new Error("Não foi possível criar o link.");
        linkId = row.id;
      }
      if (!linkId) throw new Error("Link não encontrado.");
      let versionId = existing?.current_version_id;
      if (!versionId || data.newVersion) {
        const amount = svc.custom_amount ? data.amount?.replace(",", ".") : String(svc.amount);
        if (!amount || !/^\d{1,10}([.]\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount)) throw new Error("Informe um valor válido.");
        const chargeType = svc.flexible_type ? data.chargeType : svc.type;
        if (!chargeType) throw new Error("Escolha a forma de cobrança.");
        if (existing?.current_version_id) token = randomToken(32);
        const { data: v, error } = await db.from("service_checkout_versions").insert({
          tenant_id: access.tenantId, link_id: linkId, service_id: svc.id, token_hash: tokenFingerprint(token), token_ciphertext: encryptSecret(token),
          amount: amount as unknown as number, charge_type: chargeType, frequency: chargeType === "recurring" ? (data.frequency ?? svc.frequency ?? "monthly") : null,
          max_installments: chargeType === "installment" ? (data.maxInstallments ?? 21) : 1,
          accepted_methods: svc.accepted_methods, service_name: svc.name, description: svc.description, cycles: svc.cycles, due_days: svc.due_days ?? 5, created_by: context.userId,
        }).select("id").single();
        if (error || !v) throw new Error("Não foi possível salvar as condições do link.");
        versionId = v.id;
      } else {
        const { data: v } = await db.from("service_checkout_versions").select("token_ciphertext").eq("id", versionId).eq("tenant_id", access.tenantId).single();
        if (!v) throw new Error("Link não encontrado.");
        token = decryptSecret(v.token_ciphertext);
      }
      const { error } = await db.from("service_checkout_links").update({ active: true, current_version_id: versionId, updated_at: new Date().toISOString() }).eq("id", linkId).eq("tenant_id", access.tenantId);
      if (error) throw new Error("Não foi possível ativar o link.");
      await (await import("./audit.server")).logAudit(db, { tenantId: access.tenantId, userId: context.userId, action: "service_checkout.enabled", resource: "services", metadata: { service_id: svc.id, version_id: versionId } });
      return { url: `${await base()}/checkout/${token}` };
    }
    await (await import("./audit.server")).logAudit(db, { tenantId: access.tenantId, userId: context.userId, action: "service_checkout.disabled", resource: "services", metadata: { service_id: svc.id } });
    return { url: null };
  });

// ---------- Público ----------

async function resolveOpenLink(db: Admin, token: string) {
  const { tokenFingerprint } = await import("./crypto.server");
  const { consumeRateLimit, requestInfo } = await import("./audit.server");
  const ip = requestInfo().ip ?? "unknown";
  const rl = await consumeRateLimit(db, { scope: "open_checkout", identifier: ip, maxAttempts: 60, windowSeconds: 600, blockSeconds: 600 });
  if (!rl.allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
  const { data: version } = await db.from("service_checkout_versions").select("*").eq("token_hash", tokenFingerprint(token)).maybeSingle();
  if (!version) return null;
  const { data: link } = await db.from("service_checkout_links").select("id, tenant_id, service_id, active, created_by").eq("id", version.link_id).eq("tenant_id", version.tenant_id).maybeSingle();
  if (!link || !link.active) return null;
  const { data: svc } = await db.from("services").select("id, active, archived_at").eq("id", link.service_id).eq("tenant_id", link.tenant_id).maybeSingle();
  if (!svc || !svc.active || svc.archived_at) return null;
  const { data: tenant } = await db.from("tenants").select("name").eq("id", link.tenant_id).maybeSingle();
  return { link, version, svc: { ...svc, name: version.service_name, description: version.description, type: version.charge_type, amount: version.amount, frequency: version.frequency, accepted_methods: version.accepted_methods }, tenantName: tenant?.name ?? "" };
}

export const getServiceCheckout = createServerFn({ method: "GET" })
  .inputValidator((i: { token: string }) => z.object({ token: tokenSchema }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const r = await resolveOpenLink(db, data.token);
    if (!r) return { state: "unavailable" as const };
    const ready = await db.rpc("can_receive_payments", { _tenant_id: r.link.tenant_id });
    if (ready.error) throw new Error("Não foi possível verificar a disponibilidade.");
    if (!ready.data) return { state: "activation_pending" as const };
    const { openMethods, openInstallments } = await import("./service-checkout-rules");
    return {
      state: "ok" as const,
      company: r.tenantName,
      service: { name: r.svc.name, description: r.svc.description, type: r.svc.type as "one_time" | "installment" | "recurring", amount: Number(r.svc.amount), frequency: r.svc.frequency },
      methods: openMethods(r.svc.accepted_methods),
      installments: openInstallments(r.svc.type as never, r.version.max_installments),
    };
  });

const customerSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().min(3).max(120),
  document: z.string().transform((v) => v.replace(/\D/g, "")),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length >= 10 && v.length <= 13, "Telefone inválido."),
});

/** Etapa 1: cria (ou reencontra) o cliente pelo CPF/CNPJ e abre uma sessão. */
export const startServiceCheckout = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof customerSchema>) => customerSchema.parse(i))
  .handler(async ({ data }) => {
    const { validCpf, validCnpj } = await import("./doc-validation");
    const d = data.document;
    if (!((d.length === 11 && validCpf(d)) || (d.length === 14 && validCnpj(d)))) throw new Error("CPF ou CNPJ inválido.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const r = await resolveOpenLink(db, data.token);
    if (!r) throw new Error("Este link não está disponível.");
    const tenantId = r.link.tenant_id;
    await (await import("./activation.server")).assertCanReceivePayments(db, tenantId);

    let customerId = (await db.from("customers").select("id").eq("tenant_id", tenantId).eq("document", d).limit(1).maybeSingle()).data?.id ?? null;
    if (!customerId) {
      const { data: created, error } = await db.from("customers").insert({
        tenant_id: tenantId, name: data.name, document: d, type: d.length === 14 ? "company" : "individual",
        email: data.email, phone: data.phone, created_by: r.link.created_by, notes: "Criado pelo checkout aberto",
      } as never).select("id").single();
      if (error || !created) throw new Error("Não foi possível registrar seus dados.");
      customerId = created.id;
    }

    // Cobrança em aberto deste cliente neste link: retoma em vez de duplicar.
    const { data: prev } = await db.from("service_checkout_sessions").select("charge_group_id").eq("link_id", r.link.id).eq("customer_id", customerId).eq("version_id", r.version.id).not("charge_group_id", "is", null).order("created_at", { ascending: false }).limit(5);
    let resumeUrl: string | null = null;
    for (const p of prev ?? []) {
      if (!p.charge_group_id) continue;
      const { data: pay } = await db.from("payments").select("status").eq("charge_group_id", p.charge_group_id).eq("tenant_id", tenantId).order("installment_number", { ascending: true }).limit(1).maybeSingle();
      if (!pay || ["cancelled", "failed", "refunded"].includes(pay.status)) continue;
      const { data: pl } = await db.from("payment_links").select("token_ciphertext").eq("charge_group_id", p.charge_group_id).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (pl?.token_ciphertext) { resumeUrl = `/pagar/${(await import("./crypto.server")).decryptSecret(pl.token_ciphertext)}`; break; }
    }

    const { randomToken, tokenFingerprint } = await import("./crypto.server");
    const session = randomToken(24);
    const { error: sessionError } = await db.from("service_checkout_sessions").insert({ tenant_id: tenantId, link_id: r.link.id, customer_id: customerId, version_id: r.version.id, session_hash: tokenFingerprint(session) });
    if (sessionError) throw new Error("Não foi possível registrar seus dados.");
    const { logAudit } = await import("./audit.server");
    await logAudit(db, { tenantId, userId: null, action: "service_checkout.customer_identified", resource: "customers", metadata: { service_id: r.svc.id, customer_id: customerId } });
    return { session, resumeUrl };
  });

/** Etapa 2: cria a cobrança com a forma escolhida e devolve o checkout normal. */
export const chooseServiceCheckoutMethod = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; session: string; method: string; installments: number }) =>
    z.object({ token: tokenSchema, session: tokenSchema, method: z.enum(["pix", "boleto", "credit_card"]), installments: z.number().int().min(1).max(21) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const r = await resolveOpenLink(db, data.token);
    if (!r) throw new Error("Este link não está disponível.");
    await (await import("./activation.server")).assertCanReceivePayments(db, r.link.tenant_id);
    const { tokenFingerprint } = await import("./crypto.server");
    const { data: s } = await db.from("service_checkout_sessions").select("id, customer_id, created_at").eq("session_hash", tokenFingerprint(data.session)).eq("link_id", r.link.id).eq("version_id", r.version.id).maybeSingle();
    if (!s || Date.now() - new Date(s.created_at).getTime() > 2 * 3600_000) throw new Error("Sessão expirada. Informe seus dados novamente.");
    const { isValidChoice } = await import("./service-checkout-rules");
    if (!isValidChoice(r.svc.type as never, r.svc.accepted_methods, data.method, data.installments, r.version.max_installments)) throw new Error("Forma de pagamento indisponível para este serviço.");

    const isInst = r.svc.type === "installment";
    const { createChargeCore } = await import("./charges-core.server");
    let charge: { chargeGroupId: string; token: string };
    try {
      charge = await createChargeCore(r.link.tenant_id, r.version.created_by, null, {
        customerId: s.customer_id, serviceId: r.svc.id, method: data.method, serviceCheckoutVersionId: r.version.id,
        idempotencyKey: `open:${r.version.id}:${s.customer_id}:${data.method}:${data.installments}`,
        linkDays: 30, collectCustomerData: false, feePassShare: 0,
        installmentCount: isInst && data.installments > 1 ? data.installments : null,
        payInFull: isInst && data.installments === 1,
      });
    } catch (e) {
      console.error("open checkout charge failed", e instanceof Error ? e.message : e);
      throw new Error("Não foi possível gerar sua cobrança agora. Tente novamente em instantes.");
    }
    await db.from("service_checkout_sessions").update({ charge_group_id: charge.chargeGroupId, method: data.method, installments: data.installments, updated_at: new Date().toISOString() }).eq("id", s.id);
    const { logAudit } = await import("./audit.server");
    await logAudit(db, { tenantId: r.link.tenant_id, userId: null, action: "service_checkout.charge_created", resource: "payments", metadata: { service_id: r.svc.id, charge_group_id: charge.chargeGroupId, method: data.method, installments: data.installments } });
    return { payUrl: `/pagar/${charge.token}` };
  });
