import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function requireMembership(context: Ctx, roles: string[]) {
  const { data } = await context.supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", context.userId).eq("status", "active")
    .limit(1)
    .maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "charges.view");
  if (!data || !roles.includes(data.role)) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}


const FINANCE = ["owner", "admin", "finance"];

const createChargeSchema = z.object({
  customerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  method: z.enum(["undefined", "pix", "boleto", "credit_card", "debit_card"]),
  idempotencyKey: z.string().min(16).max(80),
  linkDays: z.number().int().min(1).max(90).default(30),
  collectCustomerData: z.boolean().default(true),
  /** Parcelas escolhidas nesta cobrança (só serviços parcelados). */
  installmentCount: z.number().int().min(2).max(21).nullable().optional(),
  /** Só para serviços com forma de cobrança personalizada. */
  chargeType: z.enum(["one_time", "installment", "recurring"]).nullable().optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"]).nullable().optional(),
  /** Percentual da taxa repassado ao cliente final (0 = prestador absorve). O servidor recalcula tudo. */
  feePassShare: z.number().min(0).max(100).default(0),
  /** Só usado quando o serviço tem valor personalizado. */
  customAmount: z.number().positive().max(1_000_000).nullable().optional(),
  /** Plano de lembretes só para esta cobrança; vazio usa o padrão da empresa. */
  dunningPlan: z.enum(["essential", "smart", "intensive"]).nullable().optional(),
  /** Coprodutores desta cobrança (até 4). O servidor valida contas, percentuais e calcula tudo. */
  coproducers: z.array(z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    type: z.enum(["percent", "fixed"]),
    percent: z.number().gt(0).lt(100).nullable().optional(),
    fixedAmount: z.number().positive().max(1_000_000).nullable().optional(),
    responsibility: z.string().max(300).nullable().optional(),
  })).max(4).nullable().optional(),
});


export const createCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createChargeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, FINANCE);
    const tenantId = m.tenant_id;
    return (await import("./charges-core.server")).createChargeCore(tenantId, context.userId, getRequestHeader("origin") ?? null, data);
  });

export const regeneratePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid(), days: z.number().int().min(1).max(90).default(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, FINANCE);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await admin
      .from("payments")
      .select("customer_id, service_id, contract_id")
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .limit(1)
      .maybeSingle();
    if (!payment) throw new Error("Cobrança não encontrada.");
    const link = await (await import("./charges-core.server")).issueLink(admin, {
      tenantId: m.tenant_id,
      chargeGroupId: data.chargeGroupId,
      customerId: payment.customer_id,
      serviceId: payment.service_id,
      contractId: payment.contract_id,
      userId: context.userId,
      days: data.days,
    });
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "payment_link.created", resource: "payment_links", resourceId: link.linkId });
    return { token: link.token };
  });

/** Devolve o link fixo da cobrança. Links antigos (sem cópia guardada) recebem um novo link permanente uma única vez. */
export const getChargeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, [...FINANCE, "viewer"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: active } = await admin
      .from("payment_links")
      .select("token_ciphertext")
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active?.token_ciphertext) {
      const { decryptSecret } = await import("./crypto.server");
      return { token: decryptSecret(active.token_ciphertext) };
    }
    if (!FINANCE.includes(m.role)) throw new Error("Peça a um responsável financeiro para gerar o link.");
    const { data: payment } = await admin
      .from("payments")
      .select("customer_id, service_id, contract_id")
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .limit(1)
      .maybeSingle();
    if (!payment) throw new Error("Cobrança não encontrada.");
    const link = await (await import("./charges-core.server")).issueLink(admin, {
      tenantId: m.tenant_id, chargeGroupId: data.chargeGroupId, customerId: payment.customer_id,
      serviceId: payment.service_id, contractId: payment.contract_id, userId: context.userId, days: 30,
    });
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "payment_link.created", resource: "payment_links", resourceId: link.linkId });
    return { token: link.token };
  });

export const revokePaymentLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, FINANCE);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await admin
      .from("payment_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .is("revoked_at", null);
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "payment_link.revoked", resource: "payment_links", resourceId: data.chargeGroupId });
    return { ok: true };
  });

/** Cancela uma cobrança sem recebimentos e a retira imediatamente dos totais. */
export const cancelCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider } = await import("./billing.server");
    const conn = await getTenantProvider(admin, m.tenant_id);
    if (!conn) throw new Error("Conta de pagamentos não ativada.");
    const { data: payments } = await admin
      .from("payments")
      .select("id, provider_payment_id, status, subscription_id")
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId);
    if (!payments?.length) throw new Error("Cobrança não encontrada.");
    if (payments.some((payment) => ["paid", "refunded"].includes(payment.status))) {
      throw new Error("Uma cobrança com pagamento confirmado não pode ser excluída.");
    }
    if (payments.some((payment) => ["processing", "in_analysis"].includes(payment.status))) {
      throw new Error("Esta cobrança está sendo processada e ainda não pode ser excluída.");
    }

    const subId = payments.find((p) => p.subscription_id)?.subscription_id;
    if (subId) {
      const { data: sub } = await admin.from("subscriptions").select("provider_subscription_id").eq("id", subId).maybeSingle();
      if (sub?.provider_subscription_id) await conn.provider.cancelSubscription(sub.provider_subscription_id);
      await admin.from("subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", subId);
    }
    let providerCancellationFailed = false;
    for (const p of payments) {
      if (p.provider_payment_id && ["created", "awaiting_payment", "overdue"].includes(p.status)) {
        try {
          await conn.provider.cancelPayment(p.provider_payment_id);
        } catch (error) {
          providerCancellationFailed = true;
          console.error("Falha ao cancelar pagamento no provedor", error instanceof Error ? error.message : "erro");
        }
      }
    }
    if (providerCancellationFailed) {
      throw new Error("Não foi possível cancelar todos os pagamentos. Tente novamente em alguns instantes.");
    }
    const cancellableIds = payments
      .filter((payment) => !["cancelled", "failed"].includes(payment.status))
      .map((payment) => payment.id);
    if (cancellableIds.length) {
      const { error: cancelError } = await admin
        .from("payments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("tenant_id", m.tenant_id)
        .in("id", cancellableIds);
      if (cancelError) throw new Error("Não foi possível retirar a cobrança dos totais.");
    }
    await admin
      .from("payment_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .is("revoked_at", null);
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "charge.cancel_requested", resource: "payments", resourceId: data.chargeGroupId });
    return { ok: true, cancelled: cancellableIds.length };
  });

