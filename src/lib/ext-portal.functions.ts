import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAccess } from "./team.functions";
import { SANDBOX_ACTIONS } from "./ext-sandbox";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
const envInput = z.object({ environment: z.enum(["test", "live"]) });

async function integrationIds(tenantId: string, env: "test" | "live") {
  const { data } = await (await db()).from("ext_integrations").select("id").eq("tenant_id", tenantId).eq("environment", env);
  return (data ?? []).map((r) => r.id);
}

/** Serviços da empresa e se podem ser vendidos pelo checkout externo. */
export const listPortalServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await loadAccess(context.userId);
    const { data } = await (await db()).from("services").select("id, name, amount, type, frequency, active, custom_amount, accepted_methods").eq("tenant_id", a.tenantId).is("archived_at", null).order("name").limit(200);
    return (data ?? []).map((s) => ({
      id: s.id, name: s.name, amount: Number(s.amount).toFixed(2), type: s.type, frequency: s.frequency, active: s.active, methods: s.accepted_methods,
      blocker: !s.active ? "inactive" : s.custom_amount ? "custom_amount" : Number(s.amount) <= 0 ? "no_amount" : !s.accepted_methods.length ? "no_methods" : null,
    }));
  });

/** Cobranças criadas pela API no ambiente escolhido. Teste = simulador; produção = cobranças reais. */
export const listPortalCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => envInput.extend({ recurringOnly: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await loadAccess(context.userId);
    const d = await db();
    const ids = await integrationIds(a.tenantId, data.environment);
    if (!ids.length) return { rows: [] };
    if (data.environment === "test") {
      let q = d.from("ext_sandbox_charges").select("id, service_name, charge_type, frequency, amount, payment_method, customer_name, status, subscription_status, cycles_paid, history, created_at").eq("tenant_id", a.tenantId).in("integration_id", ids).order("created_at", { ascending: false }).limit(100);
      if (data.recurringOnly) q = q.eq("charge_type", "recurring");
      const { data: rows } = await q;
      return { rows: (rows ?? []).map((r) => ({ id: r.id, sandbox: true, service: r.service_name, type: r.charge_type, frequency: r.frequency, amount: Number(r.amount).toFixed(2), method: r.payment_method, customer: r.customer_name, status: r.status, subscriptionStatus: r.subscription_status, cyclesPaid: r.cycles_paid, history: (r.history as { at: string; label: string; event?: string }[]) ?? [], createdAt: r.created_at })) };
    }
    const { data: sess } = await d.from("ext_checkout_sessions").select("id, charge_group_id, service_id, customer_id, created_at").eq("tenant_id", a.tenantId).in("integration_id", ids).order("created_at", { ascending: false }).limit(100);
    const list = sess ?? [];
    if (!list.length) return { rows: [] };
    const [{ data: pays }, { data: svcs }, { data: custs }] = await Promise.all([
      d.from("payments").select("charge_group_id, status, gross_amount, method, subscription_id, installment_number").eq("tenant_id", a.tenantId).in("charge_group_id", list.map((s) => s.charge_group_id)),
      d.from("services").select("id, name, type, frequency").eq("tenant_id", a.tenantId).in("id", [...new Set(list.map((s) => s.service_id))]),
      d.from("customers").select("id, name").eq("tenant_id", a.tenantId).in("id", [...new Set(list.map((s) => s.customer_id))]),
    ]);
    const rows = list.map((s) => {
      const ps = (pays ?? []).filter((p) => p.charge_group_id === s.charge_group_id);
      const svc = (svcs ?? []).find((x) => x.id === s.service_id);
      const open = ps.find((p) => !["paid", "cancelled", "refunded"].includes(p.status)) ?? ps[ps.length - 1];
      return {
        id: s.charge_group_id, sandbox: false, service: svc?.name ?? "—", type: svc?.type ?? "one_time", frequency: svc?.frequency ?? null,
        amount: (ps.reduce((acc, p) => acc + Math.round(Number(p.gross_amount) * 100), 0) / 100).toFixed(2), method: open?.method ?? null,
        customer: (custs ?? []).find((c) => c.id === s.customer_id)?.name ?? "—", status: open?.status ?? "created",
        subscriptionStatus: ps.some((p) => p.subscription_id) ? "linked" : null, cyclesPaid: ps.filter((p) => p.status === "paid").length,
        history: [] as { at: string; label: string; event?: string }[], createdAt: s.created_at,
      };
    });
    return { rows: data.recurringOnly ? rows.filter((r) => r.type === "recurring") : rows };
  });

/** Simulação de pagamento de teste. Só dono/administrador; só registros de teste da própria empresa. */
export const simulatePortalCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(SANDBOX_ACTIONS) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await loadAccess(context.userId);
    if (a.role !== "owner" && a.role !== "admin") throw new Error("Somente o dono ou administrador pode simular pagamentos de teste.");
    const d = await db();
    const { simulateSandbox } = await import("./ext-sandbox.server");
    const r = await simulateSandbox(d, a.tenantId, data.id, data.action, `user:${context.userId}`);
    if (!r.ok) throw new Error(r.error === "not_found" ? "Cobrança de teste não encontrada." : r.error === "conflict" ? "A cobrança mudou ao mesmo tempo. Atualize e tente de novo." : "Esta simulação não é possível no estado atual.");
    const { logAudit } = await import("./audit.server");
    await logAudit(d, { tenantId: a.tenantId, userId: context.userId, action: "ext_sandbox.simulated", resource: "ext_sandbox_charges", resourceId: data.id, metadata: { action: data.action } });
    return { label: r.label, event: r.event };
  });

