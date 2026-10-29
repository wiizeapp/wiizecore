import { CARD_RISK_WINDOW_SECONDS, evaluateCardRisk, type CardRiskCounts } from "./card-risk-rules";

type AdminClient = Parameters<typeof import("./audit.server").logAudit>[0];
type Rpc = { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> };

/**
 * Registra a tentativa/recusa, avalia as regras e abre/atualiza o caso para revisão no Admin.
 * Só guarda marcas irreversíveis (hash) de IP, cartão e link — nunca o cartão.
 * Falha fechada: sem resposta do contador, a tentativa não segue.
 */
export async function recordCardRisk(
  admin: AdminClient,
  opts: { tenantId: string; paymentId: string; ip: string | null; cardMark: string | null; linkMark: string; outcome: "attempt" | "declined" },
) {
  const { tokenFingerprint } = await import("./crypto.server");
  const ipMark = opts.ip ? tokenFingerprint(`ip:${opts.ip}`).slice(0, 40) : null;
  const db = admin as unknown as Rpc;
  const { data, error } = await db.rpc("card_risk_record", {
    _tenant: opts.tenantId, _ip_mark: ipMark, _card_mark: opts.cardMark, _link_mark: opts.linkMark, _outcome: opts.outcome,
  });
  const row = (Array.isArray(data) ? data[0] : data) as CardRiskCounts | undefined;
  if (error || !row) return { block: true, level: "high" as const, reasons: ["risk_check_unavailable"] };
  const result = evaluateCardRisk(row);
  if (result.level !== "low") {
    const blockedUntil = new Date(Date.now() + CARD_RISK_WINDOW_SECONDS * 1000).toISOString();
    for (const f of result.findings) {
      const mark = f.subject === "origin" ? ipMark : opts.cardMark;
      if (!mark) continue;
      await db.rpc("card_risk_open_case", {
        _tenant: opts.tenantId, _kind: f.subject, _mark: mark, _level: f.level, _reasons: f.reasons,
        _blocked_until: f.level === "high" ? blockedUntil : null, _payment: opts.paymentId,
      }).catch(() => undefined);
    }
    const { logSecurityEvent } = await import("./audit.server");
    await logSecurityEvent(admin, {
      tenantId: opts.tenantId,
      eventType: result.block ? "checkout.card_risk_blocked" : "checkout.card_risk_alert",
      severity: result.block ? "critical" : "warning",
      metadata: { paymentId: opts.paymentId, reasons: result.reasons, outcome: opts.outcome },
    }).catch(() => undefined);
  }
  return { block: result.block, level: result.level, reasons: result.reasons };
}
