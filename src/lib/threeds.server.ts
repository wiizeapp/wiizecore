type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

// A tabela payment_authentications é criada pela migração 0046; enquanto os tipos
// gerados não são atualizados, o acesso usa cast explícito (somente servidor).
type Db = AdminClient & { from: (table: string) => ReturnType<AdminClient["from"]> };

export type ThreeDsModality = "single" | "installment" | "recurring";

/**
 * 3DS no checkout fica DESLIGADO por padrão. Só liga com CHECKOUT_3DS_ENABLED=true
 * depois da habilitação e validação da conta de produção no processador.
 */
export function isCheckoutThreeDsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["CHECKOUT_3DS_ENABLED"] === "true";
}

export async function checkoutThreeDsAllowed(admin: AdminClient): Promise<boolean> {
  if (!isCheckoutThreeDsEnabled()) return false;
  const { data, error } = await admin.from("checkout_3ds_control").select("allowed").eq("id", "checkout").maybeSingle();
  return !error && data?.allowed === true;
}

/**
 * Cada cobrança tem sua própria autenticação: parcelada e recorrente nunca
 * reutilizam a autenticação de outra compra. Renovações recorrentes são cobradas
 * pelo processador fora da presença do cliente, conforme as regras oficiais.
 */
export function modalityForPayment(payment: { subscription_id?: string | null; installment_count?: number | null }): ThreeDsModality {
  if (payment.subscription_id) return "recurring";
  if ((payment.installment_count ?? 0) > 1) return "installment";
  return "single";
}

export type AuthFinalStatus = "authenticated" | "failed" | "capture_refused";

/** Evento oficial do processador → estado final da autenticação registrada. */
export function authStatusForEvent(eventType: string): AuthFinalStatus | null {
  switch (eventType) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "authenticated";
    case "PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED":
      return "failed";
    case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED":
      return "capture_refused";
    default:
      return null;
  }
}

/**
 * Registra o início do fluxo 3DS de uma cobrança. Nunca guarda dados de cartão.
 * Falha aqui nunca interrompe o pagamento; apenas deixa de haver registro de
 * autenticação (e nada é apresentado como autenticado sem evidência).
 */
export async function recordAuthStart(
  admin: AdminClient,
  input: {
    tenantId: string;
    paymentId: string;
    paymentAttemptId: string | null;
    connectionId: string;
    providerPaymentId: string;
    modality: ThreeDsModality;
    authResult: "frictionless" | "issuer_challenge";
    correlationId: string;
  },
): Promise<void> {
  try {
    const db = admin as Db;
    const { data: existing } = await db
      .from("payment_authentications")
      .select("id, attempts, status")
      .eq("provider_connection_id", input.connectionId)
      .eq("provider_payment_id", input.providerPaymentId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (existing) {
      const row = existing as { id: string; attempts: number; status: string };
      // Uma autenticação concluída nunca é reaberta por outra compra ou repetição.
      if (["authenticated", "failed", "capture_refused"].includes(row.status)) return;
      await db
        .from("payment_authentications")
        .update({
          payment_id: input.paymentId,
          payment_attempt_id: input.paymentAttemptId,
          modality: input.modality,
          status: input.authResult === "issuer_challenge" ? "challenge_redirected" : "started",
          auth_result: input.authResult,
          attempts: row.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("tenant_id", input.tenantId);
      return;
    }
    const { error } = await db.from("payment_authentications").insert({
      tenant_id: input.tenantId,
      payment_id: input.paymentId,
      payment_attempt_id: input.paymentAttemptId,
      provider_connection_id: input.connectionId,
      provider_payment_id: input.providerPaymentId,
      modality: input.modality,
      status: input.authResult === "issuer_challenge" ? "challenge_redirected" : "started",
      auth_result: input.authResult,
      correlation_id: input.correlationId,
    });
    if (error) console.error("3ds auth record", error.message);
  } catch (e) {
    console.error("3ds auth record", e instanceof Error ? e.message : "falhou");
  }
}

/** O navegador voltou do desafio do banco. O retorno NÃO confirma o pagamento; só o webhook confirma. */
export async function markAuthReturned(admin: AdminClient, input: { tenantId: string; paymentId: string }): Promise<void> {
  try {
    const db = admin as Db;
    await db
      .from("payment_authentications")
      .update({ status: "returned", updated_at: new Date().toISOString() })
      .eq("tenant_id", input.tenantId)
      .eq("payment_id", input.paymentId)
      .eq("status", "challenge_redirected");
  } catch (e) {
    console.error("3ds auth return", e instanceof Error ? e.message : "falhou");
  }
}

/**
 * Atualiza o registro de autenticação a partir de um webhook oficial já autenticado.
 * Idempotente: mesmo evento externo não repete a conclusão; autenticação concluída
 * nunca é alterada por evento fora de ordem.
 */
export async function syncAuthFromWebhook(
  admin: AdminClient,
  input: { tenantId: string; connectionId: string; providerPaymentId: string; eventType: string; externalEventId: string | null },
): Promise<void> {
  const next = authStatusForEvent(input.eventType);
  if (!next) return;
  try {
    const db = admin as Db;
    const { data: row } = await db
      .from("payment_authentications")
      .select("id, status, external_event_id")
      .eq("provider_connection_id", input.connectionId)
      .eq("provider_payment_id", input.providerPaymentId)
      .eq("tenant_id", input.tenantId)
      .in("status", ["started", "challenge_redirected", "returned"])
      .maybeSingle();
    if (!row) return;
    const current = row as { id: string; status: string; external_event_id: string | null };
  if (input.externalEventId && current.external_event_id === input.externalEventId) return;
    await db
      .from("payment_authentications")
      .update({
        status: next,
        external_event_id: input.externalEventId ?? current.external_event_id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("tenant_id", input.tenantId)
      .in("status", ["started", "challenge_redirected", "returned"]);
  } catch (e) {
    console.error("3ds auth sync", e instanceof Error ? e.message : "falhou");
  }
}
