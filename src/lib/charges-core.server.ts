import { logAudit } from "./audit.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
const FINANCE = ["owner", "admin", "finance"];
const round2 = (n: number) => Math.round(n * 100) / 100;
const centsToAmount = (cents: number) => cents / 100;

function wiizePaySplit(totalFeeCents: number, walletId: string, mode: "single" | "installment" = "single") {
  if (totalFeeCents <= 0) return undefined;
  const field = mode === "installment" ? "totalFixedValue" : "fixedValue";
  return [{ walletId, [field]: centsToAmount(totalFeeCents) }];
}

/** Custo do Asaas desta cobrança à vista, lido da API da própria conta; null = usa o fluxo antigo. */
async function providerCoverCents(provider: { getMyFees?: () => Promise<Record<string, unknown>> }, method: string | null, amount: number, totalFeeCents: number) {
  try {
    const { estimateProviderFeeCents, coveredProviderFeeCents } = await import("./provider-fee-quote");
    const fees = provider.getMyFees ? await provider.getMyFees() : null;
    return coveredProviderFeeCents(totalFeeCents, estimateProviderFeeCents(fees as never, method, Math.round(amount * 100)));
  } catch { return 0; }
}

function todayBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const toBillingType = { undefined: "UNDEFINED", pix: "PIX", boleto: "BOLETO", credit_card: "CREDIT_CARD", debit_card: "DEBIT_CARD" } as const;

export type ChargeCoreInput = {
  serviceCheckoutVersionId?: string;
  customerId: string; serviceId: string; contractId?: string | null | undefined; dueOn?: string | null | undefined;
  method: "undefined" | "pix" | "boleto" | "credit_card" | "debit_card"; idempotencyKey: string; linkDays: number;
  linkMinutes?: number | undefined; collectCustomerData: boolean; feePassShare: number; customAmount?: number | null | undefined;
  dunningPlan?: "essential" | "smart" | "intensive" | null | undefined;
  installmentCount?: number | null | undefined;
  /** Só o checkout aberto: serviço parcelado pago à vista. */
  payInFull?: boolean | undefined;
  chargeType?: "one_time" | "installment" | "recurring" | null | undefined;
  frequency?: "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly" | null | undefined;
  coproducers?: import("./coproduction.server").CoproducerInput[] | null | undefined;
};

export async function issueLink(
  admin: Admin,
  input: { tenantId: string; chargeGroupId: string; customerId: string | null; serviceId: string | null; contractId: string | null; userId: string; days: number; minutes?: number | undefined; collectCustomerData?: boolean },
) {
  const { randomToken, tokenFingerprint, encryptSecret } = await import("./crypto.server");
  const now = new Date().toISOString();
  await admin
    .from("payment_links")
    .update({ revoked_at: now })
    .eq("tenant_id", input.tenantId)
    .eq("charge_group_id", input.chargeGroupId)
    .is("revoked_at", null);
  const token = randomToken(32);
  const hash = tokenFingerprint(token);
  const { data, error } = await admin
    .from("payment_links")
    .insert({
      tenant_id: input.tenantId,
      charge_group_id: input.chargeGroupId,
      customer_id: input.customerId,
      service_id: input.serviceId,
      contract_id: input.contractId,
      token_hash: hash,
      // Guardado criptografado para o prestador copiar o mesmo link sempre que precisar.
      token_ciphertext: encryptSecret(token),
      slug: hash.slice(0, 16),
      // Link permanente: usado para pagar, acompanhar e regularizar a cobrança.
      expires_at: input.minutes ? new Date(Date.now() + input.minutes * 60 * 1000).toISOString() : null,
      created_by: input.userId,
      collect_customer_data: input.collectCustomerData ?? false,
    })
    .select("id, expires_at")
    .single();
  if (error) throw new Error("Não foi possível gerar o link.");
  return { token, linkId: data.id, expiresAt: data.expires_at };
}

