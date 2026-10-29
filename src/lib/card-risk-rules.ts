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

export const CARD_RISK_RULES = [
  { key: "many_cards_same_origin", field: "cards_per_ip", alert: 3, block: 4 },
  { key: "many_links_same_origin", field: "links_per_ip", alert: 3, block: 5 },
  { key: "declines_same_origin", field: "declines_per_ip", alert: 3, block: 5 },
  { key: "declines_same_card", field: "declines_per_card", alert: 2, block: 3 },
  { key: "card_from_many_origins", field: "ips_per_card", alert: 3, block: 4 },
] as const satisfies ReadonlyArray<{ key: string; field: keyof CardRiskCounts; alert: number; block: number }>;

export function evaluateCardRisk(c: CardRiskCounts): { level: CardRiskLevel; reasons: string[]; block: boolean } {
  const blocked = CARD_RISK_RULES.filter((r) => (c[r.field] ?? 0) >= r.block).map((r) => r.key);
  if (blocked.length) return { level: "high", reasons: blocked, block: true };
  const alerts = CARD_RISK_RULES.filter((r) => (c[r.field] ?? 0) >= r.alert).map((r) => r.key);
  return { level: alerts.length ? "medium" : "low", reasons: alerts, block: false };
}
