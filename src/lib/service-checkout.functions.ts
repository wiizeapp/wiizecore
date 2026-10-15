import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Checkout aberto por serviço: um link fixo onde quem paga informa os próprios dados,
 * escolhe a forma de pagamento e segue para o checkout normal (/pagar). Valor e tipo
 * vêm SEMPRE do serviço salvo; cliente e cobrança são criados no servidor.
 */
const tokenSchema = z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/);
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function base() {
  return (await import("./billing.server")).publicBaseUrl(null) ?? "";
}

// ---------- Área interna ----------

export const listServiceCheckoutLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await (await import("./member-access.server")).requireModulePerm(context.userId, "services.view");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./crypto.server");
    const { data } = await db.from("service_checkout_links").select("service_id, token_ciphertext, active").eq("tenant_id", access.tenantId);
    const b = await base();
    return (data ?? []).map((l) => ({ serviceId: l.service_id, active: l.active, url: l.active ? `${b}/checkout/${decryptSecret(l.token_ciphertext)}` : null }));
  });

export const setServiceCheckoutLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { serviceId: string; active: boolean }) => z.object({ serviceId: z.string().uuid(), active: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const access = await (await import("./member-access.server")).requireModulePerm(context.userId, "services.edit");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: svc } = await db.from("services").select("id, custom_amount, flexible_type, active").eq("id", data.serviceId).eq("tenant_id", access.tenantId).maybeSingle();
    if (!svc) throw new Error("Serviço não encontrado.");
    if (data.active && (svc.custom_amount || svc.flexible_type)) throw new Error("Serviços com valor ou forma personalizada não podem ter checkout aberto.");
    if (data.active && !svc.active) throw new Error("Ative o serviço antes de criar o link.");
    const { randomToken, tokenFingerprint, encryptSecret, decryptSecret } = await import("./crypto.server");
    const { data: existing } = await db.from("service_checkout_links").select("id, token_ciphertext").eq("service_id", svc.id).maybeSingle();
    let token: string;
    if (existing) {
      await db.from("service_checkout_links").update({ active: data.active, updated_at: new Date().toISOString() }).eq("id", existing.id);
      token = decryptSecret(existing.token_ciphertext);
    } else {
      if (!data.active) return { url: null };
      token = randomToken(32);
      const { error } = await db.from("service_checkout_links").insert({ tenant_id: access.tenantId, service_id: svc.id, token_hash: tokenFingerprint(token), token_ciphertext: encryptSecret(token), created_by: context.userId });
      if (error) throw new Error("Não foi possível criar o link.");
    }
    const { logAudit } = await import("./audit.server");
    await logAudit(db, { tenantId: access.tenantId, userId: context.userId, action: data.active ? "service_checkout.enabled" : "service_checkout.disabled", resource: "services", metadata: { service_id: svc.id } });
    return { url: data.active ? `${await base()}/checkout/${token}` : null };
  });

// ---------- Público ----------

async function resolveOpenLink(db: Admin, token: string) {
  const { tokenFingerprint } = await import("./crypto.server");
  const { consumeRateLimit, requestInfo } = await import("./audit.server");
  const ip = requestInfo().ip ?? "unknown";
  const rl = await consumeRateLimit(db, { scope: "open_checkout", identifier: ip, maxAttempts: 60, windowSeconds: 600, blockSeconds: 600 });
  if (!rl.allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
  const { data: link } = await db.from("service_checkout_links").select("id, tenant_id, service_id, active, created_by").eq("token_hash", tokenFingerprint(token)).maybeSingle();
  if (!link || !link.active) return null;
  const { data: svc } = await db.from("services").select("id, name, description, type, amount, installments, frequency, accepted_methods, active, custom_amount, flexible_type, archived_at").eq("id", link.service_id).eq("tenant_id", link.tenant_id).maybeSingle();
  if (!svc || !svc.active || svc.archived_at || svc.custom_amount || svc.flexible_type) return null;
  const { data: tenant } = await db.from("tenants").select("name").eq("id", link.tenant_id).maybeSingle();
  return { link, svc, tenantName: tenant?.name ?? "" };
}

export const getServiceCheckout = createServerFn({ method: "GET" })
  .inputValidator((i: { token: string }) => z.object({ token: tokenSchema }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const r = await resolveOpenLink(db, data.token);
    if (!r) return { state: "unavailable" as const };
    const ready = await db.rpc("can_receive_payments", { _tenant_id: r.link.tenant_id });
    if (!ready.data) return { state: "unavailable" as const };
    const { openMethods, openInstallments } = await import("./service-checkout-rules");
    return {
      state: "ok" as const,
      company: r.tenantName,
      service: { name: r.svc.name, description: r.svc.description, type: r.svc.type as "one_time" | "installment" | "recurring", amount: Number(r.svc.amount), frequency: r.svc.frequency },
      methods: openMethods(r.svc.accepted_methods),
      installments: openInstallments(r.svc.type as never),
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
    const { data: prev } = await db.from("service_checkout_sessions").select("charge_group_id").eq("link_id", r.link.id).eq("customer_id", customerId).not("charge_group_id", "is", null).order("created_at", { ascending: false }).limit(5);
    let resumeUrl: string | null = null;
    for (const p of prev ?? []) {
      const { data: pay } = await db.from("payments").select("status").eq("charge_group_id", p.charge_group_id!).eq("tenant_id", tenantId).order("installment_number", { ascending: true }).limit(1).maybeSingle();
      if (!pay || ["cancelled", "failed", "refunded"].includes(pay.status)) continue;
      const { data: pl } = await db.from("payment_links").select("token_ciphertext").eq("charge_group_id", p.charge_group_id!).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (pl?.token_ciphertext) { resumeUrl = `/pagar/${(await import("./crypto.server")).decryptSecret(pl.token_ciphertext)}`; break; }
    }

    const { randomToken, tokenFingerprint } = await import("./crypto.server");
    const session = randomToken(24);
    await db.from("service_checkout_sessions").insert({ tenant_id: tenantId, link_id: r.link.id, customer_id: customerId, session_hash: tokenFingerprint(session) });
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
    const { tokenFingerprint } = await import("./crypto.server");
    const { data: s } = await db.from("service_checkout_sessions").select("id, customer_id, created_at").eq("session_hash", tokenFingerprint(data.session)).eq("link_id", r.link.id).maybeSingle();
    if (!s || Date.now() - new Date(s.created_at).getTime() > 2 * 3600_000) throw new Error("Sessão expirada. Informe seus dados novamente.");
    const { isValidChoice } = await import("./service-checkout-rules");
    if (!isValidChoice(r.svc.type as never, r.svc.accepted_methods, data.method, data.installments)) throw new Error("Forma de pagamento indisponível para este serviço.");

    const isInst = r.svc.type === "installment";
    const { createChargeCore } = await import("./charges-core.server");
    let charge: { chargeGroupId: string; token: string };
    try {
      charge = await createChargeCore(r.link.tenant_id, r.link.created_by!, null, {
        customerId: s.customer_id, serviceId: r.svc.id, method: data.method,
        idempotencyKey: `open:${r.link.id}:${s.customer_id}:${data.method}:${data.installments}`,
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
