import { DEPLOY_CONFIG } from "./deploy-config";
import { AsaasProvider, billingTypeToMethod, eventToStatus, type ProviderPayment } from "./asaas.server";
import { decryptSecret } from "./crypto.server";
import { calculatePaymentFee, type FeeMethod } from "./fee-engine.server";
import { scopedProviderEventId } from "./financial-scope";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function getTenantProvider(admin: AdminClient, tenantId: string, connectionId?: string) {
  let query = admin
    .from("provider_connections")
    .select("id, environment, api_key_ciphertext, status, webhook_token_ciphertext, webhook_id, wallet_id")
    .eq("tenant_id", tenantId)
    .eq("provider", "asaas")
    .eq("status", "connected");
  if (connectionId) query = query.eq("id", connectionId);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível conferir a conta de pagamentos.");
  if (!data?.api_key_ciphertext) return null;
  const environment = data.environment as "sandbox" | "production";
  return {
    connection: data,
    environment,
    provider: new AsaasProvider(decryptSecret(data.api_key_ciphertext), environment),
  };
}

/** Taxa WiizePay em centavos inteiros; fonte: configurações do banco, nunca o navegador. */
export async function computePlatformFee(
  admin: AdminClient,
  _tenantId: string,
  grossAmount: number,
  method: string | null,
  installments = 1,
  recurring = false,
): Promise<number> {
  const feeMethod: FeeMethod = recurring && method === "pix" ? "pix_recurring" : method === "debit_card" ? "debit_card" : method === "credit_card" ? "credit_card" : method === "boleto" ? "boleto" : "pix";
  return (await calculatePaymentFee(admin, { paymentMethod: feeMethod, grossAmount, installments })).totalFee;
}

export async function computePlatformFeeDetails(
  admin: AdminClient,
  grossAmount: number,
  method: string | null,
  installments = 1,
  recurring = false,
  /** Informe somente para uma cobrança única à vista; parcelas e recorrências nunca recebem a promoção. */
  launchPromoTenantId?: string,
) {
  const feeMethod: FeeMethod = recurring && method === "pix" ? "pix_recurring" : method === "debit_card" ? "debit_card" : method === "credit_card" ? "credit_card" : method === "boleto" ? "boleto" : "pix";
  return calculatePaymentFee(admin, { paymentMethod: feeMethod, grossAmount, installments, ...(launchPromoTenantId && !recurring ? { launchPromoTenantId } : {}) });
}

type WebhookPayload = { id?: string; event?: string; dateCreated?: string; payment?: ProviderPayment & Record<string, unknown> };

