type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

// As tabelas de contestação foram criadas pela migração 0046; enquanto os tipos
// gerados não são atualizados, o acesso usa cast explícito (somente servidor).
type Db = AdminClient & { from: (table: string) => ReturnType<AdminClient["from"]> };

export const CHARGEBACK_EVENTS = [
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
] as const;

export type ChargebackEventType = (typeof CHARGEBACK_EVENTS)[number];

export function isChargebackEvent(eventType: string): eventType is ChargebackEventType {
  return (CHARGEBACK_EVENTS as readonly string[]).includes(eventType);
}

/** Estado oficial do chargeback informado pelo processador → estado interno da tarefa. */
export function internalStatusFor(eventType: ChargebackEventType, providerStatus?: string | null) {
  if (providerStatus === "REVERSED") return "reversed" as const;
  if (providerStatus === "DISPUTE_LOST") return "lost" as const;
  if (providerStatus === "IN_DISPUTE") return "in_review" as const;
  switch (eventType) {
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return "awaiting_documents" as const;
    case "PAYMENT_CHARGEBACK_DISPUTE":
      return "in_review" as const;
    case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL":
      return "reversed" as const;
  }
}

const EVENT_DESCRIPTIONS: Record<ChargebackEventType, string> = {
  PAYMENT_CHARGEBACK_REQUESTED: "Contestação recebida do processador.",
  PAYMENT_CHARGEBACK_DISPUTE: "Defesa apresentada; contestação em análise.",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "Disputa vencida; aguardando repasse da adquirente.",
};

const EVENT_TITLES: Record<ChargebackEventType, string> = {
  PAYMENT_CHARGEBACK_REQUESTED: "Uma cobrança foi contestada",
  PAYMENT_CHARGEBACK_DISPUTE: "Contestação em análise",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "Contestação revertida a seu favor",
};

/**
 * Processa um evento oficial de chargeback já autenticado e registrado.
 * Idempotente: o mesmo evento do processador nunca duplica caso, histórico ou aviso.
 * Retorna false quando a cobrança não pertence a esta empresa/conexão.
 */
export async function processChargebackWebhook(
  admin: AdminClient,
  input: {
    tenantId: string;
    connectionId: string;
    providerPaymentId: string;
    eventType: ChargebackEventType;
    externalEventId: string | null;
    paymentPayload: Record<string, unknown>;
  },
): Promise<boolean> {
  const db = admin as Db;
  const { tenantId, connectionId, providerPaymentId, eventType } = input;

  const { data: payment } = await admin
    .from("payments")
    .select("id, gross_amount, customers(name)")
    .eq("tenant_id", tenantId)
    .eq("provider_connection_id", connectionId)
    .eq("provider", "asaas")
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();
  if (!payment) return false;

  const rawChargeback = (input.paymentPayload["chargeback"] ?? null) as { id?: string; status?: string; reason?: string } | null;
  const providerStatus = typeof rawChargeback?.status === "string" ? rawChargeback.status : null;
  const reason = typeof rawChargeback?.reason === "string" ? rawChargeback.reason : null;
  const providerChargebackId = typeof rawChargeback?.id === "string" ? rawChargeback.id : null;
  const amount = typeof input.paymentPayload["value"] === "number" ? (input.paymentPayload["value"] as number) : Number(payment.gross_amount ?? 0);
  const deadline = typeof input.paymentPayload["deadlineToSendDisputeDocuments"] === "string" ? (input.paymentPayload["deadlineToSendDisputeDocuments"] as string) : null;

  // Cria ou localiza o caso (único por conexão + cobrança do processador).
  const { data: existing } = await db
    .from("chargeback_cases")
    .select("id, last_event, last_provider_event_id, internal_status")
    .eq("provider_connection_id", connectionId)
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();

  // Mesmo evento reenviado: nada a fazer (idempotência).
  if (existing?.last_provider_event_id && existing.last_provider_event_id === input.externalEventId) return true;

  const internalStatus = internalStatusFor(eventType, providerStatus);
  const officialStatus = providerStatus ?? (eventType === "PAYMENT_CHARGEBACK_DISPUTE" ? "IN_DISPUTE" : eventType === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL" ? "REVERSED" : "REQUESTED");

  let caseId: string;
  if (existing) {
    caseId = (existing as { id: string }).id;
    await db
      .from("chargeback_cases")
      .update({
        payment_id: payment.id,
        amount,
        ...(reason ? { reason } : {}),
        ...(providerChargebackId ? { provider_chargeback_id: providerChargebackId } : {}),
        status: officialStatus,
        internal_status: internalStatus,
        ...(deadline ? { dispute_deadline: deadline } : {}),
        last_event: eventType,
        last_provider_event_id: input.externalEventId,
      })
      .eq("id", caseId)
      .eq("tenant_id", tenantId);
  } else {
    const { data: inserted, error } = await db
      .from("chargeback_cases")
      .insert({
        tenant_id: tenantId,
        payment_id: payment.id,
        provider_connection_id: connectionId,
        provider_payment_id: providerPaymentId,
        provider_chargeback_id: providerChargebackId,
        amount,
        reason,
        status: officialStatus,
        internal_status: internalStatus,
        dispute_deadline: deadline,
        last_event: eventType,
        last_provider_event_id: input.externalEventId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("chargeback_case_failed");
    caseId = (inserted as { id: string }).id;
  }

  // Histórico imutável do caso.
  await db.from("chargeback_events").insert({
    tenant_id: tenantId,
    case_id: caseId,
    event_type: eventType,
    origin: "provider",
    description: EVENT_DESCRIPTIONS[eventType],
    metadata: { reason, providerStatus, externalEventId: input.externalEventId },
  });

  // Aviso à empresa: sininho + e-mail, sem duplicar em reenvio do mesmo tipo de evento.
  const alreadyNotified = existing?.last_event === eventType;
  if (!alreadyNotified) {
    const { notifyTenant, brl } = await import("./notify.server");
    const customerName = (payment.customers as { name?: string } | null)?.name ?? "cliente";
    await notifyTenant(admin, {
      tenantId,
      kind: "chargeback",
      title: EVENT_TITLES[eventType],
      body: `A cobrança de ${customerName} no valor de ${brl(amount)} teve uma atualização de contestação: ${EVENT_DESCRIPTIONS[eventType]}${deadline ? ` Prazo para envio de documentos: ${deadline}.` : ""}`,
      link: "/cobrancas",
      dedupeKey: `chargeback:${providerPaymentId}:${eventType}`,
      email: { subject: `WiizePay — ${EVENT_TITLES[eventType]}` },
    });
  }

  const { logAudit } = await import("./audit.server");
  await logAudit(admin, {
    tenantId,
    action: `chargeback.${eventType.toLowerCase()}`,
    resource: "chargeback_cases",
    resourceId: caseId,
    result: "success",
    metadata: { providerPaymentId, reason, providerStatus },
    externalEventId: input.externalEventId,
  });
  return true;
}
