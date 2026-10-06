import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function requireMembership(context: Ctx, roles: string[]) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).limit(1).maybeSingle();
  if (!data || !roles.includes(data.role)) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

const FREQ: Record<string, string> = {
  weekly: "WEEKLY", monthly: "MONTHLY", quarterly: "QUARTERLY", semiannual: "SEMIANNUALLY", yearly: "ANNUALLY",
};
const STEP_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };
const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

function addPeriod(date: string, freq: string) {
  const d = new Date(`${date}T12:00:00Z`);
  if (STEP_DAYS[freq]) d.setUTCDate(d.getUTCDate() + STEP_DAYS[freq]!);
  else d.setUTCMonth(d.getUTCMonth() + (STEP_MONTHS[freq] ?? 1));
  return d.toISOString().slice(0, 10);
}
const todayPlus = (days: number) => new Date(Date.now() - 3 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);

function friendly(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (/permiss|habilitad|not allowed|não possui|nao possui|disabled/i.test(msg))
    return new Error("O Pix Automático ainda não foi liberado para sua conta de pagamentos. Use Pix, boleto ou cartão por enquanto.");
  return e instanceof Error ? e : new Error("Falha no Pix Automático.");
}

export const createPixAutomatic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ customerId: z.string().uuid(), serviceId: z.string().uuid(), startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), customAmount: z.number().positive().max(1000000).nullable().optional(), frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"]).nullable().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin", "finance"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider } = await import("./billing.server");
    const { onlyDigits } = await import("./format");
    const conn = await getTenantProvider(admin, m.tenant_id);
    await (await import("./activation.server")).assertCanReceivePayments(admin, m.tenant_id);
    if (!conn) throw new Error("Ative sua conta de pagamentos em Configurações antes de cobrar.");
    const { ensureTenantWebhook } = await import("./webhook-setup.server");
    await ensureTenantWebhook(admin, m.tenant_id, getRequestHeader("origin") ?? null, context.userId);

    const [{ data: customer }, { data: service }] = await Promise.all([
      admin.from("customers").select("*").eq("id", data.customerId).eq("tenant_id", m.tenant_id).maybeSingle(),
      admin.from("services").select("*").eq("id", data.serviceId).eq("tenant_id", m.tenant_id).eq("active", true).maybeSingle(),
    ]);
    if (!customer?.document) throw new Error("Cliente não encontrado ou sem CPF/CNPJ.");
    const flexible = Boolean((service as { flexible_type?: boolean } | null)?.flexible_type);
    if (!service || (service.type !== "recurring" && !flexible)) throw new Error("Pix Automático só pode ser usado em cobranças recorrentes.");
    const freq = (flexible ? data.frequency : null) ?? service.frequency ?? "monthly";
    if (!FREQ[freq]) throw new Error("Pix Automático aceita cobranças semanais, mensais, trimestrais, semestrais ou anuais.");
    const value = service.custom_amount ? Number(data.customAmount ?? 0) : Number(service.amount);
    if (!(value > 0)) throw new Error("Informe o valor desta cobrança antes de gerar o link.");
    const startOn = data.startOn && data.startOn >= todayPlus(3) ? data.startOn : todayPlus(3);

    let providerCustomerId = customer.provider_customer_id as string | null;
    if (!providerCustomerId) {
      const c = await conn.provider.createCustomer({ name: customer.name, cpfCnpj: onlyDigits(customer.document), email: customer.email ?? undefined, externalReference: customer.id, notificationDisabled: true });
      providerCustomerId = c.id;
      await admin.from("customers").update({ provider_customer_id: c.id }).eq("id", customer.id);
    }

    const { data: sub, error: subErr } = await admin.from("subscriptions").insert({
      tenant_id: m.tenant_id, customer_id: customer.id, service_id: service.id, amount: value, frequency: freq,
      method: "pix", cycles: service.cycles, starts_on: startOn, next_charge_on: startOn, active: false,
    }).select("id").single();
    if (subErr || !sub) { console.error("subscription insert failed", subErr); throw new Error("Não foi possível registrar a recorrência. Confira o valor e o vencimento e tente novamente."); }

    const { randomToken, tokenFingerprint } = await import("./crypto.server");
    const token = randomToken(24);
    const tokenHash = tokenFingerprint(token);
    try {
      const auth = await (conn.provider as any).createPixAutomaticAuthorization({
        customerId: providerCustomerId,
        frequency: FREQ[freq],
        contractId: sub.id.replace(/-/g, "").slice(0, 35),
        startDate: startOn,
        value,
        description: service.name,
      });
      const { pixAutomaticStatus } = await import("./asaas.server");
      const qr = auth.immediateQrCode ?? auth;
      const { data: row } = await admin.from("pix_automatic_authorizations").insert({
        tenant_id: m.tenant_id, subscription_id: sub.id, customer_id: customer.id, provider_authorization_id: auth.id,
        status: pixAutomaticStatus(auth.status), value, frequency: freq, start_on: startOn,
        qr_payload: qr.payload ?? null, qr_image: qr.encodedImage ?? null, created_by: context.userId,
        link_token_hash: tokenHash, link_expires_at: new Date(Date.now() + 7 * 86400e3).toISOString(),
      }).select("id").single();
      await admin.from("subscriptions").update({ provider_subscription_id: `pixauto:${auth.id}` }).eq("id", sub.id);
      await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "pix_automatic.created", resource: "pix_automatic_authorizations", resourceId: row?.id ?? null });
      return { id: row?.id, token, payload: qr.payload ?? null, image: qr.encodedImage ?? null };
    } catch (e) {
      await admin.from("subscriptions").delete().eq("id", sub.id);
      throw friendly(e);
    }
  });

