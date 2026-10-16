import { createFileRoute } from "@tanstack/react-router";

/**
 * Cria cliente (ou reaproveita), cobrança e sessão de checkout hospedado.
 * Autenticação: Authorization: Bearer sk_... — a empresa vem SEMPRE da chave.
 * Chave de teste sem conta de pagamentos de teste → simulador interno (nenhum dinheiro real).
 */
export const Route = createFileRoute("/api/public/v1/ext/checkout-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withExtApi, extError, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/checkout-sessions", ["checkout_sessions:write", "charges:write"], async (ctx) => {
          const { db, tenantId, requestId: rid } = ctx;
          const fail = (code: string, status: number, extra?: Record<string, unknown>) => extError(rid, code, status, extra);
          const ext = await import("@/lib/ext-checkout.server");
          const idem = request.headers.get("idempotency-key") ?? "";
          if (!ext.IDEMPOTENCY_RE.test(idem)) return fail("idempotency_key_required", 400);
          const raw = await request.text();
          if (raw.length > 16384) return fail("payload_too_large", 413);
          let body: import("@/lib/ext-checkout.server").ExtCheckoutBody;
          try {
            const p = ext.extCheckoutBody.safeParse(JSON.parse(raw));
            if (!p.success) return fail("invalid_body", 422, { fields: p.error.issues.slice(0, 10).map((i) => i.path.join(".")) });
            body = p.data;
          } catch { return fail("invalid_json", 400); }

          const { tokenFingerprint, decryptSecret, randomToken } = await import("@/lib/crypto.server");
          const requestHash = tokenFingerprint(ext.canonicalJson(body));
          const base = (await import("@/lib/billing.server")).publicBaseUrl(null);

          const { data: conn } = await db.from("provider_connections").select("environment").eq("tenant_id", tenantId).eq("provider", "asaas").eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
          const simulated = ctx.environment === "test" && conn?.environment !== "sandbox";

          const { data: service } = await db.from("services").select("id, name, amount, type, frequency, accepted_methods").eq("id", body.service_id).eq("tenant_id", tenantId).eq("active", true).maybeSingle();

          // ---------- Simulador de testes: tabela própria, nunca toca cobranças reais ----------
          if (simulated) {
            const sbxView = (r: { id: string; public_token: string; status: string; expires_at: string; external_customer_id: string | null; external_subscription_id: string | null }, status: number) => extJson(rid, {
              id: r.id, object: "checkout_session", livemode: false, sandbox: true, charge_id: r.id, status: r.status,
              url: base ? `${base}/teste-checkout/${r.public_token}` : null, expires_at: r.expires_at,
              external_customer_id: r.external_customer_id, external_subscription_id: r.external_subscription_id, request_id: rid,
            }, status);
            const { data: prev } = await db.from("ext_sandbox_charges").select("*").eq("integration_id", ctx.integrationId).eq("idempotency_key", idem).maybeSingle();
            if (prev) return prev.request_hash === requestHash ? sbxView(prev, 200) : fail("idempotency_key_reused", 409);
            if (!service) return fail("service_not_found", 404);
            if (body.payment_method && !service.accepted_methods.includes(body.payment_method)) return fail("payment_method_not_allowed", 422);
            const kind = service.type as string;
            const { data: row, error } = await db.from("ext_sandbox_charges").insert({
              tenant_id: tenantId, integration_id: ctx.integrationId, idempotency_key: idem, request_hash: requestHash,
              public_token: `sbx_${randomToken(24)}`, service_id: service.id, service_name: service.name, charge_type: kind,
              frequency: service.frequency, amount: service.amount, payment_method: body.payment_method ?? null,
              customer_name: body.customer.name, customer_email: body.customer.email ?? null, document_last4: body.customer.document.slice(-4),
              external_customer_id: body.customer.external_customer_id ?? null, external_subscription_id: body.external_subscription_id ?? null,
              success_url: body.success_url ?? null, cancel_url: body.cancel_url ?? null,
              subscription_status: kind === "recurring" ? "pending" : null,
              history: [{ at: new Date().toISOString(), action: "created", label: "Sessão de teste criada" }] as never,
            }).select("*").single();
            if (error || !row) {
              const { data: again } = await db.from("ext_sandbox_charges").select("*").eq("integration_id", ctx.integrationId).eq("idempotency_key", idem).maybeSingle();
              return again ? sbxView(again, 200) : fail("internal_error", 500);
            }
            const sbx = await import("@/lib/ext-sandbox.server");
            await sbx.emitSandbox(db, row, "checkout.session.created");
            await sbx.emitSandbox(db, row, kind === "recurring" ? "subscription.created" : "payment.created");
            return sbxView(row, 201);
          }

          // ---------- Fluxo real (inalterado) ----------
          const respond = async (s: { id: string; charge_group_id: string; payment_link_id: string | null; expires_at: string | null; external_customer_id: string | null; external_subscription_id: string | null }, status: number) => {
            const { data: link } = s.payment_link_id ? await db.from("payment_links").select("token_ciphertext, revoked_at").eq("id", s.payment_link_id).maybeSingle() : { data: null };
            const { data: pay } = await db.from("payments").select("status").eq("charge_group_id", s.charge_group_id).eq("tenant_id", tenantId).order("installment_number", { ascending: true }).limit(1).maybeSingle();
            const token = link?.token_ciphertext && !link.revoked_at ? decryptSecret(link.token_ciphertext) : null;
            return extJson(rid, {
              id: s.id, object: "checkout_session", livemode: ctx.environment === "live",
              charge_id: s.charge_group_id, status: pay?.status ?? "created",
              url: token ? `${base}/pagar/${token}` : null, expires_at: s.expires_at,
              external_customer_id: s.external_customer_id, external_subscription_id: s.external_subscription_id, request_id: rid,
            }, status);
          };

          // Repetição com a mesma chave: devolve a mesma sessão, nunca cria outra cobrança.
          const { data: prev } = await db.from("ext_checkout_sessions").select("*").eq("integration_id", ctx.integrationId).eq("idempotency_key", idem).maybeSingle();
          if (prev) return prev.request_hash === requestHash ? respond(prev, 200) : fail("idempotency_key_reused", 409);

          if (!conn) return fail("account_not_ready", 409);
          if ((ctx.environment === "live") !== (conn.environment === "production")) return fail("environment_mismatch", 409);
          if (!service) return fail("service_not_found", 404);
          if (body.payment_method && !service.accepted_methods.includes(body.payment_method)) return fail("payment_method_not_allowed", 422);

          // Cliente: vínculo externo → CPF/CNPJ → cria. Sempre dentro da empresa da chave.
          const c = body.customer;
          let customerId: string | null = null;
          if (c.external_customer_id) {
            customerId = (await db.from("ext_customer_links").select("customer_id").eq("integration_id", ctx.integrationId).eq("external_customer_id", c.external_customer_id).maybeSingle()).data?.customer_id ?? null;
          }
          if (!customerId) customerId = (await db.from("customers").select("id").eq("tenant_id", tenantId).eq("document", c.document).limit(1).maybeSingle()).data?.id ?? null;
          if (!customerId) {
            const { data: created, error } = await db.from("customers").insert({
              tenant_id: tenantId, name: c.name, document: c.document, type: c.document.length === 14 ? "company" : "individual",
              email: c.email ?? null, phone: c.phone ?? null, created_by: ctx.createdBy, notes: "Criado pela Integração Externa",
            } as never).select("id").single();
            if (error || !created) return fail("customer_create_failed", 500);
            customerId = created.id;
          }
          if (c.external_customer_id) {
            await db.from("ext_customer_links").upsert({ tenant_id: tenantId, integration_id: ctx.integrationId, customer_id: customerId, external_customer_id: c.external_customer_id }, { onConflict: "integration_id,external_customer_id", ignoreDuplicates: true });
          }

          let charge: { chargeGroupId: string };
          try {
            const { createChargeCore } = await import("@/lib/charges-core.server");
            charge = await createChargeCore(tenantId, ctx.createdBy!, null, {
              customerId, serviceId: service.id, method: body.payment_method ?? "undefined",
              idempotencyKey: `ext:${ctx.integrationId}:${idem}`, linkDays: 30, collectCustomerData: true, feePassShare: 0,
              installmentCount: body.installments ?? null,
            });
          } catch (e) {
            const m = ext.mapCoreError(e instanceof Error ? e.message : "");
            console.error("ext checkout core failed", m.code);
            return fail(m.code, m.status);
          }

          const { data: link } = await db.from("payment_links").select("id, expires_at").eq("tenant_id", tenantId).eq("charge_group_id", charge.chargeGroupId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
          const { data: session, error: sErr } = await db.from("ext_checkout_sessions").insert({
            tenant_id: tenantId, integration_id: ctx.integrationId, idempotency_key: idem, request_hash: requestHash,
            customer_id: customerId, service_id: service.id, charge_group_id: charge.chargeGroupId, payment_link_id: link?.id ?? null,
            external_customer_id: c.external_customer_id ?? null, external_subscription_id: body.external_subscription_id ?? null,
            success_url: body.success_url ?? null, cancel_url: body.cancel_url ?? null, expires_at: link?.expires_at ?? null,
          }).select("*").single();
          if (sErr || !session) {
            const { data: again } = await db.from("ext_checkout_sessions").select("*").eq("integration_id", ctx.integrationId).eq("idempotency_key", idem).maybeSingle();
            return again ? respond(again, 200) : fail("internal_error", 500);
          }
          { const wh = await import("@/lib/ext-webhooks.server"); await wh.enqueueExtSessionCreated(db, tenantId, charge.chargeGroupId); await wh.enqueueExtChargeEvent(db, tenantId, charge.chargeGroupId, "created"); }
          const { logAudit } = await import("@/lib/audit.server");
          await logAudit(db, { tenantId, userId: ctx.createdBy, action: "ext_api.checkout_session.created", resource: "ext_checkout_sessions", metadata: { integration_id: ctx.integrationId, session_id: session.id, charge_group_id: charge.chargeGroupId } });
          return respond(session, 201);
        }, 60);
      },
    },
  },
});
