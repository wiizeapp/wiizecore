import { isLaunchPromoActive, launchPromoEndsAt, shouldSendPromoReminder } from "./launch-promotion";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Data real de criação da empresa, lida no servidor (o navegador nunca informa). */
async function tenantCreatedAt(admin: Admin, tenantId: string): Promise<string | null> {
  const { data } = await admin.from("tenants").select("created_at").eq("id", tenantId).maybeSingle();
  return data?.created_at ?? null;
}

/** Fonte única da elegibilidade: conta lida do banco + relógio do servidor. */
export async function isEligibleForLaunchPromotion(admin: Admin, tenantId: string, now = new Date()): Promise<boolean> {
  return isLaunchPromoActive(await tenantCreatedAt(admin, tenantId), now);
}

/**
 * Lembrete interno único ("termina em 7 dias"). A chave fixa em `email_outbox` garante uma só vez por empresa,
 * mesmo com o painel aberto várias vezes ou chamadas simultâneas.
 */
export async function maybeSendLaunchPromoReminder(admin: Admin, tenantId: string, now = new Date()) {
  try {
    const created = await tenantCreatedAt(admin, tenantId);
    if (!shouldSendPromoReminder(created, now)) return;
    const { error } = await admin
      .from("email_outbox" as never)
      .insert({ tenant_id: tenantId, dedupe_key: `launch-promo-7d:${tenantId}`, kind: "launch_promo_reminder", status: "skipped" } as never);
    if (error) return; // já enviado
    const end = launchPromoEndsAt(created)!;
    await admin.from("notifications").insert({
      tenant_id: tenantId,
      kind: "launch_promo_reminder",
      title: "Sua promoção de 0% termina em 7 dias.",
      body: `A partir de ${end.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, Pix à vista e boleto à vista voltam para a taxa padrão.`,
      link: "/taxas",
    });
  } catch {
    // lembrete nunca bloqueia o painel
  }
}
