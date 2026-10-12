import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * Cria cliente (ou reaproveita), cobrança real e sessão de checkout hospedado.
 * Autenticação: Authorization: Bearer sk_... — a empresa vem SEMPRE da chave.
 */
export const Route = createFileRoute("/api/public/v1/ext/checkout-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateExtRequest } = await import("@/lib/ext-auth.server");
        const auth = await authenticateExtRequest(request, "checkout_sessions:write");
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: it } = await db.from("ext_integrations").select("scopes, created_by").eq("id", auth.integrationId).single();
        if (!it?.scopes.includes("charges:write")) return json({ error: "insufficient_scope" }, 403);

        const { consumeRateLimit } = await import("@/lib/audit.server");
        const rl = await consumeRateLimit(db, { scope: "ext_checkout", identifier: auth.integrationId, maxAttempts: 60, windowSeconds: 60, blockSeconds: 60 });
        if (!rl.allowed) return json({ error: "rate_limited" }, 429);

        const ext = await import("@/lib/ext-checkout.server");
        const idem = request.headers.get("idempotency-key") ?? "";
        if (!ext.IDEMPOTENCY_RE.test(idem)) return json({ error: "idempotency_key_required" }, 400);
        const raw = await request.text();
        if (raw.length > 16384) return json({ error: "payload_too_large" }, 413);
        let body: import("@/lib/ext-checkout.server").ExtCheckoutBody;
        try {
          const p = ext.extCheckoutBody.safeParse(JSON.parse(raw));
          if (!p.success) return json({ error: "invalid_body", fields: p.error.issues.slice(0, 10).map((i) => i.path.join(".")) }, 422);
          body = p.data;
        } catch { return json({ error: "invalid_json" }, 400); }

        const { tokenFingerprint, decryptSecret } = await import("@/lib/crypto.server");
        const requestHash = tokenFingerprint(ext.canonicalJson(body));
        const base = (await import("@/lib/billing.server")).publicBaseUrl(null);
        const tenantId = auth.tenantId;

        const respond = async (s: { id: string; charge_group_id: string; payment_link_id: string | null; expires_at: string | null; external_customer_id: string | null; external_subscription_id: string | null }, status: number) => {
          const { data: link } = s.payment_link_id ? await db.from("payment_links").select("token_ciphertext, revoked_at").eq("id", s.payment_link_id).maybeSingle() : { data: null };
          const { data: pay } = await db.from("payments").select("status").eq("charge_group_id", s.charge_group_id).eq("tenant_id", tenantId).order("installment_number", { ascending: true }).limit(1).maybeSingle();
          const token = link?.token_ciphertext && !link.revoked_at ? decryptSecret(link.token_ciphertext) : null;
          return json({
            id: s.id, object: "checkout_session", livemode: auth.environment === "live",
            charge_id: s.charge_group_id, status: pay?.status ?? "created",
            url: token ? `${base}/pagar/${token}` : null, expires_at: s.expires_at,
            external_customer_id: s.external_customer_id, external_subscription_id: s.external_subscription_id,
          }, status);
        };

        // Repetição com a mesma chave: devolve a mesma sessão, nunca cria outra cobrança.
        const { data: prev } = await db.from("ext_checkout_sessions").select("*").eq("integration_id", auth.integrationId).eq("idempotency_key", idem).maybeSingle();
        if (prev) return prev.request_hash === requestHash ? respond(prev, 200) : json({ error: "idempotency_key_reused" }, 409);

        // Ambiente da chave precisa bater com o da conta de pagamentos.
        const { data: conn } = await db.from("provider_connections").select("environment").eq("tenant_id", tenantId).eq("provider", "asaas").eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (!conn) return json({ error: "account_not_ready" }, 409);
        if ((auth.environment === "live") !== (conn.environment === "production")) return json({ error: "environment_mismatch" }, 409);

        const { data: service } = await db.from("services").select("id, accepted_methods").eq("id", body.service_id).eq("tenant_id", tenantId).eq("active", true).maybeSingle();
        if (!service) return json({ error: "service_not_found" }, 404);
        if (body.payment_method && !service.accepted_methods.includes(body.payment_method)) return json({ error: "payment_method_not_allowed" }, 422);

        // Cliente: vínculo externo → CPF/CNPJ → cria. Sempre dentro da empresa da chave.
        const c = body.customer;
        let customerId: string | null = null;
        if (c.external_customer_id) {
          customerId = (await db.from("ext_customer_links").select("customer_id").eq("integration_id", auth.integrationId).eq("external_customer_id", c.external_customer_id).maybeSingle()).data?.customer_id ?? null;
        }
        if (!customerId) customerId = (await db.from("customers").select("id").eq("tenant_id", tenantId).eq("document", c.document).limit(1).maybeSingle()).data?.id ?? null;
        if (!customerId) {
          const { data: created, error } = await db.from("customers").insert({
            tenant_id: tenantId, name: c.name, document: c.document, type: c.document.length === 14 ? "company" : "individual",
            email: c.email ?? null, phone: c.phone ?? null, created_by: it.created_by, notes: "Criado pela Integração Externa",
          } as never).select("id").single();
          if (error || !created) return json({ error: "customer_create_failed" }, 500);
          customerId = created.id;
        }
        if (c.external_customer_id) {
          await db.from("ext_customer_links").upsert({ tenant_id: tenantId, integration_id: auth.integrationId, customer_id: customerId, external_customer_id: c.external_customer_id }, { onConflict: "integration_id,external_customer_id", ignoreDuplicates: true });
        }

        let charge: { chargeGroupId: string };
        try {
          const { createChargeCore } = await import("@/lib/charges-core.server");
          charge = await createChargeCore(tenantId, it.created_by!, null, {
            customerId, serviceId: service.id, method: body.payment_method ?? "undefined",
            idempotencyKey: `ext:${auth.integrationId}:${idem}`, linkDays: 30, collectCustomerData: true, feePassShare: 0,
            installmentCount: body.installments ?? null,
          });
        } catch (e) {
          const m = ext.mapCoreError(e instanceof Error ? e.message : "");
          console.error("ext checkout core failed", m.code);
          return json({ error: m.code }, m.status);
        }

        const { data: link } = await db.from("payment_links").select("id, expires_at").eq("tenant_id", tenantId).eq("charge_group_id", charge.chargeGroupId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const { data: session, error: sErr } = await db.from("ext_checkout_sessions").insert({
          tenant_id: tenantId, integration_id: auth.integrationId, idempotency_key: idem, request_hash: requestHash,
          customer_id: customerId, service_id: service.id, charge_group_id: charge.chargeGroupId, payment_link_id: link?.id ?? null,
          external_customer_id: c.external_customer_id ?? null, external_subscription_id: body.external_subscription_id ?? null,
          success_url: body.success_url ?? null, cancel_url: body.cancel_url ?? null, expires_at: link?.expires_at ?? null,
        }).select("*").single();
        if (sErr || !session) {
          // Corrida com a mesma chave: devolve a sessão vencedora.
          const { data: again } = await db.from("ext_checkout_sessions").select("*").eq("integration_id", auth.integrationId).eq("idempotency_key", idem).maybeSingle();
          return again ? respond(again, 200) : json({ error: "internal_error" }, 500);
        }
        { const wh = await import("@/lib/ext-webhooks.server"); await wh.enqueueExtSessionCreated(db, tenantId, charge.chargeGroupId); await wh.enqueueExtChargeEvent(db, tenantId, charge.chargeGroupId, "created"); }
        const { logAudit } = await import("@/lib/audit.server");
        await logAudit(db, { tenantId, userId: it.created_by, action: "ext_api.checkout_session.created", resource: "ext_checkout_sessions", metadata: { integration_id: auth.integrationId, session_id: session.id, charge_group_id: charge.chargeGroupId } });
        return respond(session, 201);
      },
    },
  },
});
