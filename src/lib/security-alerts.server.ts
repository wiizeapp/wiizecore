import { sendEmail } from "./email.server";
import { alertDedupeKey, classifySecurityEvent, guideFor, maskIp } from "./security-alerts";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Destino fixo dos alertas de ataque (admin da plataforma). */
export const SECURITY_ALERT_RECIPIENT = "caiowiize@gmail.com";

/**
 * Avisa o admin por e-mail quando um ataque é bloqueado.
 * Agrupado (1 e-mail por tipo + origem a cada 30 min) e nunca quebra a operação principal.
 */
export async function alertSecurityIncident(
  admin: Admin,
  event: { eventType: string; severity: string; ip: string | null; tenantId?: string | null; scope?: string },
) {
  try {
    const category = classifySecurityEvent(event.eventType, event.severity);
    if (!category) return;
    const guide = guideFor(category);
    const origin = event.ip ?? "sem-ip";
    const when = new Date();
    await sendEmail(admin, {
      tenantId: null,
      kind: "security_alert",
      dedupeKey: alertDedupeKey(category, origin, when),
      email: {
        to: SECURITY_ALERT_RECIPIENT,
        subject: `${guide.urgent ? "[URGENTE] " : ""}Alerta de segurança WiizePay: ${guide.title}`,
        title: guide.title,
        intro: guide.what,
        lines: [
          { label: "Quando", value: when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) },
          { label: "Tipo", value: event.scope ? `${event.eventType} (${event.scope})` : event.eventType },
          { label: "Origem (IP)", value: maskIp(event.ip) },
          { label: "Situação", value: "Bloqueado automaticamente" },
          ...guide.steps.map((s, i) => ({ label: `O que fazer ${i + 1}`, value: s })),
        ],
        cta: { label: "Abrir tela de Segurança", url: "/seguranca" },
        footnote: "Novas tentativas da mesma origem nos próximos 30 minutos são agrupadas e não geram outro e-mail.",
      },
    });
  } catch {
    // alerta nunca interrompe a operação
  }
}