/** Núcleo único de criação de cobrança (tela interna e API do Wiize usam o mesmo caminho). */
export async function createChargeCore(tenantId: string, userId: string, origin: string | null, data: ChargeCoreInput) {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider, computePlatformFeeDetails } = await import("./billing.server");
    const { frequencyToCycle, billingTypeToMethod } = await import("./asaas.server");
    const { ASAAS_DEFAULT_LATE_FEES } = await import("./late-fees");
    const { onlyDigits } = await import("./format");
    const masterWalletId = process.env['ASAAS_MASTER_WALLET_ID'];
    if (!masterWalletId) throw new Error("A carteira principal da Wiize Core ainda não foi configurada.");

    // Idempotência: mesma chave devolve a mesma cobrança.
    const { data: existing } = await admin
      .from("payments")
      .select("charge_group_id")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) {
      const link = await issueLink(admin, { tenantId, chargeGroupId: existing.charge_group_id, customerId: data.customerId, serviceId: data.serviceId, contractId: data.contractId ?? null, userId: userId, days: data.linkDays, minutes: data.linkMinutes, collectCustomerData: data.collectCustomerData });
      return { chargeGroupId: existing.charge_group_id, token: link.token };
    }

    const conn = await getTenantProvider(admin, tenantId);
    await (await import("./activation.server")).assertCanReceivePayments(admin, tenantId);
    if (!conn) throw new Error("Ative sua conta de pagamentos em Configurações antes de criar cobranças.");
    {
      const { ensureTenantWebhook } = await import("./webhook-setup.server");
      await ensureTenantWebhook(admin, tenantId, origin, userId);
    }

    const [{ data: customer }, { data: service }] = await Promise.all([
      admin.from("customers").select("*").eq("id", data.customerId).eq("tenant_id", tenantId).maybeSingle(),
      admin.from("services").select("*").eq("id", data.serviceId).eq("tenant_id", tenantId).eq("active", true).maybeSingle(),
    ]);
    if (!customer) throw new Error("Cliente não encontrado.");
    if (!service) throw new Error("Serviço não encontrado ou inativo.");
    // Trusted conditions: loaded only from the immutable, tenant-scoped issued link.
    if (data.serviceCheckoutVersionId) {
      const { data: v } = await admin.from("service_checkout_versions").select("*").eq("id", data.serviceCheckoutVersionId).eq("tenant_id", tenantId).eq("service_id", service.id).maybeSingle();
      if (!v) throw new Error("Condições do link inválidas.");
      const { data: link } = await admin.from("service_checkout_links").select("active").eq("id", v.link_id).eq("tenant_id", tenantId).maybeSingle();
      if (!link?.active) throw new Error("Link desativado.");
      const { isValidChoice } = await import("./service-checkout-rules");
      const methods = v.accepted_methods;
      if (!isValidChoice(v.charge_type as "one_time" | "installment" | "recurring", methods, data.method, data.installmentCount ?? 1, v.max_installments)) throw new Error("Forma de pagamento indisponível para este serviço.");
      Object.assign(service, { name: v.service_name, description: v.description, amount: v.amount, type: v.charge_type, accepted_methods: methods, custom_amount: false, flexible_type: false, frequency: v.frequency, cycles: v.cycles, due_days: v.due_days });
    }
    // Serviço com forma personalizada: o tipo vem desta cobrança.
    if ((service as { flexible_type?: boolean }).flexible_type) {
      if (!data.chargeType) throw new Error("Escolha se esta cobrança é à vista, parcelada ou recorrente.");
      const sv = service as { type: string; frequency: string | null; installments: number | null; cycles: number | null };
      sv.type = data.chargeType;
      sv.frequency = data.chargeType === "recurring" ? (data.frequency ?? sv.frequency ?? "monthly") : null;
      if (data.chargeType === "installment") { if (!data.installmentCount) throw new Error("Informe o número de parcelas."); sv.installments = data.installmentCount; }
      else sv.installments = null;
      if (data.chargeType !== "recurring") sv.cycles = null;
    }
    // Checkout aberto: serviço parcelado pago à vista vira cobrança única.
    if (service.type === "installment" && data.payInFull) { const sv = service as { type: string; installments: number | null }; sv.type = "one_time"; sv.installments = null; }
    // Número de parcelas escolhido na cobrança (limitado a 2–21); sem escolha, vale o do serviço.
    if (service.type === "installment" && data.installmentCount) (service as { installments: number | null }).installments = Math.min(21, Math.max(2, Math.floor(data.installmentCount)));
    if (!customer.document) throw new Error("Cadastre o CPF/CNPJ do cliente antes de cobrar.");
    const serviceAmount = service.custom_amount ? Math.round(Number(data.customAmount ?? 0) * 100) / 100 : Number(service.amount);
    if (service.custom_amount && !(serviceAmount > 0)) throw new Error("Informe o valor desta cobrança.");
    if (!(serviceAmount > 0)) throw new Error("O serviço precisa ter valor maior que zero.");
    let amount = serviceAmount;
    if (data.feePassShare > 0) {
      if (data.method === "undefined") throw new Error("Para repassar a taxa, escolha a forma de pagamento.");
      const { grossUp, fixedFeeCount } = await import("./fee-math");
      const n = service.type === "installment" ? Number(service.installments ?? 2) : 1;
      const probe = await computePlatformFeeDetails(admin, 100, data.method, data.method === "credit_card" ? n : 1, service.type === "recurring", service.type === "one_time" ? tenantId : undefined);
      amount = grossUp(serviceAmount, { fixed: probe.fixedFee, percent: probe.percentageFee }, data.feePassShare, fixedFeeCount(data.method, n)).total;
    }
    const serviceRatio = serviceAmount / amount;

    if (data.method === "debit_card") throw new Error("Débito em conta não está disponível para novas cobranças.");
    if (data.method !== "undefined" && !service.accepted_methods.includes(data.method)) {
      throw new Error("Forma de pagamento não aceita por este serviço.");
    }
    if (service.type === "installment" && data.method === "undefined") {
      throw new Error("Para parcelamento, escolha Pix, boleto ou cartão.");
    }

    let contractId: string | null = null;
    if (data.contractId) {
      const { data: contract } = await admin
        .from("contracts")
        .select("id, customer_id, status")
        .eq("id", data.contractId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!contract || contract.customer_id !== customer.id) throw new Error("Contrato inválido para este cliente.");
      if (contract.status === "cancelled" || contract.status === "expired") throw new Error("Contrato cancelado ou expirado.");
      contractId = contract.id;
    }

    const today = todayBR();
    const dueOn =
      data.dueOn ?? new Date(Date.now() + (service.due_days ?? 5) * 86400 * 1000).toISOString().slice(0, 10);
    if (dueOn < today) throw new Error("O vencimento não pode estar no passado.");

    // Cliente no provedor (criado sob demanda).
    const { data: customerLink, error: linkError } = await admin.from("customer_provider_links")
      .select("provider_customer_id").eq("tenant_id", tenantId).eq("customer_id", customer.id)
      .eq("provider_connection_id", conn.connection.id).maybeSingle();
    if (linkError) throw new Error("Não foi possível conferir o cliente na conta de pagamentos.");
    let providerCustomerId = customerLink?.provider_customer_id ?? null;
    if (!providerCustomerId) {
      const created = await conn.provider.createCustomer({
        name: customer.name,
        cpfCnpj: onlyDigits(customer.document),
        email: customer.email ?? undefined,
        mobilePhone: customer.phone ? onlyDigits(customer.phone) : undefined,
        postalCode: customer.zip_code ? onlyDigits(customer.zip_code) : undefined,
        address: customer.address ?? undefined,
        addressNumber: customer.address_number ?? undefined,
        complement: customer.complement ?? undefined,
        province: customer.district ?? undefined,
        externalReference: customer.id,
        notificationDisabled: true,
      });
      providerCustomerId = created.id;
      const { error: saveLinkError } = await admin.from("customer_provider_links").insert({
        tenant_id: tenantId, customer_id: customer.id, provider_connection_id: conn.connection.id, provider_customer_id: created.id,
      });
      if (saveLinkError) throw new Error("Não foi possível registrar o cliente na conta de pagamentos.");
      await admin.from("customers").update({ provider_customer_id: created.id }).eq("id", customer.id).eq("tenant_id", tenantId);
    }

    const method = data.method === "undefined" ? null : data.method;
    const billingType = toBillingType[data.method];
    const extras: Record<string, unknown> = {};
    // Encargos: o serviço pode ter valores próprios; senão vale o padrão da empresa. Fica gravado na cobrança.
    const { data: lateCfg } = await admin.from("tenant_settings")
      .select("late_fine_enabled, late_fine_percent, late_interest_enabled, late_interest_percent")
      .eq("tenant_id", tenantId).maybeSingle();
    const fineEnabled = lateCfg?.late_fine_enabled ?? ASAAS_DEFAULT_LATE_FEES.fineEnabled;
    const interestEnabled = lateCfg?.late_interest_enabled ?? ASAAS_DEFAULT_LATE_FEES.interestEnabled;
    const finePct = Number(service.fine_percentage) > 0 ? Number(service.fine_percentage) : fineEnabled ? Number(lateCfg?.late_fine_percent ?? ASAAS_DEFAULT_LATE_FEES.finePercent) : 0;
    const interestPct = Number(service.interest_percentage) > 0 ? Number(service.interest_percentage) : interestEnabled ? Number(lateCfg?.late_interest_percent ?? ASAAS_DEFAULT_LATE_FEES.interestPercent) : 0;
    if (finePct > 0) extras["fine"] = { value: finePct, type: "PERCENTAGE" };
    if (interestPct > 0) extras["interest"] = { value: interestPct };
    if (Number(service.discount_amount) > 0)
      extras["discount"] = { value: Number(service.discount_amount), dueDateLimitDays: 0, type: "FIXED" };

    const chargeGroupId = crypto.randomUUID();
    const description = service.name as string;
    const base = {
      tenant_id: tenantId,
      charge_group_id: chargeGroupId,
      customer_id: customer.id,
      service_id: service.id,
      contract_id: contractId,
      description,
      status: "created" as const,
      method,
      provider: "asaas",
      provider_connection_id: conn.connection.id,
      created_by: userId,
      fee_payer_share: data.feePassShare,
      fine_percent: finePct,
      interest_percent: interestPct,
    };

    let subscriptionRowId: string | null = null;
    let firstGross = amount;
    if (service.type === "installment") firstGross = round2(amount / Number(service.installments ?? 2));
    const feeInstallments = service.type === "installment" ? Number(service.installments ?? 2) : 1;
    const feeGross = service.type === "installment" && method === "credit_card" ? amount : firstGross;
    const initialFee = await computePlatformFeeDetails(admin, feeGross, method, feeInstallments, service.type === "recurring", service.type === "one_time" ? tenantId : undefined);
    const firstFee = service.type === "installment" && method === "credit_card" ? round2(initialFee.totalFee / feeInstallments) : initialFee.totalFee;

    // Coprodução: validada antes de qualquer registro, para não existir cobrança com convite impossível.
    let coproducers: Awaited<ReturnType<typeof import("./coproduction.server").prepareCoproducers>> | null = null;
    if (data.coproducers?.length) {
      const totalFee = service.type === "installment" && method !== "credit_card" ? initialFee.totalFee * feeInstallments : initialFee.totalFee;
      const { prepareCoproducers } = await import("./coproduction.server");
      coproducers = await prepareCoproducers(admin, tenantId, data.coproducers, round2(amount - totalFee));
    }

    const { data: placeholder, error: insertError } = await admin
      .from("payments")
      .insert({
        ...base,
        gross_amount: firstGross,
        platform_fee_amount: firstFee,
        fee_configuration_id: initialFee.feeConfigurationId,
        fee_fixed_amount: service.type === "installment" && method === "credit_card" ? round2(initialFee.fixedFee / feeInstallments) : initialFee.fixedFee,
        fee_percentage: initialFee.percentageFee,
        fee_percentage_amount: service.type === "installment" && method === "credit_card" ? round2(initialFee.percentageFeeAmount / feeInstallments) : initialFee.percentageFeeAmount,
        fee_calculated_at: initialFee.calculationTimestamp,
        net_amount: round2(firstGross - firstFee),
        due_on: dueOn,
        service_amount: round2(firstGross * serviceRatio),
        idempotency_key: data.idempotencyKey,
        installment_number: service.type === "installment" ? 1 : null,
        installment_count: service.type === "installment" ? service.installments : null,
      })
      .select("id")
      .single();
    if (insertError || !placeholder) throw new Error("Não foi possível registrar a cobrança.");

    try {
      if (service.type === "one_time") {
        const coverCents = await providerCoverCents(conn.provider, method, amount, initialFee.totalFeeCents);
        if (coverCents > 0) await admin.from("payments").update({ provider_fee_covered_amount: centsToAmount(coverCents) }).eq("id", placeholder.id);
        const p = await conn.provider.createPayment({
          customer: providerCustomerId,
          billingType,
          value: amount,
          dueDate: dueOn,
          description,
          externalReference: placeholder.id,
          split: wiizePaySplit(initialFee.totalFeeCents - coverCents, masterWalletId),
          ...extras,
        });
        await admin
          .from("payments")
          .update({ provider_payment_id: p.id, status: "awaiting_payment", invoice_url: p.invoiceUrl ?? null, bank_slip_url: p.bankSlipUrl ?? null })
          .eq("id", placeholder.id);
      } else if (service.type === "installment") {
        const count = Number(service.installments ?? 2);
        const first = await conn.provider.createPayment({
          customer: providerCustomerId,
          billingType,
          totalValue: amount,
          installmentCount: count,
          dueDate: dueOn,
          description,
          externalReference: chargeGroupId,
          // Cartão: 1 taxa sobre o total. Boleto/Pix parcelado: taxa fixa + percentual em CADA parcela.
          split: wiizePaySplit(method === "credit_card" ? initialFee.totalFeeCents : initialFee.totalFeeCents * count, masterWalletId, "installment"),
          ...extras,
        });
        const installmentId = first.installment ?? null;
        const list = installmentId ? await conn.provider.listInstallmentPayments(installmentId) : [first];
        list.sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
        const [head, ...rest] = list.length ? list : [first];
        const headGross = head!.value ?? firstGross;
        const cardTotalFee = method === "credit_card" ? await computePlatformFeeDetails(admin, amount, method, count) : null;
        const headDetails = cardTotalFee ?? await computePlatformFeeDetails(admin, headGross, method, 1);
        const headFee = cardTotalFee ? Math.floor(cardTotalFee.totalFeeCents / count) / 100 : headDetails.totalFee;
        await admin
          .from("payments")
          .update({
            provider_payment_id: head!.id,
            provider_installment_id: installmentId,
            status: "awaiting_payment",
            gross_amount: headGross,
            platform_fee_amount: headFee,
             fee_configuration_id: headDetails.feeConfigurationId,
             fee_fixed_amount: cardTotalFee ? Math.floor(cardTotalFee.fixedFeeCents / count) / 100 : headDetails.fixedFee,
             fee_percentage: headDetails.percentageFee,
             fee_percentage_amount: cardTotalFee ? Math.floor(cardTotalFee.percentageFeeCents / count) / 100 : headDetails.percentageFeeAmount,
             fee_calculated_at: headDetails.calculationTimestamp,
            net_amount: round2(headGross - headFee),
            due_on: head!.dueDate ?? dueOn,
            installment_number: head!.installmentNumber ?? 1,
            invoice_url: head!.invoiceUrl ?? null,
            bank_slip_url: head!.bankSlipUrl ?? null,
          })
          .eq("id", placeholder.id);
        for (const [index, item] of rest.entries()) {
          const gross = item.value ?? firstGross;
          const details = cardTotalFee ?? await computePlatformFeeDetails(admin, gross, method, 1);
          const isLast = index === rest.length - 1;
          const allocatedBefore = Math.floor(details.totalFeeCents / count) * (count - 1);
          const feeCents = cardTotalFee ? (isLast ? details.totalFeeCents - allocatedBefore : Math.floor(details.totalFeeCents / count)) : details.totalFeeCents;
          const fee = feeCents / 100;
          await admin.from("payments").insert({
            ...base,
            status: "awaiting_payment",
            gross_amount: gross,
            platform_fee_amount: fee,
             fee_configuration_id: details.feeConfigurationId,
             fee_fixed_amount: cardTotalFee ? 0 : details.fixedFee,
             fee_percentage: details.percentageFee,
             fee_percentage_amount: cardTotalFee ? fee : details.percentageFeeAmount,
             fee_calculated_at: details.calculationTimestamp,
            net_amount: round2(gross - fee),
            due_on: item.dueDate ?? dueOn,
            installment_number: item.installmentNumber ?? null,
            installment_count: count,
            provider_payment_id: item.id,
            provider_installment_id: installmentId,
            invoice_url: item.invoiceUrl ?? null,
            bank_slip_url: item.bankSlipUrl ?? null,
          });
        }
      } else {
        const cycle = frequencyToCycle[service.frequency ?? "monthly"] ?? "MONTHLY";
        const { data: sub, error: subError } = await admin
          .from("subscriptions")
          .insert({
            tenant_id: tenantId,
            provider_connection_id: conn.connection.id,
            customer_id: customer.id,
            service_id: service.id,
            contract_id: contractId,
            amount,
            frequency: service.frequency ?? "monthly",
            method: method ?? "pix",
            cycles: service.cycles,
            starts_on: dueOn,
            next_charge_on: dueOn,
          })
          .select("id")
          .single();
        if (subError || !sub) { console.error("subscription insert failed", subError); throw new Error("Não foi possível registrar a recorrência. Confira o valor e o vencimento e tente novamente."); }
        subscriptionRowId = sub.id;
        await admin.from("payments").update({ subscription_id: sub.id }).eq("id", placeholder.id);
        const created = await conn.provider.createSubscription({
          customer: providerCustomerId,
          billingType,
          value: amount,
          nextDueDate: dueOn,
          cycle,
          description,
          maxPayments: service.cycles ?? undefined,
          externalReference: sub.id,
          split: wiizePaySplit(initialFee.totalFeeCents, masterWalletId),
          ...extras,
        });
        await admin.from("subscriptions").update({ provider_subscription_id: created.id }).eq("id", sub.id);
        const payments = await conn.provider.listSubscriptionPayments(created.id);
        const first = payments.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
        if (first) {
          await admin
            .from("payments")
            .update({
              provider_payment_id: first.id,
              status: "awaiting_payment",
              due_on: first.dueDate ?? dueOn,
              method: billingTypeToMethod(first.billingType) ?? method,
              invoice_url: first.invoiceUrl ?? null,
              bank_slip_url: first.bankSlipUrl ?? null,
            })
            .eq("id", placeholder.id);
        }
      }
    } catch (error) {
      await admin.from("payments").delete().eq("charge_group_id", chargeGroupId).is("provider_payment_id", null);
      if (subscriptionRowId) await admin.from("subscriptions").update({ active: false }).eq("id", subscriptionRowId);
      await logAudit(admin, { tenantId, userId: userId, action: "charge.create", resource: "payments", result: "failure", metadata: { serviceType: service.type } });
      throw error instanceof Error ? error : new Error("Falha ao criar a cobrança.");
    }

    // Snapshot por parcela: valor do serviço e custo estimado do provedor na data da criação.
    {
      const { estimateProviderCost } = await import("./fee-engine.server");
      const feeMethod = (service.type === "recurring" && method === "pix" ? "pix_recurring" : method ?? "pix") as "pix";
      const { data: rows } = await admin.from("payments").select("id, gross_amount, installment_count").eq("charge_group_id", chargeGroupId);
      for (const row of rows ?? []) {
        const gross = Number(row.gross_amount);
        const est = method ? await estimateProviderCost(admin, { paymentMethod: feeMethod, grossAmount: gross, installments: method === "credit_card" || method === "boleto" ? row.installment_count ?? 1 : 1 }) : null;
        await admin.from("payments").update({ service_amount: round2(gross * serviceRatio), estimated_provider_cost: est?.cost ?? null, provider_cost_config_id: est?.id ?? null }).eq("id", row.id);
      }
    }

    // Tentativa original, aparência vigente e início da linha do tempo de cada cobrança.
    {
      const { recordOriginalAttempts } = await import("./payment-attempts.server");
      await recordOriginalAttempts(admin, tenantId, chargeGroupId, userId).catch((e) => console.error("attempts", e));
    }

    {
      const { applyDunning } = await import("./dunning.server");
      if (data.dunningPlan) {
        await admin.from("dunning_charge_plans").upsert({ tenant_id: tenantId, charge_group_id: chargeGroupId, plan_code: data.dunningPlan, updated_by: userId });
      }
      const { data: chargePayments } = await admin.from("payments").select("id").eq("tenant_id", tenantId).eq("charge_group_id", chargeGroupId);
      for (const payment of chargePayments ?? []) {
        await applyDunning(admin, conn.provider, { tenantId, paymentId: payment.id, providerCustomerId }).catch((e) => console.error("dunning", e));
      }
    }

    if (coproducers) {
      const { createCoproduction } = await import("./coproduction.server");
      await createCoproduction(admin, { tenantId, chargeGroupId, userId, participants: coproducers });
    }
    {
      const { enqueueWiizeSaleEvent } = await import("./wiize-sale-sync.server");
      await enqueueWiizeSaleEvent(admin, tenantId, chargeGroupId, "created");
    }
    const link = await issueLink(admin, { tenantId, chargeGroupId, customerId: customer.id, serviceId: service.id, contractId, userId: userId, days: data.linkDays, minutes: data.linkMinutes, collectCustomerData: data.collectCustomerData });
    // E-mail da cobrança ao cliente: só com lembretes ativos e canal e-mail na etapa "criada". Enviado 1x (chave única).
    if (customer.email) {
      try {
        const { data: dc } = await admin.from("dunning_charges").select("payment_id").eq("tenant_id", tenantId).eq("status", "active").in("payment_id", (await admin.from("payments").select("id").eq("charge_group_id", chargeGroupId)).data?.map((p) => p.id) ?? []).limit(1);
        const { data: cfg } = await admin.from("dunning_tenant_config").select("plan_code, steps").eq("tenant_id", tenantId).maybeSingle();
        const { data: gp } = await admin.from("dunning_charge_plans").select("plan_code").eq("tenant_id", tenantId).eq("charge_group_id", chargeGroupId).maybeSingle();
        const { sanitizeSteps } = await import("./dunning-rules");
        const plan = (gp?.plan_code ?? cfg?.plan_code) as import("./dunning-rules").DunningPlanCode | undefined;
        if (dc?.length && cfg && plan && sanitizeSteps(cfg.steps, plan).created.includes("email")) {
          const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
          const { emailPerson, brl } = await import("./notify.server");
          await emailPerson(admin, {
            tenantId, kind: "charge.created.customer", dedupeKey: `charge.created.customer:${chargeGroupId}`,
            email: {
              to: customer.email,
              subject: `Nova cobrança de ${tenant?.name ?? "sua empresa"}`,
              title: "Você recebeu uma cobrança",
              intro: `${tenant?.name ?? "A empresa"} enviou uma cobrança para você.`,
              lines: [{ label: "Serviço", value: description }, { label: "Valor", value: brl(amount) }, { label: "Vencimento", value: dueOn.split("-").reverse().join("/") }],
              cta: { label: "Ver e pagar", url: `/c/${link.token}` },
            },
          });
        }
      } catch (e) {
        console.error("charge email", e instanceof Error ? e.message : "falhou");
      }
    }
    await logAudit(admin, {
      tenantId,
      userId: userId,
      action: "charge.created",
      resource: "payments",
      resourceId: chargeGroupId,
      metadata: { serviceType: service.type, method: data.method, amount, serviceAmount, feePassShare: data.feePassShare },
    });
    return { chargeGroupId, token: link.token };
}
