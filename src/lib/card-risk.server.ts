import { evaluateCardRisk, type CardRiskCounts } from "./card-risk-rules";

type AdminClient = Parameters<typeof import("./audit.server").logAudit>[0];

/**
 * Registra a tentativa/recusa e avalia as regras de comportamento suspeito.
 * Só guarda marcas irreversíveis (hash) de IP, cartão e link — nunca o cartão.
 * Falha fechada: sem resposta do contador, a tentativa não segue.
 */
export async function recordCardRisk(
  admin: AdminClient,
  opts: { tenantId: string; paymentId: string; ip: string | null; cardMark: string | null; linkMark: string; outcome: "attempt" | "declined" },
) {
  const { tokenFingerprint } = await import("./crypto.server");
  const ipMark = opts.ip ? tokenFingerprint(`ip:${opts.ip}`).slice(0, 40) : null;
  const { data, error } = await (admin as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> }).rpc("card_risk_record", {
    _tenant: opts.tenantId, _ip_mark: ipMark, _card_mark: opts.cardMark, _link_mark: opts.linkMark, _outcome: opts.outcome,
  });
  const row = (Array.isArray(data) ? data[0] : data) as CardRiskCounts | undefined;
  if (error || !row) return { block: true, level: "high" as const, reasons: ["risk_check_unavailable"] };
  const result = evaluateCardRisk(row);
  if (result.level !== "low") {
    const { logSecurityEvent } = await import("./audit.server");
    await logSecurityEvent(admin, {
      tenantId: opts.tenantId,
      eventType: result.block ? "checkout.card_risk_blocked" : "checkout.card_risk_alert",
      severity: result.block ? "critical" : "warning",
      metadata: { paymentId: opts.paymentId, reasons: result.reasons, outcome: opts.outcome },
    }).catch(() => undefined);
  }
  return result;
}