export async function findOrCreatePayment(admin: AdminClient, tenantId: string, connectionId: string, p: ProviderPayment) {
  const { data: existing, error: existingError } = await admin.from("payments").select("id")
    .eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("provider", "asaas").eq("provider_payment_id", p.id).maybeSingle();
  if (existingError) throw new Error("payment_lookup_failed");
  if (existing) return existing.id;

  // Primeira cobrança de uma recorrência cujo registro local ainda aguarda o ID do provedor.
  if (p.subscription) {
    const { data: sub, error: subError } = await admin.from("subscriptions").select("id").eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("provider_subscription_id", p.subscription).maybeSingle();
    if (subError) throw new Error("subscription_lookup_failed");
    if (sub) {
      const { data: placeholder } = await admin.from("payments").select("id").eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("subscription_id", sub.id).is("provider_payment_id", null).limit(1).maybeSingle();
      if (placeholder) {
        const { data: attached, error } = await admin.from("payments").update({ provider_payment_id: p.id, status: "awaiting_payment", ...(p.dueDate ? { due_on: p.dueDate } : {}) }).eq("id", placeholder.id).eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).is("provider_payment_id", null).select("id").maybeSingle();
        if (error || !attached) throw new Error("payment_attach_failed");
        return placeholder.id;
      }
    }
  }

  // Vincula o evento à parcela local já criada, em vez de duplicar o pagamento.
  if (p.installment && p.installmentNumber) {
    const { data: installmentPlaceholder } = await admin
      .from("payments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider_connection_id", connectionId)
      .eq("provider_installment_id", p.installment)
      .eq("installment_number", p.installmentNumber)
      .is("provider_payment_id", null)
      .limit(1)
      .maybeSingle();
    if (installmentPlaceholder) {
      const { data: attached, error } = await admin.from("payments").update({
        provider_payment_id: p.id,
        status: "awaiting_payment",
        ...(p.dueDate ? { due_on: p.dueDate } : {}),
        ...(p.invoiceUrl ? { invoice_url: p.invoiceUrl } : {}),
        ...(p.bankSlipUrl ? { bank_slip_url: p.bankSlipUrl } : {}),
      }).eq("id", installmentPlaceholder.id).eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).is("provider_payment_id", null).select("id").maybeSingle();
      if (error || !attached) throw new Error("payment_attach_failed");
      return installmentPlaceholder.id;
    }
  }

  // Parcela ou cobrança recorrente gerada pelo provedor e ainda não registrada.
  let sibling: {
    charge_group_id: string; customer_id: string | null; service_id: string | null; contract_id: string | null;
    subscription_id: string | null; description: string | null; installment_count: number | null;
  } | null = null;
  const cols = "charge_group_id, customer_id, service_id, contract_id, subscription_id, description, installment_count";
  if (p.installment) {
    const { data } = await admin.from("payments").select(cols).eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("provider_installment_id", p.installment).limit(1).maybeSingle();
    sibling = data;
  } else if (p.subscription) {
    const { data: sub } = await admin.from("subscriptions").select("id").eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("provider_subscription_id", p.subscription).maybeSingle();
    if (sub) {
      const { data } = await admin.from("payments").select(cols).eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("subscription_id", sub.id).limit(1).maybeSingle();
      sibling = data;
    }
  }
  if (!sibling || !p.value || !p.dueDate) return null;

  const method = billingTypeToMethod(p.billingType);
  const fee = await computePlatformFeeDetails(admin, p.value, method, sibling.installment_count ?? 1, Boolean(p.subscription));
  const { data: inserted, error } = await admin
    .from("payments")
    .insert({
      tenant_id: tenantId,
      provider_connection_id: connectionId,
      charge_group_id: sibling.charge_group_id,
      customer_id: sibling.customer_id,
      service_id: sibling.service_id,
      contract_id: sibling.contract_id,
      subscription_id: sibling.subscription_id,
      description: sibling.description,
      status: "awaiting_payment",
      method,
      gross_amount: p.value,
       platform_fee_amount: fee.totalFee,
       fee_configuration_id: fee.feeConfigurationId,
       fee_fixed_amount: fee.fixedFee,
       fee_percentage: fee.percentageFee,
       fee_percentage_amount: fee.percentageFeeAmount,
       fee_calculated_at: fee.calculationTimestamp,
       net_amount: fee.netAmount,
      installment_number: p.installmentNumber ?? null,
      installment_count: sibling.installment_count,
      due_on: p.dueDate,
      provider: "asaas",
      provider_payment_id: p.id,
      provider_installment_id: p.installment ?? null,
      invoice_url: p.invoiceUrl ?? null,
      bank_slip_url: p.bankSlipUrl ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") throw new Error("payment_insert_failed");
    // Corrida com outro evento do mesmo pagamento: usa o registro já criado.
    const { data } = await admin.from("payments").select("id").eq("tenant_id", tenantId).eq("provider_connection_id", connectionId).eq("provider", "asaas").eq("provider_payment_id", p.id).maybeSingle();
    return data?.id ?? null;
  }
  return inserted.id;
}

