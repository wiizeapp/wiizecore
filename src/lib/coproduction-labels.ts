export const CP_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  pending: { label: "Aguardando aceite", tone: "warning" }, active: { label: "Ativa", tone: "success" },
  rejected: { label: "Recusada", tone: "danger" }, cancelled: { label: "Cancelada", tone: "neutral" },
  accepted: { label: "Aceita", tone: "success" },
};
