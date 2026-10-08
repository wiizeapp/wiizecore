import { createFileRoute } from "@tanstack/react-router";

/** Envia a fila de avisos assinados para o Wiize. Chamado pela tarefa agendada. */
export const Route = createFileRoute("/api/public/wiize-pay/deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWiizePayCron } =
          await import("@/lib/cron-auth.server");
        const denied = authenticateWiizePayCron(request);
        if (denied) return denied;
        const s = await import("@/lib/wiize-pay-oauth.server");
        const db = await s.getAdmin();
        let secret =
          process.env["WIIZEPAY_WEBHOOK_SECRET"] ??
          process.env["WIIZE_PAY_WEBHOOK_SECRET"];
        if (!secret) {
          const { data: c } = await db
            .from("oauth_clients")
            .select("webhook_secret_enc")
            .eq("name", s.WIIZE_CLIENT_NAME)
            .maybeSingle();
          if (c?.webhook_secret_enc) {
            const { decryptSecret } = await import("@/lib/crypto.server");
            secret = decryptSecret(c.webhook_secret_enc);
          }
        }
        if (!secret) return new Response("Not configured", { status: 503 });
        const { data: events } = await db
          .from("wiize_pay_webhooks")
          .select("*")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("created_at")
          .limit(50);
        let sent = 0;
        for (const e of events ?? []) {
          // Mesmo event_id; timestamp e nonce novos a cada tentativa. Assina os bytes exatos enviados.
          const body = JSON.stringify(e.body);
          const ts = String(Math.floor(Date.now() / 1000));
          const nonce = s.randomSecret(24);
          let status = 0;
          try {
            const res = await fetch(s.WIIZE_WEBHOOK_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Wiize-Pay-Timestamp": ts,
                "X-Wiize-Pay-Nonce": nonce,
                "X-Wiize-Pay-Signature": s.signWebhook(secret, ts, nonce, body),
              },
              body,
              redirect: "error",
            });
            status = res.status;
            if (!res.ok) throw new Error(String(res.status));
            await db
              .from("wiize_pay_webhooks")
              .update({
                status: "delivered",
                delivered_at: new Date().toISOString(),
                attempts: e.attempts + 1,
                last_status: status,
                last_error: null,
              })
              .eq("id", e.id);
            await s.audit(db, {
              tenantId: e.tenant_id,
              action: "wiize_pay.webhook.delivered",
              details: { type: e.type },
            });
            sent++;
          } catch (err) {
            const attempts = e.attempts + 1;
            const delay = s.RETRY_DELAYS_S[attempts - 1];
            await db
              .from("wiize_pay_webhooks")
              .update({
                attempts,
                last_status: status || null,
                status: delay ? "pending" : "failed",
                last_error:
                  err instanceof Error ? err.message.slice(0, 200) : "erro",
                next_attempt_at: new Date(
                  Date.now() + (delay ?? 0) * 1000,
                ).toISOString(),
              })
              .eq("id", e.id);
            if (status === 401)
              await s.audit(db, {
                tenantId: e.tenant_id,
                action: "wiize_pay.webhook.unauthorized",
                outcome: "alert",
              });
          }
        }
        // Avisos de vendas (cobranças criadas, alteradas, pagas, atrasadas, canceladas).
        const { data: sales } = await db
          .from("wiize_sale_events")
          .select("*")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("created_at")
          .limit(100);
        for (const e of sales ?? []) {
          const body = JSON.stringify(e.body);
          const ts = String(Math.floor(Date.now() / 1000));
          const nonce = s.randomSecret(24);
          let status = 0;
          try {
            const res = await fetch(s.WIIZE_WEBHOOK_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Wiize-Pay-Timestamp": ts,
                "X-Wiize-Pay-Nonce": nonce,
                "X-Wiize-Pay-Signature": s.signWebhook(secret, ts, nonce, body),
                "Idempotency-Key": e.event_id,
              },
              body,
              redirect: "error",
            });
            status = res.status;
            if (!res.ok) throw new Error(String(res.status));
            await db.from("wiize_sale_events").update({ status: "delivered", delivered_at: new Date().toISOString(), attempts: e.attempts + 1, last_status: status, last_error: null }).eq("id", e.id);
            sent++;
          } catch (err) {
            const attempts = e.attempts + 1;
            const delay = s.RETRY_DELAYS_S[attempts - 1];
            await db.from("wiize_sale_events").update({
              attempts,
              last_status: status || null,
              status: delay ? "pending" : "failed",
              last_error: err instanceof Error ? err.message.slice(0, 200) : "erro",
              next_attempt_at: new Date(Date.now() + (delay ?? 0) * 1000).toISOString(),
            }).eq("id", e.id);
          }
        }
        return Response.json({ sent });
      },
    },
  },
});