/** Processa um evento já autenticado e registrado. Idempotente. */
export async function processWebhookEvent(admin: AdminClient, eventId: string) {
  const { data: event } = await admin.from("webhook_events").select("*").eq("id", eventId).single();
  if (!event || !event.tenant_id) throw new Error("event_scope_missing");
  if (event.processing_status === "processed" || event.processing_status === "discarded") return;
  if (!event.provider_connection_id) throw new Error("event_origin_ambiguous");
  const connectionId = event.provider_connection_id;
  const connection = await getTenantProvider(admin, event.tenant_id, connectionId);
  if (!connection) throw new Error("event_connection_unavailable");

  // Trava atômica: só um processo por vez assume o evento. "processing" travado há mais de 2 min pode ser retomado.
  const staleBefore = new Date(Date.now() - 120_000).toISOString();
  const { data: claimed } = await admin
    .from("webhook_events")
    .update({ processing_status: "processing", processing_started_at: new Date().toISOString() })
    .eq("id", eventId)
    .or(`processing_status.in.(received,failed),and(processing_status.eq.processing,processing_started_at.lt.${staleBefore})`)
    .select("id");
  if (!claimed?.length) throw new Error("event_busy");
  try {
    const payload = event.payload as WebhookPayload;
    if (event.event_type.startsWith("ACCOUNT_STATUS_")) {
      const { syncProviderOnboarding } = await import("./asaas-onboarding.server");
      await syncProviderOnboarding(admin, event.tenant_id);
      await admin.from("webhook_events").update({ processing_status: "processed", error_message: null, processed_at: new Date().toISOString() }).eq("id", eventId);
      return;
    }
    if (event.event_type.startsWith("INVOICE_")) {
      const { processInvoiceWebhook } = await import("./asaas-invoices.server");
      await processInvoiceWebhook(admin, event as never);
      return;
    }
    if (event.event_type.startsWith("RECEIVABLE_ANTICIPATION_")) {
      const { processAnticipationWebhook } = await import("./anticipation.server");
      await processAnticipationWebhook(admin, event as never);
      return;
    }
    const p = payload.payment;
    if (p?.id && ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_REFUND_DENIED"].includes(event.event_type)) {
      const { handleRefundWebhook } = await import("./refunds.server");
      if (await handleRefundWebhook(admin, event.tenant_id, p.id, event.event_type, event.external_event_id, connectionId)) {
        await admin.from("webhook_events").update({ processing_status: "processed", error_message: null, processed_at: new Date().toISOString() }).eq("id", eventId);
        return;
      }
    }
    const status = eventToStatus(event.event_type);
    if (!p?.id || !status) {
      await admin.from("webhook_events").update({ processing_status: "discarded", processed_at: new Date().toISOString() }).eq("id", eventId);
      return;
    }
    {
      const { isSupersededProviderPayment } = await import("./payment-attempts.server");
      if (await isSupersededProviderPayment(admin, event.tenant_id, connectionId, p.id)) {
        await admin.from("webhook_events").update({ processing_status: "discarded", error_message: "Tentativa substituída", processed_at: new Date().toISOString() }).eq("id", eventId);
        return;
      }
    }
    const paymentId = await findOrCreatePayment(admin, event.tenant_id, connectionId, p);
    if (!paymentId) {
      await admin.from("webhook_events").update({ processing_status: "discarded", error_message: "Pagamento desconhecido", processed_at: new Date().toISOString() }).eq("id", eventId);
      return;
    }

    // Cada parcela e cada ciclo recorrente é uma cobrança individual. A RPC
    // garante que eventos repetidos do mesmo pagamento nunca descontem duas vezes.
    const { data: paymentOwner } = await admin
      .from("payments")
      .select("customers(provider_customer_id)")
      .eq("id", paymentId)
      .eq("tenant_id", event.tenant_id)
      .maybeSingle();
    const providerCustomerId = (paymentOwner?.customers as { provider_customer_id?: string | null } | null)?.provider_customer_id;
    if (providerCustomerId) {
      if (connection) {
        const { applyDunning } = await import("./dunning.server");
        await applyDunning(admin, connection.provider, { tenantId: event.tenant_id, paymentId, providerCustomerId })
          .catch((error) => console.error("dunning webhook", error instanceof Error ? error.message : "falhou"));
      }
    }

    const method = billingTypeToMethod(p.billingType);
    const providerEventAt = payload.dateCreated ?? p.dateCreated ?? event.received_at;
    const { data: currentPayment } = await admin.from("payments").select("last_provider_event_at").eq("id", paymentId).eq("tenant_id", event.tenant_id).eq("provider_connection_id", connectionId).single();
    if (currentPayment?.last_provider_event_at && new Date(providerEventAt) < new Date(currentPayment.last_provider_event_at)) {
      await admin.from("webhook_events").update({ processing_status: "discarded", error_message: "Evento anterior ao último processado", processed_at: new Date().toISOString() }).eq("id", eventId);
      return;
    }
    await admin
      .from("payments")
      .update({
        ...(method ? { method } : {}),
        ...(p.invoiceUrl ? { invoice_url: p.invoiceUrl } : {}),
        ...(p.bankSlipUrl ? { bank_slip_url: p.bankSlipUrl } : {}),
         last_provider_event_at: providerEventAt,
         last_provider_event_id: event.external_event_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId).eq("tenant_id", event.tenant_id).eq("provider_connection_id", connectionId);

    const raw = p as Record<string, unknown>;
    const paidDate = (raw["clientPaymentDate"] ?? raw["paymentDate"] ?? raw["confirmedDate"]) as string | undefined;
    const providerFee =
      typeof p.value === "number" && typeof p.netValue === "number" ? Math.max(0, Math.round((p.value - p.netValue) * 100) / 100) : null;

    const args: { _payment_id: string; _status: never; _paid_at?: string; _provider_fee?: number; _estimated_available_at?: string; _estimated_rule?: string } = {
      _payment_id: paymentId,
      _status: status as never,
    };
    if (status === "paid") {
      args._paid_at = paidDate ? new Date(`${paidDate}T12:00:00-03:00`).toISOString() : new Date().toISOString();
      if (providerFee != null) args._provider_fee = providerFee;
      const { calculateEstimatedAvailability } = await import("./settlement-rules");
      const { data: meta } = await admin.from("payments").select("method, installment_number, installment_count, created_at").eq("id", paymentId).eq("tenant_id", event.tenant_id).eq("provider_connection_id", connectionId).single();
      const est = calculateEstimatedAvailability({
        paymentMethod: method ?? meta?.method ?? null,
        paymentDate: meta?.created_at ?? null,
        confirmedAt: args._paid_at,
        installmentNumber: meta?.installment_number,
        installmentCount: meta?.installment_count,
      });
      args._estimated_available_at = est.estimated_available_at;
      args._estimated_rule = est.estimated_rule;
    }
    const { error } = await admin.rpc("apply_payment_event", args);
    if (error) throw new Error(error.message);
    if (status === "paid") {
      // Coprodução: registra somente o valor que o Asaas efetivamente dividiu nesta parcela (idempotente).
      const { recordSplitFromProvider } = await import("./coproduction.server");
      await recordSplitFromProvider(admin, paymentId, p as unknown as Record<string, unknown>, event.external_event_id);
    }
    if (status === "refunded") {
      const { error: cpRefundError } = await (admin.rpc as any)("refund_coproduction_splits", { _payment_id: paymentId });
      if (cpRefundError) console.error("coproduction refund", cpRefundError.message);
    }
    if (status === "paid") await reimburseProviderFee(admin, paymentId);
    if (status === "paid") {
      const { autoIssueOnPayment } = await import("./asaas-invoices.server");
      await autoIssueOnPayment(admin, paymentId);
    }
    // Fonte de verdade da liquidação: o aviso de dinheiro recebido do provedor libera o saldo real.
    if (event.event_type === "PAYMENT_RECEIVED" || event.event_type === "PAYMENT_RECEIVED_IN_CASH") {
      const { error: settleError } = await (admin.rpc as any)("settle_payment", { _payment_id: paymentId });
      if (settleError) throw new Error(settleError.message);
      const { error: cpReleaseError } = await (admin.rpc as any)("release_coproduction_splits", { _payment_id: paymentId });
      if (cpReleaseError) throw new Error(cpReleaseError.message);
    }
    // Linha do tempo da cobrança e estado da tentativa confirmada pelo provedor.
    try {
      const attemptStatus = status === "paid" ? "paid" : status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : null;
      if (attemptStatus) await admin.from("payment_attempts").update({ status: attemptStatus }).eq("tenant_id", event.tenant_id).eq("provider_connection_id", connectionId).eq("provider_payment_id", p.id).eq("status", "active");
      const { logChargeEvent } = await import("./payment-attempts.server");
      await logChargeEvent(admin, { tenantId: event.tenant_id, paymentId, type: `provider.${status}`, metadata: { event: event.event_type } });
    } catch (e) {
      console.error("charge timeline", e instanceof Error ? e.message : "x");
    }
    if (status === "paid" || status === "overdue") {
      await notifyPaymentStatus(admin, event.tenant_id, paymentId, status, event.event_type).catch(() => undefined);
    }
    if (event.event_type.startsWith("PAYMENT_CHARGEBACK") || status === "refunded") {
      const { flagAnticipationImpact } = await import("./anticipation.server");
      await flagAnticipationImpact(admin, paymentId, event.event_type);
    }
    if (status === "paid" || status === "cancelled" || status === "refunded" || event.event_type.startsWith("PAYMENT_CHARGEBACK")) {
      const { finishDunning } = await import("./dunning.server");
      const reason = event.event_type.startsWith("PAYMENT_CHARGEBACK") ? "chargeback" : status === "paid" ? "paid" : status === "cancelled" ? "cancelled" : "refunded";
      await finishDunning(admin, paymentId, reason).catch((e) => console.error("dunning finish", e instanceof Error ? e.message : "falhou"));
    }
    // Aviso ao Wiize só depois do estado real aplicado; falha aqui não desfaz o pagamento.
    try {
      const { enqueueWiizeChargeEvent } = await import("./wiize-pay-oauth.server");
      await enqueueWiizeChargeEvent(admin, paymentId, status);
      const { data: grp } = await admin.from("payments").select("charge_group_id").eq("id", paymentId).eq("tenant_id", event.tenant_id).maybeSingle();
      if (grp?.charge_group_id) {
        const { enqueueWiizeSaleEvent, triggerForStatus } = await import("./wiize-sale-sync.server");
        await enqueueWiizeSaleEvent(admin, event.tenant_id, grp.charge_group_id, triggerForStatus(status));
      }
    } catch (e) {
      console.error("wiize-pay enqueue", e instanceof Error ? e.message : "x");
    }

    await admin.from("webhook_events").update({ processing_status: "processed", error_message: null, processed_at: new Date().toISOString() }).eq("id", eventId);
    await admin.from("audit_logs").insert({
      tenant_id: event.tenant_id,
      action: `payment.${status}`,
      resource: "payments",
      resource_id: paymentId,
      result: "success",
      metadata: { source: "webhook", event: event.event_type } as never,
    });
  } catch (error) {
    await admin
      .from("webhook_events")
      .update({
        processing_status: "failed",
        retry_count: (event.retry_count ?? 0) + 1,
        error_message: error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido",
      })
      .eq("id", eventId);
    throw new Error("event_processing_failed");
  }
}

/**
 * O provedor desconta o custo dele da conta da empresa. Como esse custo é da WiizePay,
 * devolvemos o mesmo valor da conta principal para a empresa. Uma única vez por pagamento.
 */
export async function reimburseProviderFee(admin: AdminClient, paymentId: string) {
  const { data: p } = await admin.from("payments")
    .select("tenant_id, provider_connection_id, provider_fee_amount, provider_fee_covered_amount, provider_fee_reimbursement_id")
    .eq("id", paymentId).single();
  // Só devolve a parte do custo real que a divisão da cobrança ainda não cobriu.
  const { reimbursementCents } = await import("./provider-fee-quote");
  const fee = reimbursementCents(Math.round(Number(p?.provider_fee_amount ?? 0) * 100), Math.round(Number(p?.provider_fee_covered_amount ?? 0) * 100)) / 100;
  if (!p || p.provider_fee_reimbursement_id) return;
  if (fee <= 0) {
    // Custo já coberto pela divisão: marca para a rotina diária não tentar de novo.
    if (Number(p.provider_fee_amount ?? 0) > 0) await admin.from("payments").update({ provider_fee_reimbursement_id: "covered_by_split" }).eq("id", paymentId).is("provider_fee_reimbursement_id", null);
    return;
  }
  const masterKey = process.env["ASAAS_MASTER_API_KEY"];
  const { getPaymentProvider } = await import("./financial-origin.server");
  const original = await getPaymentProvider(admin, p.tenant_id, paymentId);
  const conn = original?.connection;
  if (!masterKey || !conn?.wallet_id) return;
  // Trava otimista: marca antes para impedir duplicidade em eventos simultâneos.
  const { data: locked } = await admin.from("payments").update({ provider_fee_reimbursement_id: "pending" })
    .eq("id", paymentId).is("provider_fee_reimbursement_id", null).select("id").maybeSingle();
  if (!locked) return;
  try {
    const env = (process.env["ASAAS_ENVIRONMENT"] === "production" ? "production" : "sandbox") as "sandbox" | "production";
    const master = new AsaasProvider(masterKey, env);
    const t = await master.createTransfer({ value: fee, walletId: conn.wallet_id, description: "Reembolso custo de processamento WiizePay" });
    await admin.from("payments").update({ provider_fee_reimbursement_id: t.id, provider_fee_reimbursed_at: new Date().toISOString() }).eq("id", paymentId);
  } catch (e) {
    await admin.from("payments").update({ provider_fee_reimbursement_id: null }).eq("id", paymentId);
    await admin.from("audit_logs").insert({
      tenant_id: p.tenant_id, action: "payment.provider_fee_reimbursement", resource: "payments", resource_id: paymentId,
      result: "failure", metadata: { error: e instanceof Error ? e.message.slice(0, 300) : "erro" } as never,
    });
  }
}

/**
 * Endereço que recebe os avisos do Asaas. Só aceita domínios fixos do DEPLOY_CONFIG;
 * qualquer outra origem enviada pelo navegador é ignorada (nunca vira destino dos avisos).
 */
export function publicBaseUrl(origin: string | null | undefined): string | null {
  const stable = DEPLOY_CONFIG.stableFallbackUrl;
  const allowed = new Set<string>([DEPLOY_CONFIG.publicSiteUrl, `https://www.${DEPLOY_CONFIG.publicSiteUrl.replace(/^https:\/\//, "")}`, stable]);
  const clean = (origin ?? "").replace(/\/$/, "");
  return allowed.has(clean) ? clean : stable;
}

const PROVIDER_STATUS_TO_EVENT: Record<string, string> = {
  RECEIVED: "PAYMENT_RECEIVED",
  RECEIVED_IN_CASH: "PAYMENT_RECEIVED",
  CONFIRMED: "PAYMENT_CONFIRMED",
  OVERDUE: "PAYMENT_OVERDUE",
  REFUNDED: "PAYMENT_REFUNDED",
  DELETED: "PAYMENT_DELETED",
  AWAITING_RISK_ANALYSIS: "PAYMENT_AWAITING_RISK_ANALYSIS",
};

/**
 * Reconciliação: consulta o status oficial direto na API do provedor (servidor → provedor,
 * autenticado com a chave da empresa) e aplica pelo mesmo pipeline idempotente do webhook.
 * Cobre avisos perdidos (ex.: webhook ainda não registrado). Nunca usa dados do navegador.
 */
export async function reconcilePaymentFromProvider(admin: AdminClient, tenantId: string, paymentId: string) {
  const { getPaymentProvider } = await import("./financial-origin.server");
  const conn = await getPaymentProvider(admin, tenantId, paymentId);
  if (!conn) throw new Error("Conta de pagamentos não ativada.");
  const { data: row } = await admin
    .from("payments")
    .select("id, provider_payment_id")
    .eq("id", paymentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row?.provider_payment_id) return { status: "unknown" as const };
  const remote = await conn.provider.getPayment(row.provider_payment_id);
  await checkPaymentDivergence(admin, tenantId, paymentId, remote);
  const eventType = PROVIDER_STATUS_TO_EVENT[String(remote.status)];
  if (!eventType) return { status: "unchanged" as const };
  if (remote.id !== row.provider_payment_id) throw new Error("provider_payment_mismatch");
  const externalId = scopedProviderEventId(conn.connection.id, `reconcile:${row.provider_payment_id}:${remote.status}`);
  const payload = { id: externalId, event: eventType, dateCreated: new Date().toISOString(), payment: remote };
  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      provider: "asaas",
      external_event_id: externalId,
      event_type: eventType,
      tenant_id: tenantId,
      provider_connection_id: conn.connection.id,
      payload: payload as never,
    })
    .select("id")
    .maybeSingle();
  let eventId = inserted?.id;
  if (!eventId) {
    if (insertError?.code !== "23505") throw new Error("event_insert_failed");
    const { data: existing } = await admin
      .from("webhook_events")
      .select("id, processing_status")
      .eq("provider", "asaas")
      .eq("tenant_id", tenantId)
      .eq("provider_connection_id", conn.connection.id)
      .eq("external_event_id", externalId)
      .maybeSingle();
    if (!existing || existing.processing_status === "processed" || existing.processing_status === "discarded") {
      return { status: "unchanged" as const };
    }
    eventId = existing.id;
  }
  await processWebhookEvent(admin, eventId);
  return { status: "applied" as const, providerStatus: String(remote.status) };
}