export const listWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMembership(context, ["owner", "admin", "finance"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data } = await admin
      .from("webhook_events")
      .select("id, event_type, processing_status, retry_count, error_message, received_at, processed_at")
      .eq("tenant_id", m.tenant_id)
      .order("received_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

/** Ambiente de teste: simula o pagamento da próxima parcela em aberto. */
export const simulateSandboxPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider } = await import("./billing.server");
    const conn = await getTenantProvider(admin, m.tenant_id);
    if (!conn) throw new Error("Conta de pagamentos não ativada.");
    if (conn.environment !== "sandbox") throw new Error("Disponível apenas no ambiente de teste.");
    const { data: p } = await admin
      .from("payments")
      .select("id, provider_payment_id")
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .in("status", ["created", "awaiting_payment", "overdue"])
      .not("provider_payment_id", "is", null)
      .order("due_on", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!p?.provider_payment_id) throw new Error("Nenhuma parcela em aberto para simular.");
    const { ensureTenantWebhook } = await import("./webhook-setup.server");
    await ensureTenantWebhook(admin, m.tenant_id, getRequestHeader("origin") ?? null, context.userId);
    await (conn.provider as any).sandboxConfirmPayment(p.provider_payment_id);
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "payment.sandbox_simulated", resource: "payments", resourceId: p.id });
    // Confere o status oficial no provedor (não depende só do aviso automático).
    const { reconcilePaymentFromProvider } = await import("./billing.server");
    const result = await reconcilePaymentFromProvider(admin, m.tenant_id, p.id);
    return { ok: true, status: result.status };
  });

/** Consulta o status oficial das parcelas desta cobrança no provedor e aplica atualizações. */
export const syncChargeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeGroupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin", "finance"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { reconcilePaymentFromProvider } = await import("./billing.server");
    const { ensureTenantWebhook } = await import("./webhook-setup.server");
    await ensureTenantWebhook(admin, m.tenant_id, getRequestHeader("origin") ?? null, context.userId);
    const { data: rows } = await admin
      .from("payments")
      .select("id")
      .eq("tenant_id", m.tenant_id)
      .eq("charge_group_id", data.chargeGroupId)
      .not("provider_payment_id", "is", null)
      .limit(60);
    let applied = 0;
    for (const r of rows ?? []) {
      const res = await reconcilePaymentFromProvider(admin, m.tenant_id, r.id);
      if (res.status === "applied") applied++;
    }
    return { applied };
  });

export const reprocessWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, ["owner", "admin"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { processWebhookEvent } = await import("./billing.server");
    const { data: event } = await admin.from("webhook_events").select("id, processing_status").eq("id", data.eventId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!event) throw new Error("Evento não encontrado.");
    if (event.processing_status === "processed") return { status: "processed" };
    await processWebhookEvent(admin, event.id);
    const { data: after } = await admin.from("webhook_events").select("processing_status").eq("id", event.id).single();
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "webhook.reprocessed", resource: "webhook_events", resourceId: event.id });
    return { status: after?.processing_status ?? "failed" };
  });

/** Registra (ou re-registra) o webhook no Asaas com um token aleatório desta empresa. */
export const syncAsaasWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMembership(context, ["owner", "admin"]);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { registerTenantWebhook } = await import("./webhook-setup.server");
    const origin = getRequestHeader("origin") ?? null;
    const result = await registerTenantWebhook(admin, m.tenant_id, origin, context.userId);
    return result;
  });

/** Salva o CPF/CNPJ informado na cobrança em um cliente que ainda não tem documento. */
export const setCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid(), document: z.string().max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const m = await requireMembership(context, FINANCE);
    const doc = data.document.replace(/\D/g, "");
    if (![11, 14].includes(doc.length)) throw new Error("CPF/CNPJ inválido.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: dup } = await admin.from("customers").select("id").eq("tenant_id", m.tenant_id).eq("document", doc).neq("id", data.customerId).maybeSingle();
    if (dup) throw new Error("Já existe outro cliente com este CPF/CNPJ.");
    const { error } = await admin.from("customers").update({ document: doc, type: doc.length === 14 ? "company" : "individual" })
      .eq("id", data.customerId).eq("tenant_id", m.tenant_id).is("document", null);
    if (error) throw new Error("Não foi possível salvar o documento.");
    return { ok: true };
  });
