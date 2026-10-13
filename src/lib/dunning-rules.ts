/** Régua de cobrança — regras puras (sem acesso a banco), usadas no cliente e no servidor. */
export type DunningChannel = "whatsapp" | "sms" | "email" | "voice";
export type DunningPlanCode = "essential" | "smart" | "intensive";
export type DunningStepKey = "created" | "before" | "due" | "overdue" | "overdue_repeat" | "received";

export const CHANNELS: DunningChannel[] = ["whatsapp", "sms", "email", "voice"];
export const PLAN_CHANNELS: Record<DunningPlanCode, DunningChannel[]> = {
  essential: ["whatsapp"],
  smart: ["whatsapp", "sms", "email"],
  intensive: ["whatsapp", "sms", "email", "voice"],
};
export const PLAN_ORDER: DunningPlanCode[] = ["essential", "smart", "intensive"];
/** Antecedências aceitas pelo Asaas para o aviso antes do vencimento. */
export const BEFORE_OFFSETS = [1, 5, 7, 10, 15, 30] as const;

export type DunningSteps = { beforeOffset: number; beforeOffsets: number[] } & Record<DunningStepKey, DunningChannel[]>;

export const DEFAULT_STEPS: DunningSteps = {
  beforeOffset: 5,
  beforeOffsets: [15, 5],
  created: ["whatsapp", "email"],
  before: ["whatsapp", "sms", "email"],
  due: ["whatsapp"],
  overdue: ["whatsapp", "voice"],
  overdue_repeat: ["whatsapp", "voice"],
  received: ["whatsapp", "email"],
};

export function minPlanFor(channel: DunningChannel): DunningPlanCode {
  return PLAN_ORDER.find((p) => PLAN_CHANNELS[p].includes(channel))!;
}

/** Normaliza e remove canais fora do plano — o servidor sempre aplica isto antes de salvar/enviar. */
export function sanitizeSteps(raw: unknown, plan: DunningPlanCode): DunningSteps {
  const src = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Partial<Record<string, unknown>>;
  const allowed = PLAN_CHANNELS[plan];
  const out = { ...DEFAULT_STEPS };
  const off = Number(src["beforeOffset"]);
  out.beforeOffset = (BEFORE_OFFSETS as readonly number[]).includes(off) ? off : DEFAULT_STEPS.beforeOffset;
  const rawOffsets = Array.isArray(src["beforeOffsets"]) ? src["beforeOffsets"] as unknown[] : [out.beforeOffset];
  out.beforeOffsets = [...new Set(rawOffsets.map(Number).filter((value) => (BEFORE_OFFSETS as readonly number[]).includes(value)))].slice(0, 2);
  if (!out.beforeOffsets.length) out.beforeOffsets = [out.beforeOffset];
  out.beforeOffset = out.beforeOffsets[0] ?? DEFAULT_STEPS.beforeOffset;
  for (const k of ["created", "before", "due", "overdue", "overdue_repeat", "received"] as DunningStepKey[]) {
    const list = Array.isArray(src[k]) ? (src[k] as unknown[]) : DEFAULT_STEPS[k];
    out[k] = [...new Set(list.filter((c): c is DunningChannel => typeof c === "string" && (allowed as string[]).includes(c)))];
  }
  return out;
}

export type BalanceLevel = "normal" | "low" | "critical" | "insufficient";
export function balanceLevel(balance: number, s: { alert: number; critical: number }, price: number): BalanceLevel {
  if (balance < price) return "insufficient";
  if (balance < s.critical) return "critical";
  if (balance < s.alert) return "low";
  return "normal";
}

/** Custo estimado por cobrança: soma de 1 envio por canal do plano; null se algum custo não foi cadastrado. */
export function planCost(plan: DunningPlanCode, costs: Partial<Record<DunningChannel, number | null>>): number | null {
  let total = 0;
  for (const c of PLAN_CHANNELS[plan]) {
    const v = costs[c];
    if (v == null) return null;
    total += Math.round(Number(v) * 10000);
  }
  return total / 10000;
}

/** Monta o payload de notificações do Asaas a partir da régua. */
export function toAsaasNotifications(
  list: { id: string; event: string; scheduleOffset?: number }[],
  steps: DunningSteps | null,
): Record<string, unknown>[] {
  const flags = (chs: DunningChannel[] | null) => ({
    enabled: !!chs && chs.length > 0,
    emailEnabledForCustomer: !!chs?.includes("email"),
    smsEnabledForCustomer: !!chs?.includes("sms"),
    whatsappEnabledForCustomer: !!chs?.includes("whatsapp"),
    phoneCallEnabledForCustomer: !!chs?.includes("voice"),
    emailEnabledForProvider: false,
    smsEnabledForProvider: false,
  });
  const warnings = list.filter((n) => n.event === "PAYMENT_DUEDATE_WARNING").sort((a, b) => (b.scheduleOffset ?? 0) - (a.scheduleOffset ?? 0));
  const overdue = list.filter((n) => n.event === "PAYMENT_OVERDUE").sort((a, b) => (a.scheduleOffset ?? 0) - (b.scheduleOffset ?? 0));
  const out: Record<string, unknown>[] = [];
  for (const n of list) {
    let chs: DunningChannel[] | null = null;
    const extra: Record<string, unknown> = {};
    if (steps) {
      if (n.event === "PAYMENT_CREATED") chs = steps.created;
      else if (n.event === "PAYMENT_RECEIVED") chs = steps.received;
      else if (n.event === "PAYMENT_DUEDATE_WARNING") {
        const warningIndex = warnings.findIndex((warning) => warning.id === n.id);
        const offset = steps.beforeOffsets[warningIndex];
        if (offset != null) { chs = steps.before; extra["scheduleOffset"] = offset; }
        else chs = steps.due;
      } else if (n.event === "PAYMENT_OVERDUE") chs = n.id === overdue[0]?.id ? steps.overdue : steps.overdue_repeat;
    }
    // E-mail de cobrança criada é enviado pela WiizePay; desliga no Asaas para não duplicar.
    if (n.event === "PAYMENT_CREATED") extra["emailEnabledForCustomer"] = false;
    out.push({ id: n.id, ...flags(chs), ...extra });
  }
  return out;
}
