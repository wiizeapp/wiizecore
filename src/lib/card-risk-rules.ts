/**
 * Regras determinísticas de comportamento suspeito no checkout com cartão (janela de 1 hora).
 * Não é "inteligência artificial": cada regra tem um limite fixo e um motivo explícito.
 * Os limites não são mostrados ao pagador.
 */
export type CardRiskCounts = {
  cards_per_ip: number;
  links_per_ip: number;
  declines_per_ip: number;
  declines_per_card: number;
  ips_per_card: number;
};

export type CardRiskLevel = "low" | "medium" | "high";
export type CardRiskSubject = "origin" | "card";

export const CARD_RISK_WINDOW_SECONDS = 3600;

export const CARD_RISK_RULES = [
  { key: "many_cards_same_origin", field: "cards_per_ip", subject: "origin", alert: 3, block: 4 },
  { key: "many_links_same_origin", field: "links_per_ip", subject: "origin", alert: 3, block: 5 },
  { key: "declines_same_origin", field: "declines_per_ip", subject: "origin", alert: 3, block: 5 },
  { key: "declines_same_card", field: "declines_per_card", subject: "card", alert: 2, block: 3 },
  { key: "card_from_many_origins", field: "ips_per_card", subject: "card", alert: 3, block: 4 },
] as const satisfies ReadonlyArray<{ key: string; field: keyof CardRiskCounts; subject: CardRiskSubject; alert: number; block: number }>;

export const CARD_RISK_REASON_LABELS: Record<string, string> = {
  many_cards_same_origin: "Vários cartões na mesma origem",
  many_links_same_origin: "Vários links na mesma origem",
  declines_same_origin: "Recusas repetidas na mesma origem",
  declines_same_card: "Recusas repetidas do mesmo cartão",
  card_from_many_origins: "Mesmo cartão em várias origens",
  risk_check_unavailable: "Verificação indisponível",
};

export type CardRiskFinding = { subject: CardRiskSubject; level: "medium" | "high"; reasons: string[] };

export function evaluateCardRisk(c: CardRiskCounts): { level: CardRiskLevel; reasons: string[]; block: boolean; findings: CardRiskFinding[] } {
  const findings: CardRiskFinding[] = [];
  for (const subject of ["origin", "card"] as const) {
    const rules = CARD_RISK_RULES.filter((r) => r.subject === subject);
    const blocked = rules.filter((r) => (c[r.field] ?? 0) >= r.block).map((r) => r.key);
    const alerts = rules.filter((r) => (c[r.field] ?? 0) >= r.alert).map((r) => r.key);
    if (blocked.length) findings.push({ subject, level: "high", reasons: blocked });
    else if (alerts.length) findings.push({ subject, level: "medium", reasons: alerts });
  }
  const high = findings.filter((f) => f.level === "high");
  if (high.length) return { level: "high", reasons: high.flatMap((f) => f.reasons), block: true, findings };
  const reasons = findings.flatMap((f) => f.reasons);
  return { level: reasons.length ? "medium" : "low", reasons, block: false, findings };
}

/** Decisões administrativas permitidas a partir de cada status do caso. */
export const CARD_RISK_ACTIONS = ["confirm", "false_positive", "unblock", "close"] as const;
export type CardRiskAction = (typeof CARD_RISK_ACTIONS)[number];
export function canDecide(status: string, action: CardRiskAction): boolean {
  if (status === "false_positive" || status === "closed") return false;
  if (status === "confirmed") return action === "unblock" || action === "close";
  return status === "open";
}
