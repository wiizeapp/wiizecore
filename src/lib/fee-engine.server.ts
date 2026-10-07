type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type FeeMethod = "pix" | "pix_recurring" | "boleto" | "debit_card" | "credit_card";

export type PaymentFeeCalculation = {
  grossAmount: number;
  grossCents: number;
  fixedFee: number;
  fixedFeeCents: number;
  percentageFee: number;
  percentageFeeAmount: number;
  percentageFeeCents: number;
  totalFee: number;
  totalFeeCents: number;
  netAmount: number;
  netCents: number;
  installments: number;
  paymentMethod: FeeMethod;
  feeConfigurationId: string;
  calculationTimestamp: string;
};

export function decimalToCents(value: string | number): number {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Valor monetário inválido.");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Valor monetário fora do limite permitido.");
  return cents;
}

export function centsToAmount(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new Error("Valor monetário inválido.");
  return cents / 100;
}

function percentageToHundredths(value: string | number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) throw new Error("Percentual inválido.");
  return Math.round(normalized * 100);
}

export function calculateFeeFromConfig(input: {
  grossAmount: string | number;
  installments: number;
  paymentMethod: FeeMethod;
  config: { id: string; fixed_fee: string | number; percentage_fee: string | number };
  timestamp?: string;
}): PaymentFeeCalculation {
  const grossCents = decimalToCents(input.grossAmount);
  if (grossCents <= 0) throw new Error("O valor da cobrança deve ser maior que zero.");
  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 21) {
    throw new Error("Número de parcelas inválido.");
  }
  const fixedFeeCents = decimalToCents(input.config.fixed_fee);
  const percentageHundredths = percentageToHundredths(input.config.percentage_fee);
  const percentageFeeCents = Math.round((grossCents * percentageHundredths) / 10_000);
  const totalFeeCents = fixedFeeCents + percentageFeeCents;
  const netCents = grossCents - totalFeeCents;
  if (netCents < 0) throw new Error("A taxa é maior que o valor da cobrança.");
  return {
    grossAmount: centsToAmount(grossCents),
    grossCents,
    fixedFee: centsToAmount(fixedFeeCents),
    fixedFeeCents,
    percentageFee: percentageHundredths / 100,
    percentageFeeAmount: centsToAmount(percentageFeeCents),
    percentageFeeCents,
    totalFee: centsToAmount(totalFeeCents),
    totalFeeCents,
    netAmount: centsToAmount(netCents),
    netCents,
    installments: input.installments,
    paymentMethod: input.paymentMethod,
    feeConfigurationId: input.config.id,
    calculationTimestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export async function calculatePaymentFee(
  admin: AdminClient,
  input: {
    paymentMethod: FeeMethod;
    grossAmount: string | number;
    installments?: number;
    /** Empresa de uma cobrança ÚNICA à vista (sem parcelas/recorrência). Só assim a promoção de lançamento é avaliada. */
    launchPromoTenantId?: string;
  },
): Promise<PaymentFeeCalculation & { isPromotional: boolean }> {
  const installments = input.installments ?? 1;
  // Faixa da tarifa: cartão, débito em conta e boleto variam por parcelas.
  const tier = input.paymentMethod === "credit_card" || input.paymentMethod === "debit_card" || input.paymentMethod === "boleto" ? installments : 1;
  const now = new Date().toISOString();
  const { data: config, error } = await admin
    .from("payment_fee_settings")
    .select("id, fixed_fee, percentage_fee")
    .eq("payment_method", input.paymentMethod)
    .eq("active", true)
    .lte("installment_min", tier)
    .gte("installment_max", tier)
    .lte("effective_from", now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !config) throw new Error("Não existe uma tarifa ativa para esta modalidade.");
  // Promoção de lançamento: 0% percentual no Pix/boleto à vista; tarifa fixa mantida. Decidido só aqui, no servidor.
  let isPromotional = false;
  if (input.launchPromoTenantId && installments === 1) {
    const { isLaunchPromoMethod } = await import("./launch-promotion");
    if (isLaunchPromoMethod(input.paymentMethod, true)) {
      const { isEligibleForLaunchPromotion } = await import("./launch-promotion.server");
      isPromotional = await isEligibleForLaunchPromotion(admin, input.launchPromoTenantId, new Date(now));
    }
  }
  const effective = isPromotional ? { ...config, percentage_fee: 0 } : config;
  return { ...calculateFeeFromConfig({ grossAmount: input.grossAmount, installments, paymentMethod: input.paymentMethod, config: effective, timestamp: now }), isPromotional };
}

export function calculateAnticipationFromConfig(input: {
  grossAmount: string | number;
  originalDueDate: string;
  anticipationDate: string;
  monthlyRate: string | number;
}) {
  const grossCents = decimalToCents(input.grossAmount);
  if (grossCents <= 0) throw new Error("O recebível deve ser maior que zero.");
  const due = new Date(`${input.originalDueDate}T12:00:00Z`);
  const anticipated = new Date(`${input.anticipationDate}T12:00:00Z`);
  if (Number.isNaN(due.getTime()) || Number.isNaN(anticipated.getTime())) throw new Error("Data inválida.");
  const days = Math.max(0, Math.ceil((due.getTime() - anticipated.getTime()) / 86_400_000));
  const rateHundredths = percentageToHundredths(input.monthlyRate);
  const feeCents = Math.round((grossCents * rateHundredths * days) / (10_000 * 30));
  return {
    grossReceivableAmount: centsToAmount(grossCents),
    daysAnticipated: days,
    monthlyRate: rateHundredths / 100,
    effectiveRateForPeriod: (rateHundredths / 100) * (days / 30),
    anticipationFee: centsToAmount(feeCents),
    netAnticipatedAmount: centsToAmount(grossCents - feeCents),
  };
}
/** Custo estimado do provedor (configurado no Admin). Retorna null quando não configurado — nunca inventa custo. */
export async function estimateProviderCost(
  admin: AdminClient,
  input: { paymentMethod: FeeMethod; grossAmount: number; installments?: number; fixedCount?: number },
): Promise<{ id: string; cost: number } | null> {
  const installments = input.installments ?? 1;
  const tierN = input.paymentMethod === "credit_card" || input.paymentMethod === "debit_card" || input.paymentMethod === "boleto" ? installments : 1;
  const now = new Date().toISOString();
  const { data } = await admin
    .from("provider_cost_settings")
    .select("id, fixed_cost, percentage_cost")
    .eq("payment_method", input.paymentMethod)
    .eq("active", true)
    .lte("installment_min", tierN)
    .gte("installment_max", tierN)
    .lte("effective_from", now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { feeFor } = await import("./fee-math");
  return { id: data.id, cost: feeFor(input.grossAmount, { fixed: Number(data.fixed_cost), percent: Number(data.percentage_cost) }, input.fixedCount ?? 1) };
}
