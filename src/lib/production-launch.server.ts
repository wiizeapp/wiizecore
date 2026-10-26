type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const PRODUCTION_LAUNCH_KIND = "production_launch";

export function productionEnabled() {
  return process.env["ACTIVATION_FEE_ENABLED"] === "true";
}

/**
 * Quando a produção é liberada, avisa (sininho + e-mail) cada empresa que ainda não ativou.
 * Idempotente: uma única vez por empresa (dedupe por notificação existente + email_outbox).
 * Nunca lança erro.
 */
export async function announceProductionLaunch(admin: Admin, limit = 50) {
  if (!productionEnabled()) return { sent: 0 };
  let sent = 0;
  try {
    const [{ data: tenants }, { data: done }, { data: paid }] = await Promise.all([
      admin.from("tenants").select("id").order("created_at").limit(2000),
      admin.from("notifications").select("tenant_id").eq("kind", PRODUCTION_LAUNCH_KIND).limit(5000),
      admin.from("activation_fee_payments").select("tenant_id").eq("status", "confirmed").limit(5000),
    ]);
    const skip = new Set([...(done ?? []), ...(paid ?? [])].map((r) => r.tenant_id));
    const pending = (tenants ?? []).filter((t) => !skip.has(t.id)).slice(0, limit);
    const { notifyTenant } = await import("./notify.server");
    const base = process.env["PUBLIC_APP_URL"] || "https://wiizecore.lovable.app";
    for (const t of pending) {
      await notifyTenant(admin, {
        tenantId: t.id,
        kind: PRODUCTION_LAUNCH_KIND,
        dedupeKey: `production-launch:${t.id}`,
        title: "Sua conta de produção está liberada!",
        body: "A WiizeCore saiu da versão beta. Ative sua conta de produção e comece a receber pagamentos reais agora mesmo.",
        link: `${base}/ativacao`,
        email: { subject: "WiizeCore: conta de produção liberada" },
      });
      sent++;
    }
  } catch (e) {
    console.error("production-launch", e instanceof Error ? e.message : "falhou");
  }
  return { sent };
}
