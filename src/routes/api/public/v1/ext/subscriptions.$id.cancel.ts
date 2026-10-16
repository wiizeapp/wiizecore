import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/v1/ext/subscriptions/:id/cancel — encerra os próximos ciclos.
 * Regra: ciclos já pagos não são estornados; o cancelamento só é confirmado após o provedor aceitar.
 * Repetir a chamada devolve o mesmo resultado (idempotente). Exige subscriptions:write.
 */
export const Route = createFileRoute("/api/public/v1/ext/subscriptions/$id/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { withExtApi, extError, extJson } = await import("@/lib/ext-api.server");
        return withExtApi(request, "/v1/ext/subscriptions/:id/cancel", ["subscriptions:write"], async (ctx) => {
          const read = await import("@/lib/ext-read.server");
          const { db, tenantId, requestId: rid } = ctx;
          if (!read.isUuid(params.id)) return extError(rid, "not_found", 404);

          if (ctx.environment === "test") {
            const { data: r } = await db.from("ext_sandbox_charges").select("*").eq("id", params.id).eq("tenant_id", tenantId).eq("integration_id", ctx.integrationId).eq("charge_type", "recurring").maybeSingle();
            if (r) {
              if (r.subscription_status === "cancelled") return extJson(rid, { ...read.sandboxSubscriptionView(r), cancellation: "already_cancelled", request_id: rid });
              const { simulateSandbox } = await import("@/lib/ext-sandbox.server");
              const res = await simulateSandbox(db, tenantId, r.id, "cancel", "api");
              if (!res.ok) return extError(rid, res.error === "conflict" ? "conflict" : "invalid_transition", 409);
              return extJson(rid, { ...read.sandboxSubscriptionView(res.row), cancellation: "cancelled", request_id: rid });
            }
          }

          const before = await read.liveSubscriptionView(ctx, params.id);
          if (!before || before.livemode !== (ctx.environment === "live")) return extError(rid, "not_found", 404);
          if (before.status === "cancelled") return extJson(rid, { ...before, cancellation: "already_cancelled", request_id: rid });

          const { data: sub } = await db.from("subscriptions").select("provider_subscription_id").eq("id", params.id).eq("tenant_id", tenantId).single();
          if (sub?.provider_subscription_id) {
            const { getTenantProvider } = await import("@/lib/billing.server");
            const conn = await getTenantProvider(db, tenantId);
            if (!conn) return extError(rid, "account_not_ready", 409);
            try {
              await conn.provider.cancelSubscription(sub.provider_subscription_id);
            } catch {
              console.error("ext subscription cancel provider failed");
              return extError(rid, "provider_unavailable", 502);
            }
          }
          await db.from("subscriptions").update({ active: false, next_charge_on: null, updated_at: new Date().toISOString() }).eq("id", params.id).eq("tenant_id", tenantId).eq("active", true);
          const { logAudit } = await import("@/lib/audit.server");
          await logAudit(db, { tenantId, userId: ctx.createdBy, action: "ext_api.subscription.cancelled", resource: "subscriptions", resourceId: params.id, metadata: { integration_id: ctx.integrationId } });
          const { enqueueExtChargeEvent } = await import("@/lib/ext-webhooks.server");
          await enqueueExtChargeEvent(db, tenantId, before.charge_id, "cancelled");
          const after = await read.liveSubscriptionView(ctx, params.id);
          return extJson(rid, { ...(after ?? before), cancellation: "cancelled", request_id: rid });
        }, 30);
      },
    },
  },
});
