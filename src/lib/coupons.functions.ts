import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COUPON_CODE_RE, normalizeCouponCode } from "./coupon-math";

type Ctx = { supabase: any; userId: string };

/** Membro ativo + permissões efetivas calculadas no servidor (nível, cargo e extras). */
async function membership(context: Ctx, perm: string) {
  const { loadAccess } = await import("./team.functions");
  const a = await loadAccess(context.userId);
  if (!a.permissions.includes(perm)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("./audit.server");
    await logAudit(supabaseAdmin, { tenantId: a.tenantId, userId: context.userId, action: "permission.denied", result: "blocked", metadata: { perm } } as never);
    throw new Error("Você não tem permissão para esta ação.");
  }
  return { tenant_id: a.tenantId, role: a.role, permissions: a.permissions };
}

export const listCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx, "coupons.view");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const [{ data: coupons }, { data: reds }] = await Promise.all([
      admin.from("coupons").select("id, code, description, discount_type, discount_value, max_discount, min_amount, starts_at, expires_at, usage_limit, per_customer_limit, status, restore_on_refund, created_at").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(500),
      admin.from("coupon_redemptions").select("coupon_id, status, discount_amount, base_amount").eq("tenant_id", m.tenant_id).in("status", ["reserved", "redeemed"]).limit(10000),
    ]);
    const stats = new Map<string, { used: number; reserved: number; discount: number; revenue: number }>();
    for (const r of reds ?? []) {
      const s = stats.get(r.coupon_id) ?? { used: 0, reserved: 0, discount: 0, revenue: 0 };
      if (r.status === "redeemed") { s.used++; s.discount += Number(r.discount_amount); s.revenue += Number(r.base_amount) - Number(r.discount_amount); }
      else s.reserved++;
      stats.set(r.coupon_id, s);
    }
    return {
      canEdit: m.permissions.includes("coupons.edit") || m.permissions.includes("coupons.create"),
      canCreate: m.permissions.includes("coupons.create"),
      canArchive: m.permissions.includes("coupons.archive"),
      coupons: (coupons ?? []).map((c) => ({
        id: c.id, code: c.code, description: c.description, type: c.discount_type as "percent" | "fixed", value: Number(c.discount_value),
        maxDiscount: c.max_discount != null ? Number(c.max_discount) : null, minAmount: c.min_amount != null ? Number(c.min_amount) : null,
        startsAt: c.starts_at, expiresAt: c.expires_at, usageLimit: c.usage_limit, perCustomerLimit: c.per_customer_limit,
        status: c.status as "active" | "paused" | "archived", restoreOnRefund: c.restore_on_refund, createdAt: c.created_at,
        ...(stats.get(c.id) ?? { used: 0, reserved: 0, discount: 0, revenue: 0 }),
      })),
    };
  });

const money = z.number().positive().max(10_000_000).nullable();
const couponInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().max(200).nullable(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive().max(10_000_000),
  maxDiscount: money,
  minAmount: z.number().min(0).max(10_000_000).nullable(),
  startsAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  usageLimit: z.number().int().positive().max(1_000_000).nullable(),
  perCustomerLimit: z.number().int().positive().max(1000).nullable(),
  restoreOnRefund: z.boolean(),
}).strict();

/** Cria ou edita. A empresa vem sempre da sessão; campos extras são rejeitados. */
export const saveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => couponInput.parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx, data.id ? "coupons.edit" : "coupons.create");
    const code = normalizeCouponCode(data.code);
    if (!COUPON_CODE_RE.test(code)) throw new Error("Use de 3 a 32 letras, números, hífen ou sublinhado.");
    if (data.type === "percent" && data.value > 100) throw new Error("O percentual máximo é 100%.");
    if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) throw new Error("A data final deve ser depois da inicial.");
    const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
    const row = {
      code, code_normalized: code, description: data.description || null, discount_type: data.type, discount_value: r2(data.value)!,
      max_discount: data.type === "percent" ? r2(data.maxDiscount) : null, min_amount: r2(data.minAmount), starts_at: data.startsAt, expires_at: data.expiresAt,
      usage_limit: data.usageLimit, per_customer_limit: data.perCustomerLimit, restore_on_refund: data.restoreOnRefund,
    };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    let id = data.id;
    if (id) {
      const { data: upd, error } = await admin.from("coupons").update(row).eq("id", id).eq("tenant_id", m.tenant_id).select("id").maybeSingle();
      if (error?.code === "23505") throw new Error("Já existe um cupom com esse código.");
      if (error || !upd) throw new Error("Cupom não encontrado.");
    } else {
      const { data: ins, error } = await admin.from("coupons").insert({ ...row, tenant_id: m.tenant_id, created_by: (context as Ctx).userId }).select("id").single();
      if (error?.code === "23505") throw new Error("Já existe um cupom com esse código.");
      if (error || !ins) throw new Error("Não foi possível salvar o cupom.");
      id = ins.id;
    }
    await admin.from("coupon_events").insert({ tenant_id: m.tenant_id, coupon_id: id, event: data.id ? "updated" : "created", metadata: { by: (context as Ctx).userId } as never });
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { tenantId: m.tenant_id, userId: (context as Ctx).userId, action: data.id ? "coupon.updated" : "coupon.created", resource: "coupons", resourceId: id, metadata: { code } } as never);
    return { id };
  });

export const setCouponStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "archived"]) }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx, data.status === "archived" ? "coupons.archive" : "coupons.edit");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: upd } = await admin.from("coupons").update({ status: data.status }).eq("id", data.id).eq("tenant_id", m.tenant_id).select("id").maybeSingle();
    if (!upd) throw new Error("Cupom não encontrado.");
    await admin.from("coupon_events").insert({ tenant_id: m.tenant_id, coupon_id: data.id, event: `status_${data.status}`, metadata: { by: (context as Ctx).userId } as never });
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { tenantId: m.tenant_id, userId: (context as Ctx).userId, action: "coupon.status", resource: "coupons", resourceId: data.id, metadata: { status: data.status } } as never);
    return { ok: true };
  });
