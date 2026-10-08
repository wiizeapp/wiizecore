import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function membership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(context.userId, "charges.view");
  if (!data) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

/** Forma atual, tentativas e linha do tempo de uma cobrança da empresa. */
export const getChargeTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { loadPayment, canSwitch, allowedMethods, quote } = await import("./payment-attempts.server");
    const p = await loadPayment(admin, m.tenant_id, data.paymentId);
    if (!p) throw new Error("Cobrança não encontrada.");
    const [{ data: attempts }, { data: events }] = await Promise.all([
      admin.from("payment_attempts").select("attempt_number, method, status, reason, amount, fine_amount, interest_amount, due_on, actor, created_at").eq("payment_id", p.id).eq("tenant_id", m.tenant_id).order("attempt_number"),
      admin.from("charge_events").select("event_type, actor, metadata, created_at").eq("payment_id", p.id).eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(50),
    ]);
    const switchable = canSwitch(p);
    const q = quote(p);
    return {
      method: p.method,
      status: p.status,
      amount: Number(p.gross_amount),
      canEdit: ["owner", "admin", "finance"].includes(m.role),
      canSwitch: switchable,
      switchBlockedReason: switchable ? null : p.provider_installment_id ? "Parcelas fazem parte de um parcelamento e não podem trocar de forma individualmente." : p.subscription_id ? "Cobranças recorrentes seguem a forma definida na recorrência." : "Esta cobrança não está em aberto.",
      methods: switchable ? await allowedMethods(admin, p) : [],
      late: q,
      attempts: (attempts ?? []).map((a) => ({ ...a, amount: Number(a.amount), fine_amount: Number(a.fine_amount), interest_amount: Number(a.interest_amount) })),
      events: events ?? [],
    };
  });

/** O prestador troca a forma de pagamento, sempre com senha financeira validada no servidor. */
export const providerSwitchMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      paymentId: z.string().uuid(),
      method: z.enum(["pix", "boleto", "credit_card"]),
      password: z.string().min(1).max(128),
      idempotencyKey: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const m = await membership(ctx);
    if (!["owner", "admin", "finance"].includes(m.role)) throw new Error("Somente dono, administrador ou financeiro pode alterar.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { assertFinancialPassword } = await import("./finance.server");
    await assertFinancialPassword(admin, ctx.userId, data.password, "charge.method_change");
    const { switchPaymentAttempt } = await import("./payment-attempts.server");
    await switchPaymentAttempt(admin, {
      tenantId: m.tenant_id, paymentId: data.paymentId, method: data.method, reason: "method_change",
      actor: "provider", userId: ctx.userId, idempotencyKey: data.idempotencyKey,
    });
    const { data: grp } = await admin.from("payments").select("charge_group_id").eq("id", data.paymentId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (grp?.charge_group_id) {
      const { enqueueWiizeSaleEvent } = await import("./wiize-sale-sync.server");
      await enqueueWiizeSaleEvent(admin, m.tenant_id, grp.charge_group_id, "updated");
    }
    return { ok: true };
  });
