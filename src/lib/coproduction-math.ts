/** Regras puras da coprodução. Todo cálculo em centavos inteiros; o resto dos centavos fica com o principal. */
export const MAX_COPRODUCERS = 4;

export type ParticipantRule = { type: "percent" | "fixed"; percent?: number | null; fixedAmount?: number | null };

const toCents = (v: number) => Math.round(v * 100);

/**
 * Converte cada participação em percentual do líquido total da cobrança (6 casas, arredondado para baixo).
 * Valor fixo vira percentual do líquido estimado — nunca um valor garantido.
 */
export function normalizePercents(rules: ParticipantRule[], estimatedNetTotal: number): number[] {
  return rules.map((r) => {
    if (r.type === "percent") return Math.floor(Number(r.percent ?? 0) * 1e6) / 1e6;
    if (!(estimatedNetTotal > 0)) return 0;
    return Math.floor((Number(r.fixedAmount ?? 0) / estimatedNetTotal) * 100 * 1e6) / 1e6;
  });
}

export function validateRules(rules: ParticipantRule[], estimatedNetTotal: number): string | null {
  if (rules.length === 0) return "Adicione pelo menos um coprodutor.";
  if (rules.length > MAX_COPRODUCERS) return `O limite é de ${MAX_COPRODUCERS} coprodutores por cobrança.`;
  for (const r of rules) {
    if (r.type === "percent" && !(Number(r.percent) > 0 && Number(r.percent) < 100)) return "Cada percentual deve ser maior que 0% e menor que 100%.";
    if (r.type === "fixed" && !(Number(r.fixedAmount) > 0)) return "Cada valor fixo deve ser maior que zero.";
  }
  const pcts = normalizePercents(rules, estimatedNetTotal);
  if (pcts.some((p) => !(p > 0))) return "Uma das participações é pequena demais para o valor desta cobrança.";
  const sum = pcts.reduce((a, b) => a + b, 0);
  if (sum >= 100) return "A soma das participações precisa deixar uma parte para você (menos de 100% do líquido).";
  return null;
}

/**
 * Divide o líquido de UMA parcela: cada coprodutor recebe floor(percentual × líquido);
 * o principal fica com o restante, então a soma é sempre exatamente o líquido.
 */
export function splitNet(netAmount: number, percents: number[]) {
  const net = Math.max(0, toCents(netAmount));
  const parts = percents.map((p) => Math.floor((net * Math.round(p * 1e6)) / 1e8));
  const principal = net - parts.reduce((a, b) => a + b, 0);
  return { principal: principal / 100, participants: parts.map((c) => c / 100), net: net / 100 };
}
