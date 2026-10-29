import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/);

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function resolveLink(admin: AdminClient, token: string) {
  const { tokenFingerprint } = await import("./crypto.server");
  const { consumeRateLimit, requestInfo } = await import("./audit.server");
  const ip = requestInfo().ip ?? "unknown";
  const limit = await consumeRateLimit(admin, { scope: "checkout", identifier: ip, maxAttempts: 120, windowSeconds: 600, blockSeconds: 600 });
  if (!limit.allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos.");

  const { data: link } = await admin
    .from("payment_links")
    .select("id, tenant_id, charge_group_id, customer_id, service_id, contract_id, expires_at, revoked_at, collect_customer_data")
    .eq("token_hash", tokenFingerprint(token))
    .maybeSingle();
  if (!link || !link.charge_group_id) return { state: "invalid" as const };
  if (link.revoked_at) return { state: "revoked" as const };
  // O link é permanente: depois do prazo ele continua abrindo e oferece a regularização.
  const linkExpired = false; // Links de cobrança não expiram mais.
  return { state: "ok" as const, link, linkExpired };
}

type ResolvedLink = { id: string; tenant_id: string; charge_group_id: string | null; customer_id: string | null };

/** Linha do tempo do checkout (visível no Cliente 360). Nunca guarda dados sensíveis. */
async function trackEvent(admin: AdminClient, link: ResolvedLink, event: string, metadata: Record<string, unknown> = {}, dedupeMinutes = 0) {
  if (!link.charge_group_id) return;
  try {
    if (dedupeMinutes > 0) {
      const since = new Date(Date.now() - dedupeMinutes * 60000).toISOString();
      const { data: recent } = await admin.from("checkout_events").select("id").eq("charge_group_id", link.charge_group_id).eq("event", event).gte("created_at", since).limit(1).maybeSingle();
      if (recent) return;
    }
    await admin.from("checkout_events").insert({ tenant_id: link.tenant_id, customer_id: link.customer_id, charge_group_id: link.charge_group_id, payment_link_id: link.id, event, metadata: metadata as never });
  } catch (e) { console.error("checkout event", e instanceof Error ? e.message : "falhou"); }
}

const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
const FREQ_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };
function addFrequency(date: string, frequency: string) {
  const d = new Date(`${date}T12:00:00Z`);
  if (FREQ_DAYS[frequency]) d.setUTCDate(d.getUTCDate() + FREQ_DAYS[frequency]!);
  else d.setUTCMonth(d.getUTCMonth() + (FREQ_MONTHS[frequency] ?? 1));
  return d.toISOString().slice(0, 10);
}

/** Eventos que o próprio navegador do cliente pode registrar. */
export const trackCheckoutEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema, event: z.enum(["contract_viewed", "payment_viewed"]), method: z.enum(["pix", "boleto", "credit_card"]).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") return { ok: false };
    await trackEvent(admin, resolved.link, data.event, data.method ? { method: data.method } : {}, 30);
    return { ok: true };
  });