/** Conferência: compara valor bruto e taxa WiizePay com o registrado no provedor. */
export async function checkPaymentDivergence(admin: AdminClient, tenantId: string, paymentId: string, remote: ProviderPayment) {
  const { data: p } = await admin.from("payments").select("gross_amount, platform_fee_amount, provider_fee_covered_amount").eq("id", paymentId).eq("tenant_id", tenantId).maybeSingle();
  if (!p) return;
  const r = remote as ProviderPayment & Record<string, unknown>;
  const issues: { kind: string; expected: number; actual: number }[] = [];
  if (typeof r.value === "number" && Math.abs(r.value - Number(p.gross_amount)) > 0.009)
    issues.push({ kind: "gross_amount", expected: Number(p.gross_amount), actual: r.value });
  const split = (r["split"] as { walletId?: string; fixedValue?: number; totalValue?: number }[] | undefined) ?? [];
  const mine = split.find((s) => s.walletId === process.env["ASAAS_MASTER_WALLET_ID"]);
  if (mine) {
    const v = Number(mine.totalValue ?? mine.fixedValue ?? 0);
    const expected = Math.round((Number(p.platform_fee_amount) - Number(p.provider_fee_covered_amount ?? 0)) * 100) / 100;
    if (Math.abs(v - expected) > 0.009) issues.push({ kind: "platform_fee", expected, actual: v });
  }
  for (const i of issues) {
    await (admin as any).from("reconciliation_issues").upsert({ tenant_id: tenantId, payment_id: paymentId, ...i }, { onConflict: "payment_id,kind" });
  }
}