/** Diagnóstico: chamadas recebidas pela API, sem corpo, chave ou dados pessoais. */
export const listPortalRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => envInput.parse(d))
  .handler(async ({ data, context }) => {
    const a = await loadAccess(context.userId);
    const { data: rows } = await (await db()).from("ext_request_logs").select("id, request_id, method, path, status, duration_ms, auth_result, error_code, environment, created_at").eq("tenant_id", a.tenantId).eq("environment", data.environment).order("created_at", { ascending: false }).limit(100);
    return rows ?? [];
  });

/** Progresso real do roteiro de primeiros passos, calculado a partir do que aconteceu. */
export const getPortalProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => envInput.parse(d))
  .handler(async ({ data, context }) => {
    const a = await loadAccess(context.userId);
    const d = await db();
    const ids = await integrationIds(a.tenantId, data.environment);
    if (!ids.length) return { integration: false, key: false, endpoint: false, session: false, paid: false, delivered: false };
    const [keys, eps, logs] = await Promise.all([
      d.from("ext_api_keys").select("id", { count: "exact", head: true }).in("integration_id", ids).eq("status", "active"),
      d.from("ext_webhook_endpoints").select("id").in("integration_id", ids).eq("status", "active"),
      d.from("ext_request_logs").select("id", { count: "exact", head: true }).eq("tenant_id", a.tenantId).in("integration_id", ids).eq("path", "/v1/ext/checkout-sessions").in("status", [200, 201]),
    ]);
    const epIds = (eps.data ?? []).map((e) => e.id);
    let paid = false;
    if (data.environment === "test") {
      const { count } = await d.from("ext_sandbox_charges").select("id", { count: "exact", head: true }).eq("tenant_id", a.tenantId).in("integration_id", ids).gt("cycles_paid", 0);
      paid = (count ?? 0) > 0;
    } else {
      const { data: s } = await d.from("ext_checkout_sessions").select("charge_group_id").eq("tenant_id", a.tenantId).in("integration_id", ids).limit(200);
      const g = (s ?? []).map((x) => x.charge_group_id);
      if (g.length) { const { count } = await d.from("payments").select("id", { count: "exact", head: true }).eq("tenant_id", a.tenantId).in("charge_group_id", g).eq("status", "paid"); paid = (count ?? 0) > 0; }
    }
    const { count: delivered } = epIds.length ? await d.from("ext_webhook_deliveries").select("id", { count: "exact", head: true }).in("endpoint_id", epIds).eq("status", "delivered").neq("type", "webhook.test") : { count: 0 };
    return { integration: true, key: (keys.count ?? 0) > 0, endpoint: epIds.length > 0, session: (logs.count ?? 0) > 0, paid, delivered: (delivered ?? 0) > 0 };
  });

/** Página pública do checkout de teste: dados mínimos pelo código do link. */
export const getSandboxCheckout = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^sbx_[A-Za-z0-9_-]{20,80}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { data: r } = await (await db()).from("ext_sandbox_charges").select("service_name, charge_type, frequency, amount, payment_method, customer_name, status, expires_at, success_url, cancel_url").eq("public_token", data.token).maybeSingle();
    if (!r) return null;
    return { service: r.service_name, type: r.charge_type, frequency: r.frequency, amount: Number(r.amount).toFixed(2), method: r.payment_method, customer: r.customer_name, status: r.status, expired: new Date(r.expires_at) < new Date(), successUrl: r.success_url, cancelUrl: r.cancel_url };
  });

/** O comprador de teste escolhe o resultado; só existe no simulador. */
export const paySandboxCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().regex(/^sbx_[A-Za-z0-9_-]{20,80}$/),
    outcome: z.enum(["approve", "decline", "pending"]).optional(),
    // Só cartões fictícios de teste; nunca gravado nem registrado.
    testCard: z.string().max(25).optional(),
  }).refine((v) => v.outcome || v.testCard, "outcome_required").parse(d))
  .handler(async ({ data }) => {
    let outcome = data.outcome;
    if (data.testCard !== undefined) {
      const { testCardOutcome } = await import("./ext-test-cards");
      const fromCard = testCardOutcome(data.testCard);
      if (!fromCard) throw new Error("Use um dos cartões de teste da documentação. Cartões reais não são aceitos no ambiente de testes.");
      outcome = fromCard;
    }
    const d = await db();
    const { data: r } = await d.from("ext_sandbox_charges").select("id, tenant_id, expires_at").eq("public_token", data.token).maybeSingle();
    if (!r || new Date(r.expires_at) < new Date()) throw new Error("Link de teste indisponível.");
    const { consumeRateLimit } = await import("./audit.server");
    const rl = await consumeRateLimit(d, { scope: "sbx_checkout", identifier: r.id, maxAttempts: 20, windowSeconds: 300, blockSeconds: 300 });
    if (!rl.allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    const { simulateSandbox } = await import("./ext-sandbox.server");
    const res = await simulateSandbox(d, r.tenant_id, r.id, outcome!, "checkout");
    if (!res.ok) throw new Error("Esta cobrança de teste não pode mais receber essa simulação.");
    return { status: res.row.status };
  });
