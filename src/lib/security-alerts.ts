/** Regras puras do alerta de ataque: o que avisar, quando agrupar e o que o admin deve fazer. */

export const SECURITY_ALERT_WINDOW_MINUTES = 30;

export type AlertGuide = { title: string; what: string; steps: string[]; urgent: boolean };

const GUIDES: Record<string, AlertGuide> = {
  rate_limit: {
    title: "Muitas tentativas bloqueadas",
    what: "Alguém repetiu a mesma ação muitas vezes seguidas (por exemplo, tentar adivinhar dados de acesso). O sistema já bloqueou essa origem por um tempo.",
    steps: [
      "Nenhuma ação urgente: o bloqueio já está ativo e nenhum dado foi liberado.",
      "Se receber vários alertas do mesmo endereço (IP) no mesmo dia, considere bloquear esse IP na hospedagem.",
      "Se a origem for um cliente real com dificuldade de acesso, oriente-o a esperar 15 minutos e tentar de novo.",
    ],
    urgent: false,
  },
  financial: {
    title: "Tentativa suspeita em área financeira",
    what: "Houve falhas repetidas de senha financeira, código de duas etapas ou pedido de saque. O sistema recusou as tentativas.",
    steps: [
      "Confira em Segurança se a conta envolvida pertence a alguém da sua equipe.",
      "Se não reconhecer a tentativa, peça para a pessoa trocar a senha de login e a senha financeira agora.",
      "Se suspeitar de um ex-colaborador, desative o acesso dele na tela Equipe.",
      "Confira no Extrato se nenhum saque desconhecido foi pedido.",
    ],
    urgent: true,
  },
  upload: {
    title: "Arquivo perigoso recusado",
    what: "Alguém tentou enviar um arquivo disfarçado (por exemplo, um programa com nome de PDF). O arquivo foi recusado e não foi salvo.",
    steps: [
      "Nenhuma ação urgente: o arquivo não entrou no sistema.",
      "Se a tentativa veio de alguém da equipe, confirme se o computador dessa pessoa não está com vírus.",
    ],
    urgent: false,
  },
  generic: {
    title: "Atividade suspeita bloqueada",
    what: "O sistema identificou e bloqueou uma ação fora do normal.",
    steps: [
      "Abra a tela Segurança e confira o histórico recente.",
      "Se não reconhecer a atividade, troque as senhas das contas envolvidas.",
    ],
    urgent: false,
  },
};

/** Classifica um evento em uma categoria de alerta. Eventos comuns retornam null (sem e-mail). */
export function classifySecurityEvent(eventType: string, severity: string): keyof typeof GUIDES | null {
  const t = eventType.toLowerCase();
  if (t.startsWith("rate_limit")) return "rate_limit";
  if (/(withdraw|saque|financial|mfa|totp|2fa|password_fin|backup_code)/.test(t) && severity !== "info") return "financial";
  if (/(upload|file)/.test(t) && severity !== "info") return "upload";
  if (severity === "critical") return "generic";
  return null;
}

export function guideFor(category: string): AlertGuide {
  return GUIDES[category] ?? GUIDES["generic"]!;
}

/** Chave de agrupamento: no máximo 1 e-mail por categoria + origem a cada janela. */
export function alertDedupeKey(category: string, origin: string, now: Date) {
  const bucket = Math.floor(now.getTime() / (SECURITY_ALERT_WINDOW_MINUTES * 60_000));
  return `security-alert:${category}:${origin}:${bucket}`;
}

/** Mascara o IP para o e-mail (mostra só o começo). */
export function maskIp(ip: string | null) {
  if (!ip) return "desconhecido";
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".*.*";
  return ip.split(":").slice(0, 3).join(":") + ":…";
}
