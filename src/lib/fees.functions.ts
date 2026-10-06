import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const methodSchema = z.enum(["pix", "pix_recurring", "boleto", "debit_card", "credit_card"]);

function publicClient() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  return createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const listPublicFees = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [{ data: paymentFees, error: paymentError }, { data: anticipationFees, error: anticipationError }] = await Promise.all([
    supabase.from("payment_fee_settings").select("id, payment_method, installment_min, installment_max, fixed_fee, percentage_fee, version").eq("active", true).order("payment_method").order("installment_min"),
    supabase.from("anticipation_fee_settings").select("id, payment_method, monthly_percentage_fee, version").eq("active", true).order("payment_method"),
  ]);
  const { data: dunningPlans } = await supabase.from("dunning_plans").select("code, price, channels").eq("active", true).order("price");
  if (paymentError || anticipationError) throw new Error("Não foi possível consultar as tarifas agora.");
  // Tarifas públicas de serviços (nota fiscal e saque) — somente estas chaves, lidas no servidor.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin.from("platform_settings").select("key, value").in("key", ["invoice_fee_amount", "withdrawal_fee_amount", "minimum_withdrawal_amount"]);
  const setting = (k: string) => { const v = settings?.find((x) => x.key === k)?.value; return v == null ? null : Number(v); };
  return {
    serviceFees: { invoice: setting("invoice_fee_amount"), withdrawal: setting("withdrawal_fee_amount"), minimumWithdrawal: setting("minimum_withdrawal_amount") },
    paymentFees: (paymentFees ?? []).map((fee) => ({ ...fee, fixed_fee: Number(fee.fixed_fee), percentage_fee: Number(fee.percentage_fee) })),
    anticipationFees: (anticipationFees ?? []).map((fee) => ({ ...fee, monthly_percentage_fee: Number(fee.monthly_percentage_fee) })),
    dunningPlans: (dunningPlans ?? []).map((p) => ({ code: p.code, price: Number(p.price), channels: p.channels })),
  };
});

export const simulatePaymentFee = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ paymentMethod: methodSchema, grossAmount: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/), installments: z.number().int().min(1).max(21), feePassShare: z.number().min(0).max(100).default(0) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { calculatePaymentFee } = await import("./fee-engine.server");
    const { grossUp, fixedFeeCount } = await import("./fee-math");
    const service = Number(data.grossAmount.replace(",", "."));
    const tier = data.paymentMethod === "credit_card" || data.paymentMethod === "debit_card" || data.paymentMethod === "boleto" ? data.installments : 1;
    const cfg = await calculatePaymentFee(supabaseAdmin, { paymentMethod: data.paymentMethod, grossAmount: "100", installments: tier });
    const n = data.paymentMethod === "boleto" || data.paymentMethod === "debit_card" || data.paymentMethod === "credit_card" || data.paymentMethod === "pix" ? data.installments : 1;
    const r = grossUp(service, { fixed: cfg.fixedFee, percent: cfg.percentageFee }, data.feePassShare, fixedFeeCount(data.paymentMethod, n));
    return { serviceAmount: service, grossAmount: r.total, totalFee: r.fee, netAmount: r.providerNet, customerPaysFee: r.customerPaysFee, installments: n, fixedFee: cfg.fixedFee, percentageFee: cfg.percentageFee };
  });
