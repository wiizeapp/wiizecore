/**
 * Configuração central de prazos da Wiize Recebe (fonte única).
 * Previsões apenas informam o usuário; o saldo só é liberado pela confirmação real do provedor.
 * Arquivo sem segredos: usado no servidor (cálculo) e nas páginas (textos).
 */
export type SettlementMethod = "pix" | "boleto" | "debit_card" | "credit_card" | "credit_installment";

export const SETTLEMENT_RULES: Record<SettlementMethod, { label: string; text: string; kind: "business" | "calendar"; days: number; rule: string }> = {
  pix: { label: "Pix", text: "Até 1 dia útil", kind: "business", days: 1, rule: "pix_1_business_day" },
  boleto: { label: "Boleto", text: "Próximo dia útil após a compensação", kind: "business", days: 1, rule: "boleto_next_business_day" },
  debit_card: { label: "Cartão de débito", text: "Até 3 dias úteis após a confirmação", kind: "business", days: 3, rule: "debit_card_3_business_days" },
  credit_card: { label: "Cartão de crédito à vista", text: "Até 32 dias corridos, sujeito à compensação em dias úteis", kind: "calendar", days: 32, rule: "credit_card_32_days" },
  credit_installment: { label: "Cartão de crédito parcelado", text: "Cada parcela a cada 32 dias corridos, sujeito à compensação em dias úteis", kind: "calendar", days: 32, rule: "credit_installment_32_days" },
};

/** Prazo de análise da antecipação (não é garantia de crédito). */
export const ANTICIPATION_ANALYSIS_DAYS: Record<"pix" | "boleto" | "credit_card", number> = { pix: 3, boleto: 3, credit_card: 2 };

export function anticipationAnalysisText(method: string | null) {
  const d = method === "credit_card" ? ANTICIPATION_ANALYSIS_DAYS.credit_card : method === "pix" ? ANTICIPATION_ANALYSIS_DAYS.pix : ANTICIPATION_ANALYSIS_DAYS.boleto;
  return `A antecipação está sujeita à análise e pode levar até ${d} dias úteis.`;
}

export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  AWAITING_SETTLEMENT: "Aguardando liquidação",
  AVAILABLE: "Disponível",
  ANTICIPATION_PENDING: "Antecipação pendente",
  ANTICIPATED: "Antecipado",
  REFUNDED: "Estornado",
  PARTIALLY_REFUNDED: "Estornado parcialmente",
  CHARGEBACK: "Contestação",
  CANCELLED: "Cancelado",
};

// ---------- Calendário de dias úteis (fins de semana + feriados nacionais) ----------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const cache = new Map<number, Set<string>>();
export function nationalHolidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${year}-${md}`);
  const e = easter(year);
  const mobile = [addDays(e, -48), addDays(e, -47), addDays(e, -2), addDays(e, 60)].map(iso); // Carnaval (seg/ter), Sexta Santa, Corpus Christi
  const set = new Set([...fixed, ...mobile]);
  cache.set(year, set);
  return set;
}

export function isBusinessDay(d: Date) {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !nationalHolidays(d.getUTCFullYear()).has(iso(d));
}
export function nextBusinessDayOnOrAfter(d: Date) {
  let x = d;
  while (!isBusinessDay(x)) x = addDays(x, 1);
  return x;
}
export function addBusinessDays(d: Date, n: number) {
  let x = d;
  let left = n;
  while (left > 0) { x = addDays(x, 1); if (isBusinessDay(x)) left--; }
  return x;
}

/** Data (YYYY-MM-DD) no fuso de São Paulo. */
export function saoPauloDate(ts: string | Date) {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return new Date(`${s}T00:00:00Z`);
}

export function settlementMethodOf(method: string | null | undefined, installmentCount?: number | null): SettlementMethod {
  if (method === "credit_card") return (installmentCount ?? 1) > 1 ? "credit_installment" : "credit_card";
  if (method === "debit_card") return "debit_card";
  if (method === "boleto") return "boleto";
  return "pix";
}

/**
 * calculateEstimatedAvailability — previsão de disponibilidade.
 * Parcelado: parcela N libera 32×N dias após a operação (paymentDate).
 */
export function calculateEstimatedAvailability(input: {
  paymentMethod: string | null;
  paymentDate?: string | Date | null;
  confirmedAt: string | Date;
  installmentNumber?: number | null | undefined;
  installmentCount?: number | null | undefined;
}): { estimated_available_at: string; estimated_rule: string } {
  const m = settlementMethodOf(input.paymentMethod, input.installmentCount);
  const r = SETTLEMENT_RULES[m];
  const confirmed = saoPauloDate(input.confirmedAt);
  if (r.kind === "business") return { estimated_available_at: iso(addBusinessDays(confirmed, r.days)), estimated_rule: r.rule };
  const base = saoPauloDate(input.paymentDate ?? input.confirmedAt);
  const n = m === "credit_installment" ? Math.max(1, input.installmentNumber ?? 1) : 1;
  return { estimated_available_at: iso(nextBusinessDayOnOrAfter(addDays(base, r.days * n))), estimated_rule: r.rule };
}