/** Sininho + e-mails de pagamento recebido ou cobrança em atraso (uma vez por cobrança e situação). */
export async function notifyPaymentStatus(admin: AdminClient, tenantId: string, paymentId: string, status: string, _eventType: string) {
  if (status !== "paid" && status !== "overdue") return;
  const { notifyTenant, brl } = await import("./notify.server");
  const { data: p } = await admin.from("payments").select("id, gross_amount, net_amount, description, due_on, invoice_url, customers(name, email)").eq("id", paymentId).eq("tenant_id", tenantId).maybeSingle();
  if (!p) return;
  const c = p.customers as { name?: string | null; email?: string | null } | null;
  const who = c?.name ?? "Cliente";
  const kind = status === "paid" ? "payment.received" : "payment.overdue";
  const lines = [
    { label: "Cliente", value: who },
    { label: "Valor", value: brl(p.gross_amount) },
    ...(p.description ? [{ label: "Descrição", value: String(p.description).slice(0, 80) }] : []),
    ...(p.due_on ? [{ label: "Vencimento", value: new Date(`${p.due_on}T12:00:00`).toLocaleDateString("pt-BR") }] : []),
  ];
  if (status === "paid") {
    await notifyTenant(admin, {
      tenantId, kind, dedupeKey: `${kind}:${paymentId}`, link: "/cobrancas",
      title: "Pagamento recebido", body: `${who} pagou ${brl(p.gross_amount)}.`,
      email: { subject: `Pagamento recebido de ${who}`, lines: [...lines, { label: "Valor líquido", value: brl(p.net_amount) }] },
    });
  } else {
    await notifyTenant(admin, {
      tenantId, kind, dedupeKey: `${kind}:${paymentId}`, link: "/cobrancas",
      title: "Cobrança em atraso", body: `A cobrança de ${who} (${brl(p.gross_amount)}) venceu e ainda não foi paga.`,
      email: { subject: `Cobrança em atraso — ${who}`, lines },
    });
  }
}