/** Gera as cobranças dos ciclos que vencem nos próximos dias para autorizações ativas. */
async function generateDueCharges(admin: Admin, tenantId: string, provider: any, auth: any) {
  const masterWalletId = process.env["ASAAS_MASTER_WALLET_ID"];
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", auth.subscription_id).maybeSingle();
  if (!sub || !sub.next_charge_on || !masterWalletId) return 0;
  if (!sub.active) await admin.from("subscriptions").update({ active: true }).eq("id", sub.id);
  const { data: customer } = await admin.from("customers").select("provider_customer_id").eq("id", sub.customer_id).maybeSingle();
  const { computePlatformFeeDetails } = await import("./billing.server");
  let created = 0;
  let next = sub.next_charge_on as string;
  let done = sub.cycles_done ?? 0;
  while (next <= todayPlus(10) && (!sub.cycles || done < sub.cycles) && created < 3) {
    const dueDate = next < todayPlus(3) ? todayPlus(3) : next;
    const key = `pixauto:${sub.id}:${next}`;
    const { data: exists } = await admin.from("payments").select("id").eq("tenant_id", tenantId).eq("idempotency_key", key).maybeSingle();
    if (!exists) {
      const fee = await computePlatformFeeDetails(admin, Number(sub.amount), "pix", 1, true);
      const p = await provider.createPayment({
        customer: customer?.provider_customer_id, billingType: "PIX", value: Number(sub.amount), dueDate,
        pixAutomaticAuthorizationId: auth.provider_authorization_id, externalReference: sub.id,
        split: fee.totalFeeCents > 0 ? [{ walletId: masterWalletId, fixedValue: fee.totalFeeCents / 100 }] : undefined,
      });
      await admin.from("payments").insert({
        tenant_id: tenantId, charge_group_id: sub.id, customer_id: sub.customer_id, service_id: sub.service_id,
        subscription_id: sub.id, description: "Pix Automático", status: "awaiting_payment", method: "pix",
        gross_amount: Number(sub.amount), platform_fee_amount: fee.totalFee, fee_configuration_id: fee.feeConfigurationId,
        fee_fixed_amount: fee.fixedFee, fee_percentage: fee.percentageFee, fee_percentage_amount: fee.percentageFeeAmount,
        fee_calculated_at: fee.calculationTimestamp, net_amount: fee.netAmount, due_on: dueDate, provider: "asaas",
        provider_payment_id: p.id, idempotency_key: key,
      });
      created++;
    }
    done++;
    next = addPeriod(next, sub.frequency);
  }
  await admin.from("subscriptions").update({ next_charge_on: next, cycles_done: done }).eq("id", sub.id);
  return created;
}

