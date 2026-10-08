import { z } from "zod";
import * as s from "./wiize-pay-oauth.server";

type Db = Awaited<ReturnType<typeof s.getAdmin>>;


export const apiJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

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
