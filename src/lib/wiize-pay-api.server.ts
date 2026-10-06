import { z } from "zod";
import * as s from "./wiize-pay-oauth.server";

type Db = Awaited<ReturnType<typeof s.getAdmin>>;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const chargeBody = z.object({
  external_reference: z.string().min(1).max(120),
  schema_version: z.literal("1.0"),
  source: z.literal("wiize_crm"),
  deal: z.object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    type: z.enum(["one_time", "installment", "recurring"]),
    amount_cents: z.number().int().positive().max(100_000_000),
    currency: z.literal("BRL"),
    installments_or_months: z.number().int().min(1).max(60).optional(),
    total_cents: z.number().int().positive().max(1_000_000_000).optional(),
    start_date: date.optional(),
    end_date: date.optional(),
  }),
  customer: z.object({
    lead_id: z.string().max(120).optional(),
    company_name: z.string().max(200).nullish(),
    contact_name: z.string().max(200).nullish(),
    email: z.string().email().max(254).nullish(),
    phone: z.string().max(30).nullish(),
    city: z.string().max(120).nullish(),
    document: z.string().max(20).nullish(),
  }),
  payment: z.object({
    methods: z
      .array(z.enum(["pix", "boleto", "credit_card", "debit"]))
      .min(1)
      .max(4),
    due_date: date,
  }),
});
export type ChargeBody = z.infer<typeof chargeBody>;