export const listPixAutomatic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMembership(context, ["owner", "admin", "finance", "viewer"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider } = await import("./billing.server");
    const { pixAutomaticStatus } = await import("./asaas.server");
    const conn = await getTenantProvider(admin, m.tenant_id);
    const { data: rows } = await admin.from("pix_automatic_authorizations").select("*, customers(name)").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(50);
    for (const r of rows ?? []) {
      if (!conn || !r.provider_authorization_id || ["cancelled", "refused", "expired"].includes(r.status)) continue;
      try {
        const remote = await (conn.provider as any).getPixAutomaticAuthorization(r.provider_authorization_id);
        const st = pixAutomaticStatus(remote.status);
        if (st !== r.status) {
          await admin.from("pix_automatic_authorizations").update({ status: st, last_checked_at: new Date().toISOString() }).eq("id", r.id);
          if (st !== "active" && r.subscription_id) await admin.from("subscriptions").update({ active: false }).eq("id", r.subscription_id);
          r.status = st;
        }
        if (st === "active") await generateDueCharges(admin, m.tenant_id, conn.provider, r);
      } catch (e) {
        console.error("pix automatic refresh", e);
      }
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id, status: r.status, value: Number(r.value), frequency: r.frequency, startOn: r.start_on,
      customer: r.customers?.name ?? "—", payload: r.status === "pending" ? r.qr_payload : null, image: r.status === "pending" ? r.qr_image : null,
    }));
  });

export const cancelPixAutomatic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider } = await import("./billing.server");
    const { data: r } = await admin.from("pix_automatic_authorizations").select("*").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!r) throw new Error("Autorização não encontrada.");
    const conn = await getTenantProvider(admin, m.tenant_id);
    if (conn && r.provider_authorization_id) {
      try { await (conn.provider as any).cancelPixAutomaticAuthorization(r.provider_authorization_id); } catch (e) { throw friendly(e); }
    }
    await admin.from("pix_automatic_authorizations").update({ status: "cancelled" }).eq("id", r.id);
    if (r.subscription_id) await admin.from("subscriptions").update({ active: false }).eq("id", r.subscription_id);
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "pix_automatic.cancelled", resource: "pix_automatic_authorizations", resourceId: r.id });
    return { ok: true };
  });

/** Página pública de autorização: acesso só pelo token do link. */
export const getPublicPixAuthorization = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(20).max(100) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { tokenFingerprint } = await import("./crypto.server");
    const { consumeRateLimit, requestInfo } = await import("./audit.server");
    const rate = await consumeRateLimit(admin, { scope: "pix_auth_link", identifier: requestInfo().ip ?? "unknown", maxAttempts: 60, windowSeconds: 600, blockSeconds: 600 });
    if (!rate.allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
    const { data: r } = await admin.from("pix_automatic_authorizations")
      .select("id, tenant_id, status, value, frequency, start_on, qr_payload, qr_image, provider_authorization_id, link_expires_at, customers(name), subscriptions(services(name)), tenants(name)")
      .eq("link_token_hash", tokenFingerprint(data.token)).maybeSingle();
    if (!r) throw new Error("Link inválido.");
    let status = r.status as string;
    if (status === "pending" && r.link_expires_at && new Date(r.link_expires_at) < new Date()) throw new Error("Este link expirou. Peça um novo à empresa.");
    if (status === "pending" && r.provider_authorization_id) {
      try {
        const { getTenantProvider } = await import("./billing.server");
        const { pixAutomaticStatus } = await import("./asaas.server");
        const conn = await getTenantProvider(admin, r.tenant_id);
        if (conn) {
          const remote = await (conn.provider as any).getPixAutomaticAuthorization(r.provider_authorization_id);
          const st = pixAutomaticStatus(remote.status);
          if (st !== status) {
            await admin.from("pix_automatic_authorizations").update({ status: st, last_checked_at: new Date().toISOString() }).eq("id", r.id);
            status = st;
          }
        }
      } catch (e) { console.error("public pix auth refresh", e); }
    }
    const anyR = r as any;
    return {
      status, value: Number(r.value), frequency: r.frequency as string, startOn: r.start_on as string,
      company: anyR.tenants?.name ?? "Empresa", customer: anyR.customers?.name ?? "", service: anyR.subscriptions?.services?.name ?? "Serviço",
      payload: status === "pending" ? r.qr_payload : null, image: status === "pending" ? r.qr_image : null,
    };
  });