function maskDocument(doc: string | null) {
  if (!doc) return null;
  const d = doc.replace(/\D/g, "");
  if (d.length <= 4) return "••••";
  return `${"•".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

export const getCheckout = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") return { state: resolved.state };
    const { link } = resolved;

    const [{ data: tenant }, { data: customer }, { data: service }, { data: payments }] = await Promise.all([
      admin.from("tenants").select("name").eq("id", link.tenant_id).maybeSingle(),
      link.customer_id ? admin.from("customers").select("name, email, document, phone, zip_code, address, address_number, complement, district, city, state").eq("id", link.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      link.service_id ? admin.from("services").select("name, type, accepted_methods, frequency").eq("id", link.service_id).maybeSingle() : Promise.resolve({ data: null }),
      admin
        .from("payments")
        .select("id, description, gross_amount, service_amount, fee_payer_share, due_on, status, method, installment_number, installment_count, invoice_url, bank_slip_url, paid_at, fine_percent, interest_percent, original_amount, original_due_on, provider_installment_id, subscription_id, provider_payment_id, service_id, checkout_appearance_version_id")
        .eq("tenant_id", link.tenant_id)
        .eq("charge_group_id", link.charge_group_id!)
        .order("due_on", { ascending: true }),
    ]);

    const t = tenant as { name?: string } | null;
    const fullRows = payments ?? [];
    const groupId = link.charge_group_id!;
    const [{ data: confirmedEvent }] = await Promise.all([
      admin.from("checkout_events").select("id").eq("charge_group_id", groupId).eq("event", "data_confirmed").limit(1).maybeSingle(),
      trackEvent(admin, link, "opened", {}, 30),
    ]);
    // Recorrência: mostra a próxima mensalidade prevista enquanto o provedor ainda não a gerou.
    let nextExpected: { dueOn: string; amount: number } | null = null;
    const subscriptionId = fullRows.find((r) => r.subscription_id)?.subscription_id;
    const hasOpen = fullRows.some((r) => ["created", "awaiting_payment", "overdue"].includes(r.status));
    if (subscriptionId && !hasOpen) {
      const { data: sub } = await admin.from("subscriptions").select("active, amount, frequency, cycles").eq("id", subscriptionId).maybeSingle();
      const valid = fullRows.filter((r) => r.status !== "cancelled" && r.status !== "refunded");
      const last = [...valid].sort((a, b) => String(a.due_on).localeCompare(String(b.due_on))).pop();
      if (sub?.active && last?.due_on && (!sub.cycles || valid.length < sub.cycles)) {
        nextExpected = { dueOn: addFrequency(last.due_on, sub.frequency ?? "monthly"), amount: Number(sub.amount) };
      }
    }
    const versionId = fullRows.find((row) => row.checkout_appearance_version_id)?.checkout_appearance_version_id ?? null;
    const appearancePromise = (versionId
      ? admin.from("checkout_appearance_versions").select("settings").eq("id", versionId).eq("tenant_id", link.tenant_id).maybeSingle()
      : admin.from("checkout_appearance_versions").select("settings").eq("tenant_id", link.tenant_id).order("version", { ascending: false }).limit(1).maybeSingle())
      .then(({ data }) => data);

    const pendingContractPromise = (async (): Promise<{ title: string; body: string; version: number } | null> => {
      const linkedContractId = link.contract_id;
      const linkedCustomerId = link.customer_id;
      if (!linkedContractId || !linkedCustomerId) return null;
      const { data: contract } = await admin
        .from("contracts")
        .select("id, title, status, current_version, customer_id")
        .eq("id", linkedContractId)
        .eq("tenant_id", link.tenant_id)
        .eq("customer_id", linkedCustomerId)
        .maybeSingle();
      if (contract && !["cancelled", "expired"].includes(contract.status)) {
        const { data: version } = await admin
          .from("contract_versions")
          .select("id, body, version")
          .eq("contract_id", contract.id)
          .eq("version", contract.current_version)
          .maybeSingle();
        if (version) {
          const { data: signature } = await admin
            .from("contract_signatures")
            .select("id")
            .eq("contract_version_id", version.id)
            .eq("signer_role", "customer")
            .maybeSingle();
          if (!signature) return { title: contract.title, body: version.body ?? "", version: version.version };
        }
      }
      return null;
    })();
    const coproductionPending = await (await import("./coproduction.server")).coproductionBlocksCheckout(admin, groupId);
    const { canSwitch, quote, allowedMethods } = await import("./payment-attempts.server");
    const [appearanceRow, pendingContract] = await Promise.all([appearancePromise, pendingContractPromise]);
    const methodCache = new Map<string, Promise<Awaited<ReturnType<typeof allowedMethods>>>>();
    const methodsFor = (payment: (typeof fullRows)[number]) => {
      if (!payment.service_id) return allowedMethods(admin, payment as never);
      const cached = methodCache.get(payment.service_id);
      if (cached) return cached;
      const request = allowedMethods(admin, payment as never);
      methodCache.set(payment.service_id, request);
      return request;
    };

    // Endereços de volta ao sistema integrado (só navegação; nunca confirmam pagamento).
    const { data: extSession } = await admin.from("ext_checkout_sessions").select("success_url, cancel_url").eq("charge_group_id", groupId).eq("tenant_id", link.tenant_id).maybeSingle();
    return {
      state: "ok" as const,
      returnUrls: { success: extSession?.success_url ?? null, cancel: extSession?.cancel_url ?? null },
      linkExpired: resolved.linkExpired,
      appearance: await (await import("./checkout-appearance.server")).resolveAppearance(admin, appearanceRow?.settings),
      providerName: t?.name || "Prestador",
      portalKey: link.tenant_id as string,
      // A confirmação de dados e o aceite dos termos são sempre exigidos uma vez por cobrança.
      collectCustomerData: true,
      dataConfirmed: Boolean(confirmedEvent),
      nextExpected,
      customer: customer
        ? {
            name: customer.name,
            email: customer.email,
            document: maskDocument(customer.document),
            phone: customer.phone,
            zipCode: customer.zip_code,
            address: customer.address,
            addressNumber: customer.address_number,
            complement: customer.complement,
            district: customer.district,
            city: customer.city,
            state: customer.state,
            complete: Boolean(customer.email && customer.phone && customer.zip_code && customer.address && customer.address_number && customer.city && customer.state),
          }
        : null,
      service: service ? { name: service.name, type: service.type, acceptedMethods: service.accepted_methods, frequency: service.frequency } : null,
      pendingContract,
      coproductionPending,
      couponsAvailable: await (async () => {
        const { count } = await admin.from("coupons").select("id", { count: "exact", head: true }).eq("tenant_id", link.tenant_id).eq("status", "active");
        return (count ?? 0) > 0;
      })(),
      payments: await Promise.all(fullRows.map(async (p) => {
        const switchable = canSwitch(p as never);
        const q = quote(p as never);
        const { data: red } = await admin.from("coupon_redemptions").select("discount_amount, coupons(code)").eq("payment_id", p.id).in("status", ["reserved", "redeemed"]).maybeSingle();
        const discount = red ? Number(red.discount_amount) : 0;
        const { applyDiscount } = await import("./coupon-math");
        return {
          id: p.id,
          description: p.description,
          amount: Number(p.gross_amount),
          serviceAmount: p.service_amount != null ? Number(p.service_amount) : null,
          feePassShare: Number(p.fee_payer_share ?? 0),
          dueOn: p.due_on,
          originalDueOn: (p.original_due_on as string | null) ?? p.due_on,
          status: p.status,
          method: p.method,
          installmentNumber: p.installment_number,
          installmentCount: p.installment_count,
          invoiceUrl: coproductionPending ? null : p.invoice_url,
          bankSlipUrl: coproductionPending ? null : p.bank_slip_url,
          paidAt: p.paid_at,
          finePercent: Number(p.fine_percent ?? 0),
          interestPercent: Number(p.interest_percent ?? 0),
          canSwitch: switchable,
          switchMethods: switchable ? await methodsFor(p) : [],
          coupon: red ? { code: (red.coupons as { code?: string } | null)?.code ?? "", discount } : null,
          late: { days: q.days, original: q.base, fine: q.fine, interest: q.interest, total: discount ? applyDiscount(q.total, discount) : q.total },
        };
      })),
    };
  });

const switchSchema = z.object({
  token: tokenSchema,
  paymentId: z.string().uuid(),
  method: z.enum(["pix", "boleto", "credit_card"]),
  idempotencyKey: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
});

/** O cliente troca a forma de pagamento ou regulariza, sempre pelo mesmo link. */
export const switchCheckoutMethod = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => switchSchema.extend({ regularize: z.boolean().default(false) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") throw new Error("Link indisponível.");
    if (await (await import("./coproduction.server")).coproductionBlocksCheckout(admin, resolved.link.charge_group_id!)) throw new Error("Pagamento disponível em breve.");
    const { link } = resolved;
    const { consumeRateLimit } = await import("./audit.server");
    const limit = await consumeRateLimit(admin, { scope: "checkout_switch", identifier: data.paymentId, maxAttempts: 6, windowSeconds: 900, blockSeconds: 900 });
    if (!limit.allowed) throw new Error("Muitas alterações seguidas. Aguarde alguns minutos.");
    const { data: payment } = await admin.from("payments").select("id").eq("id", data.paymentId).eq("tenant_id", link.tenant_id).eq("charge_group_id", link.charge_group_id!).maybeSingle();
    if (!payment) throw new Error("Pagamento indisponível.");
    if (!(await (await import("./activation.server")).canReceivePayments(admin, link.tenant_id))) throw new Error("Pagamento temporariamente indisponível.");
    const { switchPaymentAttempt } = await import("./payment-attempts.server");
    try {
      await switchPaymentAttempt(admin, {
        tenantId: link.tenant_id, paymentId: payment.id, method: data.method,
        reason: data.regularize ? "regularization" : "method_change", actor: "customer", idempotencyKey: data.idempotencyKey,
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Não foi possível alterar agora.");
    }
    return { ok: true };
  });

const GENERIC_COUPON_ERROR = "Cupom inválido ou indisponível.";

async function couponContext(admin: AdminClient, token: string, paymentId: string) {
  const resolved = await resolveLink(admin, token);
  if (resolved.state !== "ok") throw new Error("Link indisponível.");
  const { link } = resolved;
  // A empresa e o cliente vêm do link e da cobrança; nada enviado pelo navegador é usado como autoridade.
  const { data: payment } = await admin.from("payments").select("id, tenant_id, customer_id, method, status, provider_installment_id, subscription_id, provider_payment_id").eq("id", paymentId).eq("tenant_id", link.tenant_id).eq("charge_group_id", link.charge_group_id!).maybeSingle();
  if (!payment) throw new Error("Pagamento indisponível.");
  const { canSwitch } = await import("./payment-attempts.server");
  if (!canSwitch(payment as never) || !payment.method || !["pix", "boleto", "credit_card"].includes(payment.method)) throw new Error("Cupons não estão disponíveis para esta cobrança.");
  return { link, payment: payment as typeof payment & { method: "pix" | "boleto" | "credit_card" } };
}

async function couponEvent(admin: AdminClient, e: { tenantId: string; couponId?: string | null; paymentId?: string; event: string; metadata?: Record<string, unknown> }) {
  await admin.from("coupon_events").insert({ tenant_id: e.tenantId, coupon_id: e.couponId ?? null, payment_id: e.paymentId ?? null, event: e.event, metadata: (e.metadata ?? {}) as never });
}

const couponSchema = z.object({
  token: tokenSchema,
  paymentId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  idempotencyKey: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
});

/** Aplica um cupom da própria empresa do link. Reserva o uso; o consumo só ocorre com o pagamento confirmado. */
export const applyCheckoutCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => couponSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit, requestInfo } = await import("./audit.server");
    const { tokenFingerprint } = await import("./crypto.server");
    const ip = requestInfo().ip ?? "unknown";
    const [byIp, byLink] = await Promise.all([
      consumeRateLimit(admin, { scope: "coupon_ip", identifier: ip, maxAttempts: 15, windowSeconds: 900, blockSeconds: 1800 }),
      consumeRateLimit(admin, { scope: "coupon_link", identifier: tokenFingerprint(data.token), maxAttempts: 8, windowSeconds: 900, blockSeconds: 1800 }),
    ]);
    const { link, payment } = await couponContext(admin, data.token, data.paymentId);
    if (!byIp.allowed || !byLink.allowed) {
      await couponEvent(admin, { tenantId: link.tenant_id, paymentId: payment.id, event: "rate_limited", metadata: { ip_hash: tokenFingerprint(ip).slice(0, 16) } });
      throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    }
    const { normalizeCouponCode, COUPON_CODE_RE } = await import("./coupon-math");
    const code = normalizeCouponCode(data.code);
    if (!COUPON_CODE_RE.test(code)) {
      await couponEvent(admin, { tenantId: link.tenant_id, paymentId: payment.id, event: "rejected" });
      throw new Error(GENERIC_COUPON_ERROR);
    }
    if (!(await (await import("./activation.server")).canReceivePayments(admin, link.tenant_id))) throw new Error("Pagamento temporariamente indisponível.");
    const { quote, loadPayment, switchPaymentAttempt } = await import("./payment-attempts.server");
    const full = await loadPayment(admin, link.tenant_id, payment.id);
    if (!full) throw new Error("Pagamento indisponível.");
    const base = quote(full).base;
    const { data: rows, error } = await admin.rpc("reserve_coupon", {
      _tenant_id: link.tenant_id, _code: code, _payment_id: payment.id, _customer_id: (payment.customer_id ?? null) as string, _base: base, _key: data.idempotencyKey,
    });
    const r = rows?.[0];
    if (error || !r || r.error || !r.redemption_id) {
      await couponEvent(admin, { tenantId: link.tenant_id, couponId: r?.coupon_id ?? null, paymentId: payment.id, event: "rejected", metadata: { reason: r?.error ?? "error" } });
      throw new Error(r?.error === "already_applied" ? "Já existe um cupom aplicado nesta cobrança." : GENERIC_COUPON_ERROR);
    }
    try {
      await switchPaymentAttempt(admin, { tenantId: link.tenant_id, paymentId: payment.id, method: payment.method, reason: "coupon", actor: "customer", idempotencyKey: data.idempotencyKey, keySuffix: `c${r.redemption_id.slice(0, 8)}` });
    } catch (e) {
      await admin.rpc("release_coupon", { _payment_id: payment.id });
      await couponEvent(admin, { tenantId: link.tenant_id, couponId: r.coupon_id, paymentId: payment.id, event: "apply_failed" });
      throw new Error(e instanceof Error ? e.message : "Não foi possível aplicar o cupom agora.");
    }
    await couponEvent(admin, { tenantId: link.tenant_id, couponId: r.coupon_id, paymentId: payment.id, event: "applied", metadata: { discount: Number(r.discount) } });
    await trackEvent(admin, link, "coupon_applied", { discount: Number(r.discount) });
    return { ok: true, discount: Number(r.discount) };
  });

/** Remove o cupom ainda não pago e volta a cobrança ao valor cheio. */
export const removeCheckoutCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => couponSchema.omit({ code: true }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit } = await import("./audit.server");
    const limit = await consumeRateLimit(admin, { scope: "checkout_switch", identifier: data.paymentId, maxAttempts: 6, windowSeconds: 900, blockSeconds: 900 });
    if (!limit.allowed) throw new Error("Muitas alterações seguidas. Aguarde alguns minutos.");
    const { link, payment } = await couponContext(admin, data.token, data.paymentId);
    const { activeCouponDiscount, switchPaymentAttempt } = await import("./payment-attempts.server");
    const active = await activeCouponDiscount(admin, payment.id);
    if (!active) return { ok: true };
    await admin.rpc("release_coupon", { _payment_id: payment.id });
    try {
      await switchPaymentAttempt(admin, { tenantId: link.tenant_id, paymentId: payment.id, method: payment.method, reason: "coupon", actor: "customer", idempotencyKey: data.idempotencyKey, keySuffix: `r${active.id.slice(0, 8)}` });
    } catch (e) {
      // Sem nova tentativa, a cobrança segue com desconto: restaura a reserva para manter o registro coerente.
      await admin.from("coupon_redemptions").update({ status: "reserved", released_at: null }).eq("id", active.id);
      throw new Error(e instanceof Error ? e.message : "Não foi possível remover o cupom agora.");
    }
    await couponEvent(admin, { tenantId: link.tenant_id, couponId: active.couponId, paymentId: payment.id, event: "removed" });
    return { ok: true };
  });

const checkoutSignatureSchema = z.object({
  token: tokenSchema,
  signerName: z.string().trim().min(3, "Informe o nome completo de quem assina.").max(160),
  signerDocument: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 11 || value.length === 14, "Informe um CPF ou CNPJ válido."),
  signature: z.unknown(),
});

/** Assina o contrato vinculado ao link de pagamento, sem liberar acesso a outros contratos. */
export const signCheckoutContract = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => checkoutSignatureSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok" || !resolved.link.contract_id || !resolved.link.customer_id) throw new Error("Contrato indisponível.");
    const { link } = resolved;
    const linkedContractId = link.contract_id as string;
    const linkedCustomerId = link.customer_id as string;
    const { data: contract } = await admin
      .from("contracts")
      .select("id, status, current_version, customer_id, customers(document)")
      .eq("id", linkedContractId)
      .eq("tenant_id", link.tenant_id)
      .eq("customer_id", linkedCustomerId)
      .maybeSingle();
    if (!contract || ["cancelled", "expired"].includes(contract.status)) throw new Error("Contrato indisponível.");
    const registered = ((contract.customers as { document?: string | null } | null)?.document ?? "").replace(/\D/g, "");
    if (registered && registered !== data.signerDocument) throw new Error("O documento informado não confere com o cadastro deste contrato.");
    const { data: version } = await admin
      .from("contract_versions")
      .select("id, content_hash")
      .eq("contract_id", contract.id)
      .eq("version", contract.current_version)
      .maybeSingle();
    if (!version) throw new Error("Versão do contrato não encontrada.");
    const { parseSignatureInput, signatureColumns, recomputeContractStatus } = await import("./contract-docs.server");
    const { requestInfo, logAudit } = await import("./audit.server");
    const { contractEvent } = await import("./contracts.functions");
    const { ip, userAgent } = requestInfo();
    const { error } = await admin.from("contract_signatures").upsert({
      tenant_id: link.tenant_id,
      contract_id: contract.id,
      contract_version_id: version.id,
      content_hash: version.content_hash,
      signer_role: "customer",
      signer_name: data.signerName,
      signer_document: data.signerDocument,
      ...signatureColumns(parseSignatureInput(data.signature)),
      ip_address: ip,
      user_agent: userAgent,
    }, { onConflict: "contract_version_id,signer_role" });
    if (error) throw new Error("Não foi possível registrar a assinatura.");
    const { fullySigned, status } = await recomputeContractStatus(admin, contract.id, version.id);
    await contractEvent(admin, link.tenant_id, contract.id, "signed_customer", data.signerName, { source: "checkout" }, ip);
    if (fullySigned) await contractEvent(admin, link.tenant_id, contract.id, "completed", null);
    await logAudit(admin, { tenantId: link.tenant_id, action: "contract.signed_by_customer", resource: "contracts", resourceId: contract.id, metadata: { version: contract.current_version, source: "checkout" } });
    await trackEvent(admin, link, "contract_signed", { version: contract.current_version });
    return { status };
  });

export const getPaymentInstructions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tokenSchema, paymentId: z.string().uuid(), kind: z.enum(["pix", "boleto"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") throw new Error("Link indisponível.");
    if (await (await import("./coproduction.server")).coproductionBlocksCheckout(admin, resolved.link.charge_group_id!)) throw new Error("Pagamento disponível em breve.");
    if (resolved.linkExpired) throw new Error("Cobrança expirada. Use “Regularizar cobrança” para continuar.");
    const { link } = resolved;
    const { data: payment } = await admin
      .from("payments")
      .select("id, provider_payment_id, status, charge_group_id, tenant_id")
      .eq("id", data.paymentId)
      .eq("tenant_id", link.tenant_id)
      .eq("charge_group_id", link.charge_group_id!)
      .maybeSingle();
    if (!payment?.provider_payment_id) throw new Error("Pagamento indisponível.");
    if (!["awaiting_payment", "overdue", "created"].includes(payment.status)) throw new Error("Este pagamento não está em aberto.");

    const { getPaymentProvider } = await import("./financial-origin.server");
    const conn = await getPaymentProvider(admin, link.tenant_id, payment.id);
    if (!conn) throw new Error("Pagamento temporariamente indisponível.");
    if (!(await (await import("./activation.server")).canReceivePayments(admin, link.tenant_id))) throw new Error("Pagamento temporariamente indisponível.");

    // Em atraso: atualiza o valor do dia (multa + juros) antes de gerar o Pix/boleto.
    const { ensureLateValueToday } = await import("./payment-attempts.server");
    if (await ensureLateValueToday(admin, link.tenant_id, payment.id, data.kind)) {
      const { data: fresh } = await admin.from("payments").select("provider_payment_id").eq("id", payment.id).eq("tenant_id", link.tenant_id).maybeSingle();
      if (fresh?.provider_payment_id) payment.provider_payment_id = fresh.provider_payment_id;
    }

    if (data.kind === "pix") {
      const pix = await conn.provider.getPixQrCode(payment.provider_payment_id);
      return { kind: "pix" as const, image: pix.encodedImage, code: pix.payload, expiresAt: pix.expirationDate ?? null };
    }
    const line = await conn.provider.getBoletoLine(payment.provider_payment_id);
    return { kind: "boleto" as const, code: line.identificationField };
  });

const customerDataSchema = z.object({
  token: tokenSchema,
  email: z.string().trim().email("E-mail inválido").max(160),
  phone: z.string().regex(/^\d{10,11}$/, "Telefone com DDD, só números"),
  zipCode: z.string().regex(/^\d{8}$/, "CEP com 8 dígitos"),
  address: z.string().trim().min(3).max(160),
  addressNumber: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional().or(z.literal("")),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().regex(/^[A-Za-z]{2}$/, "UF com 2 letras"),
});

/** O cliente confirma/completa seus dados de contato e endereço pelo link. Nome e CPF/CNPJ não podem ser alterados. */
export const updateCheckoutCustomer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => customerDataSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok" || !resolved.link.customer_id) throw new Error("Link indisponível.");
    const { link } = resolved;
    const fields = {
      email: data.email.toLowerCase(),
      phone: data.phone,
      zip_code: data.zipCode,
      address: data.address,
      address_number: data.addressNumber,
      complement: data.complement || null,
      district: data.district,
      city: data.city,
      state: data.state.toUpperCase(),
      data_status: "submitted",
      data_submitted_at: new Date().toISOString(),
    };
    const { data: customer, error } = await admin
      .from("customers")
      .update(fields)
      .eq("id", link.customer_id!)
      .eq("tenant_id", link.tenant_id)
      .select("provider_customer_id")
      .single();
    if (error) throw new Error("Não foi possível salvar seus dados.");
    if (customer.provider_customer_id) {
      const { getTenantProvider } = await import("./billing.server");
      const conn = await getTenantProvider(admin, link.tenant_id);
      await conn?.provider
        .updateCustomer(customer.provider_customer_id, {
          email: fields.email,
          mobilePhone: fields.phone,
          postalCode: fields.zip_code,
          address: fields.address,
          addressNumber: fields.address_number,
          complement: fields.complement ?? undefined,
          province: fields.district,
        })
        .catch(() => undefined);
    }
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, {
      tenantId: link.tenant_id,
      action: "checkout.customer_update",
      resource: "customer",
      resourceId: link.customer_id,
    });
    await trackEvent(admin, link, "data_confirmed", { termsAccepted: true });
    return { ok: true };
  });

function luhnOk(n: string) {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const cardSchema = z.object({
  token: tokenSchema,
  paymentId: z.string().uuid(),
  holderName: z.string().trim().min(3, "Informe o nome impresso no cartão.").max(100),
  number: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length >= 13 && v.length <= 19 && luhnOk(v), "Número do cartão inválido."),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mês inválido."),
  expiryYear: z.string().regex(/^\d{4}$/, "Ano inválido."),
  ccv: z.string().regex(/^\d{3,4}$/, "Código de segurança inválido."),
  holderDocument: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v === "" || v.length === 11 || v.length === 14, "CPF ou CNPJ do titular inválido."),
  // Token Turnstile: opcional no formato para devolver mensagem clara; o servidor exige e valida.
  turnstileToken: z.string().max(2048).optional(),
  // Dados do dispositivo exigidos pelo fluxo 3DS oficial (fuso em horas, conforme a documentação).
  deviceInfo: z.object({
    colorDepth: z.number().int().min(1).max(48),
    screenHeight: z.number().int().min(1).max(10000),
    screenWidth: z.number().int().min(1).max(10000),
    timezoneHours: z.number().min(-14).max(14),
    language: z.string().min(2).max(35),
    userAgent: z.string().min(1).max(500),
  }).optional(),
});

/**
 * Pagamento com cartão dentro do checkout da WiizePay.
 * Os dados do cartão são repassados direto ao processador e nunca são gravados nem registrados em log.
 */
/** Chave pública do widget Turnstile (site key é pública por definição). */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async () => ({ siteKey: process.env["TURNSTILE_SITE_KEY"] ?? null }));

export const payCheckoutWithCard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => cardSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") throw new Error("Link indisponível.");
    if (await (await import("./coproduction.server")).coproductionBlocksCheckout(admin, resolved.link.charge_group_id!)) throw new Error("Pagamento disponível em breve.");
    const { link } = resolved;
    const { consumeRateLimit, requestInfo, logAudit } = await import("./audit.server");
    // Limites somados: por cobrança, por link e por IP confiável. Criar outra cobrança
    // não zera o contador do mesmo visitante nem do mesmo link.
    const { tokenFingerprint: cardFp } = await import("./crypto.server");
    const cardIp = requestInfo().ip;
    const { cardFingerprint } = await import("./audit.server");
    const cardMark = await cardFingerprint(data.number);
    const cardLimits = await Promise.all([
      consumeRateLimit(admin, { scope: "checkout_card", identifier: data.paymentId, maxAttempts: 5, windowSeconds: 900, blockSeconds: 1800 }),
      consumeRateLimit(admin, { scope: "checkout_card_link", identifier: cardFp(data.token), maxAttempts: 8, windowSeconds: 3600, blockSeconds: 3600 }),
      cardIp
        ? consumeRateLimit(admin, { scope: "checkout_card_ip", identifier: cardIp, maxAttempts: 10, windowSeconds: 3600, blockSeconds: 3600 })
        : Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
      // Mesmo cartão testado em várias cobranças/links.
      cardMark
        ? consumeRateLimit(admin, { scope: "checkout_card_instrument", identifier: cardMark, maxAttempts: 6, windowSeconds: 3600, blockSeconds: 3600 })
        : Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
    ]);
    if (!cardIp) await logAudit(admin, { tenantId: link.tenant_id, action: "checkout.card_ip_unavailable", resource: "payments", resourceId: data.paymentId, metadata: {} });
    const limit = { allowed: cardLimits.every((l) => l.allowed) };
    if (!limit.allowed) throw new Error("Muitas tentativas com cartão. Aguarde alguns minutos ou escolha outra forma de pagamento.");
    // Verificação anti-robô no servidor (Cloudflare Siteverify), antes de qualquer contato com o processador.
    await (await import("./turnstile.server")).requireTurnstile(admin, { token: data.turnstileToken, remoteIp: cardIp, tenantId: link.tenant_id, paymentId: data.paymentId });
    // Regras de comportamento suspeito (vários cartões, links, recusas), antes do processador.
    const { recordCardRisk } = await import("./card-risk.server");
    const riskBase = { tenantId: link.tenant_id, paymentId: data.paymentId, ip: cardIp, cardMark, linkMark: cardFp(data.token).slice(0, 40) };
    const risk = await recordCardRisk(admin, { ...riskBase, outcome: "attempt" });
    if (risk.block) throw new Error("Não foi possível processar o cartão agora. Tente mais tarde ou escolha outra forma de pagamento.");

    const now = new Date();
    const exp = new Date(Number(data.expiryYear), Number(data.expiryMonth), 1);
    if (exp <= now) throw new Error("Cartão vencido.");

    const { data: payment } = await admin
      .from("payments")
      .select("id, provider_payment_id, status, method, installment_count, subscription_id")
      .eq("id", data.paymentId).eq("tenant_id", link.tenant_id).eq("charge_group_id", link.charge_group_id!)
      .maybeSingle();
    if (!payment?.provider_payment_id) throw new Error("Pagamento indisponível.");
    if (!["awaiting_payment", "overdue", "created"].includes(payment.status)) throw new Error("Este pagamento não está em aberto.");
    if (payment.method && payment.method !== "credit_card") throw new Error("Esta cobrança não aceita cartão. Altere a forma de pagamento.");
    if (resolved.linkExpired) throw new Error("Cobrança expirada.");

    const { data: customer } = link.customer_id
      ? await admin.from("customers").select("name, email, document, phone, zip_code, address_number").eq("id", link.customer_id).maybeSingle()
      : { data: null };
    if (!customer?.email || !customer.phone || !customer.zip_code || !customer.address_number) {
      throw new Error("Complete seus dados (e-mail, celular, CEP e número) antes de pagar com cartão.");
    }
    const holderDoc = data.holderDocument || (customer.document ?? "").replace(/\D/g, "");
    if (!holderDoc) throw new Error("Informe o CPF ou CNPJ do titular do cartão.");

    const { getPaymentProvider } = await import("./financial-origin.server");
    const conn = await getPaymentProvider(admin, link.tenant_id, payment.id);
    if (!conn) throw new Error("Pagamento temporariamente indisponível.");
    if (!(await (await import("./activation.server")).canReceivePayments(admin, link.tenant_id))) throw new Error("Pagamento temporariamente indisponível.");

    const { ensureLateValueToday } = await import("./payment-attempts.server");
    if (await ensureLateValueToday(admin, link.tenant_id, payment.id, "credit_card")) {
      const { data: fresh } = await admin.from("payments").select("provider_payment_id").eq("id", payment.id).eq("tenant_id", link.tenant_id).maybeSingle();
      if (fresh?.provider_payment_id) payment.provider_payment_id = fresh.provider_payment_id;
    }

    const threeDs = await (await import("./threeds.server")).checkoutThreeDsAllowed(admin);
    const body: Record<string, unknown> = {
      creditCard: { holderName: data.holderName, number: data.number, expiryMonth: data.expiryMonth, expiryYear: data.expiryYear, ccv: data.ccv },
      creditCardHolderInfo: {
        name: data.holderName, email: customer.email, cpfCnpj: holderDoc,
        postalCode: customer.zip_code, addressNumber: customer.address_number, phone: customer.phone,
      },
      remoteIp: requestInfo().ip ?? undefined,
    };
    if (threeDs) {
      // URL oficial de retorno do desafio: volta para o próprio link de pagamento.
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const { safeOrigin } = await import("./contract-docs.server");
      const origin = safeOrigin(getRequestHeader("origin") ?? undefined);
      body["threeDSecure"] = { callbackUrl: `${origin}/pagar/${data.token}?verificacao-cartao=retorno` };
      const device = data["deviceInfo"];
      if (device) {
        body["deviceInfo"] = {
          colorDepth: device.colorDepth,
          screenHeight: device.screenHeight,
          screenWidth: device.screenWidth,
          timeZoneOffset: device.timezoneHours,
          language: device.language,
          userAgent: device.userAgent,
          remoteIp: requestInfo().ip ?? undefined,
        };
      }
    }

    let status = "PENDING";
    let challengeUrl: string | null = null;
    try {
      const res = await conn.provider.payWithCreditCard(payment.provider_payment_id, body);
      status = res.status ?? status;
      if (threeDs) {
        // Resposta oficial: URL do desafio preenchida (banco exige verificação) ou nula (sem desafio).
        challengeUrl = typeof res.threeDSecureChallengeUrl === "string" && res.threeDSecureChallengeUrl ? res.threeDSecureChallengeUrl : null;
      }
    } catch (e) {
      // Resposta inconclusiva (ex.: timeout): consulta o estado real da cobrança antes de
      // deixar o cliente tentar de novo, para não cobrar duas vezes.
      let providerStatus: string | null = null;
      try {
        const current = await conn.provider.getPayment(payment.provider_payment_id);
        const consultedStatus = (current as { status?: string }).status;
        providerStatus = typeof consultedStatus === "string" ? consultedStatus : null;
      } catch { /* sem consulta, segue com a recusa genérica */ }
      await trackEvent(admin, link, "card_declined");
      await recordCardRisk(admin, { ...riskBase, outcome: "declined" }).catch(() => undefined);
      await logAudit(admin, { tenantId: link.tenant_id, action: "checkout.card_declined", resource: "payments", resourceId: payment.id, metadata: { last4: data.number.slice(-4), providerStatus } });
      if (providerStatus && !["PENDING", "AWAITING_RISK_ANALYSIS"].includes(providerStatus)) {
        throw new Error("Não foi possível confirmar a resposta da operadora. Aguarde a atualização desta página antes de tentar novamente.");
      }
      throw new Error(e instanceof Error ? e.message : "Cartão recusado. Confira os dados ou tente outro cartão.");
    }

    if (threeDs) {
      const { data: attempt } = await admin.from("payment_attempts").select("id").eq("tenant_id", link.tenant_id).eq("payment_id", payment.id).eq("status", "active").maybeSingle();
      const { recordAuthStart, modalityForPayment } = await import("./threeds.server");
      await recordAuthStart(admin, {
        tenantId: link.tenant_id,
        paymentId: payment.id,
        paymentAttemptId: attempt?.id ?? null,
        connectionId: conn.connection.id,
        providerPaymentId: payment.provider_payment_id,
        modality: modalityForPayment(payment),
        authResult: challengeUrl ? "issuer_challenge" : "frictionless",
        correlationId: crypto.randomUUID(),
      });
    }
    await trackEvent(admin, link, "payment_submitted", { method: "credit_card", ...(challengeUrl ? { threeDs: "challenge" } : {}) });
    await logAudit(admin, { tenantId: link.tenant_id, action: "checkout.card_submitted", resource: "payments", resourceId: payment.id, metadata: { last4: data.number.slice(-4), providerStatus: status, threeDs: threeDs ? (challengeUrl ? "challenge" : "frictionless") : "off" } });
    // O status da cobrança só muda pela confirmação do processador (webhook). Com desafio
    // 3DS pendente, o pagamento NUNCA é apresentado como aprovado.
    return { status, approved: !challengeUrl && ["CONFIRMED", "RECEIVED"].includes(status), challengeUrl };
  });

/** O cliente voltou do desafio 3DS do banco. O retorno não confirma o pagamento; só o webhook confirma. */
export const notifyCheckout3dsReturn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema, paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") return { ok: false };
    const { link } = resolved;
    const { data: payment } = await admin
      .from("payments")
      .select("id")
      .eq("id", data.paymentId).eq("tenant_id", link.tenant_id).eq("charge_group_id", link.charge_group_id!)
      .maybeSingle();
    if (!payment) return { ok: false };
    const { markAuthReturned } = await import("./threeds.server");
    await markAuthReturned(admin, { tenantId: link.tenant_id, paymentId: payment.id });
    await trackEvent(admin, link, "card_3ds_returned");
    return { ok: true };
  });

/** PDF do contrato vinculado ao link (somente leitura), para o cliente ler antes de assinar. */
export const getCheckoutContractPdf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok" || !resolved.link.contract_id || !resolved.link.customer_id) throw new Error("Contrato indisponível.");
    const { link } = resolved;
    const { data: contract } = await admin.from("contracts").select("id, status").eq("id", link.contract_id as string).eq("tenant_id", link.tenant_id).eq("customer_id", link.customer_id as string).maybeSingle();
    if (!contract || ["cancelled", "expired"].includes(contract.status)) throw new Error("Contrato indisponível.");
    const { contractPdf, safeOrigin } = await import("./contract-docs.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const pdf = await contractPdf(admin, contract.id, safeOrigin(getRequestHeader("origin") ?? undefined));
    return { base64: Buffer.from(pdf.bytes).toString("base64"), fileName: pdf.fileName };
  });

/** Recibo em PDF de um pagamento confirmado, gerado na hora. Só para pagamentos pagos deste link. */
export const getCheckoutReceipt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema, paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const resolved = await resolveLink(admin, data.token);
    if (resolved.state !== "ok") throw new Error("Recibo indisponível.");
    const { link } = resolved;
    const { paymentReceipt } = await import("./receipt.server");
    return paymentReceipt(admin, { tenantId: link.tenant_id, paymentId: data.paymentId, chargeGroupId: link.charge_group_id!, fallbackCustomerId: link.customer_id, fallbackServiceId: link.service_id });
  });