export const apiJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export function checkoutOrigin(request: Request) {
  return (
    process.env["WIIZEPAY_CHECKOUT_ORIGIN"] ??
    process.env["WIIZE_PAY_CHECKOUT_ORIGIN"] ??
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

async function findOrCreateCustomer(
  db: Db,
  tenantId: string,
  userId: string,
  c: ChargeBody["customer"],
) {
  const doc = c.document?.replace(/\D/g, "") || null;
  if (doc && ![11, 14].includes(doc.length))
    throw new Error("customer.document inválido.");
  let found: { id: string; document: string | null } | null = null;
  if (c.lead_id) {
    const { data: l } = await db
      .from("wiize_customer_links")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .eq("wiize_customer_id", c.lead_id)
      .maybeSingle();
    if (l)
      found = (
        await db
          .from("customers")
          .select("id, document")
          .eq("tenant_id", tenantId)
          .eq("id", l.customer_id)
          .maybeSingle()
      ).data;
  }
  if (!found && doc)
    found = (
      await db
        .from("customers")
        .select("id, document")
        .eq("tenant_id", tenantId)
        .eq("document", doc)
        .maybeSingle()
    ).data;
  if (!found && c.email)
    found = (
      await db
        .from("customers")
        .select("id, document")
        .eq("tenant_id", tenantId)
        .ilike("email", c.email)
        .limit(1)
        .maybeSingle()
    ).data;
  if (found) {
    if (!found.document && doc)
      await db.from("customers").update({ document: doc }).eq("id", found.id);
    if (!found.document && !doc)
      throw new Error("customer.document é obrigatório para este cliente.");
    return found.id;
  }
  if (!doc)
    throw new Error("customer.document é obrigatório para novos clientes.");
  const name = c.company_name || c.contact_name;
  if (!name)
    throw new Error("Informe customer.company_name ou customer.contact_name.");
  const { data, error } = await db
    .from("customers")
    .insert({
      tenant_id: tenantId,
      name,
      trade_name: c.contact_name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      city: c.city ?? null,
      document: doc,
      type: doc.length === 14 ? "company" : "individual",
      created_by: userId,
      notes: "Criado pela integração Wiize",
    })
    .select("id")
    .single();
  if (error) throw new Error("Não foi possível registrar o cliente.");
  return data.id;
}

export async function createWiizeCharge(
  db: Db,
  request: Request,
  tok: { tenant_id: string; user_id: string; client_id: string },
  key: string,
  checksum: string | null,
  b: ChargeBody,
) {
  const tenantId = tok.tenant_id;
  const { data: existing } = await db
    .from("wiize_charges")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return reissue(db, request, existing, tok.user_id);

  const d = b.deal;
  const n = d.installments_or_months ?? 1;
  if (d.type === "installment" && (n < 2 || b.payment.methods.length !== 1))
    throw new Error(
      "Parcelamento exige 2+ parcelas e uma única forma de pagamento.",
    );
  if (d.type === "recurring" && b.payment.methods.length !== 1)
    throw new Error("Recorrência exige uma única forma de pagamento.");
  const today = new Date(Date.now() - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  if (b.payment.due_date < today)
    throw new Error("payment.due_date não pode estar no passado.");

  const { data: placeholder, error: pe } = await db
    .from("wiize_charges")
    .insert({
      public_id: `chg_${s.randomSecret(18)}`,
      tenant_id: tenantId,
      client_id: tok.client_id,
      idempotency_key: key,
      checksum,
      external_reference: b.external_reference,
      amount_cents:
        d.type === "installment"
          ? (d.total_cents ?? d.amount_cents * n)
          : d.amount_cents,
    })
    .select("*")
    .single();
  if (pe || !placeholder) {
    const { data: again } = await db
      .from("wiize_charges")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (again) return reissue(db, request, again, tok.user_id);
    throw new Error("Não foi possível registrar a cobrança.");
  }
  try {
    const customerId = await findOrCreateCustomer(
      db,
      tenantId,
      tok.user_id,
      b.customer,
    );
    const methods = b.payment.methods.map((m) =>
      m === "debit" ? "debit_card" : m,
    ) as ("pix" | "boleto" | "credit_card" | "debit_card")[];
    const total =
      d.type === "installment"
        ? (d.total_cents ?? d.amount_cents * n) / 100
        : d.amount_cents / 100;
    const { data: svc, error: se } = await db
      .from("services")
      .insert({
        tenant_id: tenantId,
        name: d.title,
        description: `Venda Wiize ${d.id}`.slice(0, 200),
        amount: total,
        type: d.type,
        installments: d.type === "installment" ? n : null,
        cycles: d.type === "recurring" ? n : null,
        frequency: d.type === "recurring" ? "monthly" : null,
        accepted_methods: methods,
        created_by: tok.user_id,
        starts_on: d.start_date ?? null,
        ends_on: d.end_date ?? null,
        active: true,
      })
      .select("id")
      .single();
    if (se || !svc) throw new Error("Não foi possível registrar a venda.");
    const startsOn = d.start_date ?? b.payment.due_date;
    let endsOn = d.end_date ?? null;
    const months = d.installments_or_months ?? null;
    if (!endsOn && months) {
      const e = new Date(`${startsOn}T12:00:00Z`);
      e.setUTCMonth(e.getUTCMonth() + months);
      endsOn = e.toISOString().slice(0, 10);
    }
    if (endsOn && endsOn <= startsOn)
      throw new Error("deal.end_date deve ser posterior a deal.start_date.");
    const { data: ctr, error: ce } = await db
      .from("contracts")
      .insert({
        tenant_id: tenantId,
        title: d.title.slice(0, 160),
        customer_id: customerId,
        service_id: svc.id,
        amount: total,
        starts_on: startsOn,
        ends_on: endsOn,
        duration_months: months,
        status: "draft",
        created_by: tok.user_id,
      })
      .select("id")
      .single();
    if (ce || !ctr) throw new Error("Não foi possível registrar o contrato.");
    const { createChargeCore } = await import("./charges-core.server");
    const res = await createChargeCore(
      tenantId,
      tok.user_id,
      checkoutOrigin(request),
      {
        customerId,
        serviceId: svc.id,
        contractId: ctr.id,
        dueOn: b.payment.due_date,
        method: methods.length === 1 ? methods[0]! : "undefined",
        idempotencyKey: `wiize:${tenantId}:${key}`,
        linkDays: 1,
        linkMinutes: s.CHECKOUT_TTL_MIN,
        collectCustomerData: false,
        feePassShare: 0,
      },
    );
    await db
      .from("wiize_charges")
      .update({
        charge_group_id: res.chargeGroupId,
        customer_id: customerId,
        service_id: svc.id,
      })
      .eq("id", placeholder.id);
    await s.audit(db, {
      tenantId,
      userId: tok.user_id,
      action: "wiize_pay.charge.created",
      details: { charge: placeholder.public_id },
    });
    return {
      status: 201,
      body: {
        id: placeholder.public_id,
        status: "pending",
        checkout_url: `${checkoutOrigin(request)}/pagar/${res.token}`,
        checkout_expires_at: new Date(
          Date.now() + s.CHECKOUT_TTL_MIN * 60000,
        ).toISOString(),
      },
    };
  } catch (e) {
    await db
      .from("wiize_charges")
      .delete()
      .eq("id", placeholder.id)
      .is("charge_group_id", null);
    throw e;
  }
}

async function reissue(
  db: Db,
  request: Request,
  c: {
    id: string;
    public_id: string;
    tenant_id: string;
    status: string;
    charge_group_id: string | null;
    customer_id: string | null;
    service_id: string | null;
  },
  userId: string,
) {
  if (!c.charge_group_id)
    throw new Error("Cobrança em processamento. Tente novamente em instantes.");
  if (c.status !== "pending" && c.status !== "overdue")
    return {
      status: 200,
      body: {
        id: c.public_id,
        status: c.status,
        checkout_url: null,
        checkout_expires_at: null,
      },
    };
  const { issueLink } = await import("./charges-core.server");
  const link = await issueLink(db, {
    tenantId: c.tenant_id,
    chargeGroupId: c.charge_group_id,
    customerId: c.customer_id,
    serviceId: c.service_id,
    contractId: null,
    userId,
    days: 1,
    minutes: s.CHECKOUT_TTL_MIN,
  });
  return {
    status: 200,
    body: {
      id: c.public_id,
      status: c.status,
      checkout_url: `${checkoutOrigin(request)}/pagar/${link.token}`,
      checkout_expires_at: link.expiresAt,
    },
  };
}

export async function cancelWiizeCharge(
  db: Db,
  tenantId: string,
  publicId: string,
  userId: string,
) {
  const { data: c } = await db
    .from("wiize_charges")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .maybeSingle();
  if (!c) return null;
  if (c.status === "cancelled") return { id: c.public_id, status: "cancelled" };
  if (c.status === "paid")
    throw new Error("Cobrança já paga não pode ser cancelada.");
  if (c.charge_group_id) {
    const { getTenantProvider } = await import("./billing.server");
    const conn = await getTenantProvider(db, tenantId);
    const { data: payments } = await db
      .from("payments")
      .select("id, provider_payment_id, status, subscription_id")
      .eq("tenant_id", tenantId)
      .eq("charge_group_id", c.charge_group_id);
    const subId = payments?.find((p) => p.subscription_id)?.subscription_id;
    if (subId && conn) {
      const { data: sub } = await db
        .from("subscriptions")
        .select("provider_subscription_id")
        .eq("id", subId)
        .maybeSingle();
      if (sub?.provider_subscription_id)
        await conn.provider.cancelSubscription(sub.provider_subscription_id);
      await db.from("subscriptions").update({ active: false }).eq("id", subId);
    }
    for (const p of payments ?? []) {
      if (
        conn &&
        p.provider_payment_id &&
        ["created", "awaiting_payment", "overdue"].includes(p.status)
      ) {
        try {
          await conn.provider.cancelPayment(p.provider_payment_id);
        } catch (e) {
          console.error(
            "cancel provider",
            e instanceof Error ? e.message : "x",
          );
        }
      }
    }
    await db
      .from("payment_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("charge_group_id", c.charge_group_id)
      .is("revoked_at", null);
  }
  await db
    .from("wiize_charges")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", c.id);
  const eventId = `evt_${s.sha256hex(`${c.id}:cancelled`).slice(0, 32)}`;
  await db
    .from("wiize_pay_webhooks")
    .upsert(
      {
        event_id: eventId,
        tenant_id: tenantId,
        charge_id: c.id,
        type: "charge.cancelled",
        body: {
          event_id: eventId,
          type: "charge.cancelled",
          data: {
            charge_id: c.public_id,
            external_reference: c.external_reference,
            amount_cents: Number(c.amount_cents),
          },
        } as never,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  await s.audit(db, {
    tenantId,
    userId,
    action: "wiize_pay.charge.cancelled",
    details: { charge: c.public_id },
  });
  return { id: c.public_id, status: "cancelled" };
}

/** Cliente enviado pelo Wiize. CPF/CNPJ é opcional: é pedido depois, na cobrança. */
export const syncCustomerSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  trade_name: z.string().max(200).nullish(),
  email: z.string().email().max(254).nullish().or(z.literal("")),
  phone: z.string().max(30).nullish(),
  document: z.string().max(20).nullish(),
  zip_code: z.string().max(12).nullish(),
  address: z.string().max(200).nullish(),
  address_number: z.string().max(20).nullish(),
  complement: z.string().max(120).nullish(),
  district: z.string().max(120).nullish(),
  city: z.string().max(120).nullish(),
  state: z.string().max(2).nullish(),
});
export const syncCustomersBody = z.object({
  customers: z.array(syncCustomerSchema).min(1).max(100),
});
type SyncCustomer = z.infer<typeof syncCustomerSchema>;

/** Cria ou atualiza clientes vindos do Wiize. A empresa vem do token; nunca duplica. */
export async function upsertWiizeCustomers(
  db: Db,
  tok: { tenant_id: string; user_id: string },
  list: SyncCustomer[],
) {
  const tenantId = tok.tenant_id;
  const results: {
    id: string;
    status: "created" | "updated" | "linked" | "error";
    customer_id?: string;
    message?: string;
  }[] = [];
  for (const c of list) {
    try {
      const rawDoc = c.document?.replace(/\D/g, "") || null;
      const doc = rawDoc && [11, 14].includes(rawDoc.length) ? rawDoc : null;
      const email = c.email ? c.email.toLowerCase() : null;
      const fields: Record<string, unknown> = { name: c.name };
      const opt: [keyof SyncCustomer, string][] = [
        ["trade_name", "trade_name"],
        ["phone", "phone"],
        ["zip_code", "zip_code"],
        ["address", "address"],
        ["address_number", "address_number"],
        ["complement", "complement"],
        ["district", "district"],
        ["city", "city"],
      ];
      for (const [k, col] of opt) if (c[k]) fields[col] = c[k];
      if (c.state) fields["state"] = c.state.toUpperCase();
      if (email) fields["email"] = email;

      const { data: link } = await db
        .from("wiize_customer_links")
        .select("customer_id")
        .eq("tenant_id", tenantId)
        .eq("wiize_customer_id", c.id)
        .maybeSingle();
      let customerId = link?.customer_id ?? null;
      let method = "link";
      if (!customerId && doc) {
        customerId =
          (
            await db
              .from("customers")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("document", doc)
              .maybeSingle()
          ).data?.id ?? null;
        method = "document";
      }
      if (!customerId && email) {
        customerId =
          (
            await db
              .from("customers")
              .select("id")
              .eq("tenant_id", tenantId)
              .ilike("email", email)
              .limit(1)
              .maybeSingle()
          ).data?.id ?? null;
        method = "email";
      }
      if (customerId) {
        const { data: cur } = await db
          .from("customers")
          .select("document")
          .eq("id", customerId)
          .eq("tenant_id", tenantId)
          .single();
        if (doc && !cur?.document) {
          fields["document"] = doc;
          fields["type"] = doc.length === 14 ? "company" : "individual";
        }
        await db
          .from("customers")
          .update(fields as never)
          .eq("id", customerId)
          .eq("tenant_id", tenantId);
        if (!link)
          await db
            .from("wiize_customer_links")
            .upsert(
              {
                tenant_id: tenantId,
                wiize_customer_id: c.id,
                customer_id: customerId,
                match_method: method,
              },
              {
                onConflict: "tenant_id,wiize_customer_id",
                ignoreDuplicates: true,
              },
            );
        results.push({
          id: c.id,
          status: link ? "updated" : "linked",
          customer_id: customerId,
        });
      } else {
        const { data, error } = await db
          .from("customers")
          .insert({
            ...fields,
            tenant_id: tenantId,
            document: doc,
            type: doc?.length === 14 ? "company" : "individual",
            created_by: tok.user_id,
            notes: "Sincronizado do Wiize",
          } as never)
          .select("id")
          .single();
        if (error || !data)
          throw new Error("Não foi possível criar o cliente.");
        await db
          .from("wiize_customer_links")
          .insert({
            tenant_id: tenantId,
            wiize_customer_id: c.id,
            customer_id: data.id,
            match_method: "created",
          });
        results.push({ id: c.id, status: "created", customer_id: data.id });
      }
    } catch (e) {
      results.push({
        id: c.id,
        status: "error",
        message: e instanceof Error ? e.message.slice(0, 160) : "Erro",
      });
    }
  }
  await s.audit(db, {
    tenantId,
    userId: tok.user_id,
    action: "wiize_pay.customers.synced",
    details: { count: list.length },
  });
  return results;
}
