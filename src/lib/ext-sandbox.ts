/** Regras puras do simulador de testes (sandbox) da API externa. Nada aqui movimenta dinheiro. */
import { eventForTrigger, type ExtEvent } from "./ext-webhooks";

export const SANDBOX_ACTIONS = ["approve", "pending", "decline", "overdue", "cancel", "refund", "renew"] as const;
export type SandboxAction = (typeof SANDBOX_ACTIONS)[number];
export type SandboxKind = "one_time" | "installment" | "recurring";
export type SandboxState = { status: string; kind: SandboxKind; cyclesPaid: number; subscriptionStatus: string | null };
export type SandboxResult =
  | { ok: true; next: SandboxState; event: ExtEvent; label: string }
  | { ok: false; error: "invalid_transition" };

const OPEN = ["awaiting_payment", "pending", "overdue"];

/** Transições permitidas. Cada ação válida gera exatamente um evento de teste. */
export function applySandboxAction(s: SandboxState, action: SandboxAction): SandboxResult {
  const sub = s.kind === "recurring";
  const fail = { ok: false as const, error: "invalid_transition" as const };
  if (s.subscriptionStatus === "cancelled" || s.status === "cancelled" || s.status === "refunded") {
    return fail;
  }
  switch (action) {
    case "approve": {
      if (!OPEN.includes(s.status)) return fail;
      const cyclesPaid = s.cyclesPaid + 1;
      return { ok: true, label: "Pagamento de teste aprovado", event: eventForTrigger("payment_received", s.kind, cyclesPaid), next: { ...s, status: "paid", cyclesPaid, subscriptionStatus: sub ? "active" : null } };
    }
    case "pending":
      if (s.status !== "awaiting_payment") return fail;
      return { ok: true, label: "Pagamento de teste pendente", event: "payment.updated", next: { ...s, status: "pending" } };
    case "decline":
      if (!OPEN.includes(s.status)) return fail;
      return { ok: true, label: "Pagamento de teste recusado", event: "payment.updated", next: { ...s, status: "failed" } };
    case "overdue":
      if (!["awaiting_payment", "pending", "failed"].includes(s.status)) return fail;
      return { ok: true, label: "Cobrança de teste vencida", event: eventForTrigger("overdue", s.kind, s.cyclesPaid), next: { ...s, status: "overdue", subscriptionStatus: sub ? "overdue" : null } };
    case "cancel":
      if (s.status === "paid" && !sub) return fail;
      return { ok: true, label: "Cobrança de teste cancelada", event: eventForTrigger("cancelled", s.kind, s.cyclesPaid), next: { ...s, status: s.status === "paid" ? "paid" : "cancelled", subscriptionStatus: sub ? "cancelled" : null } };
    case "refund":
      if (s.status !== "paid") return fail;
      return { ok: true, label: "Reembolso de teste", event: "payment.refunded", next: { ...s, status: "refunded" } };
    case "renew":
      // Novo ciclo aberto: não é renovação até o pagamento ser aprovado.
      if (!sub || s.status !== "paid") return fail;
      return { ok: true, label: "Novo ciclo de teste aberto", event: "payment.updated", next: { ...s, status: "awaiting_payment" } };
  }
}

/** Endereço de retorno seguro: https, sem usuário/senha, domínio público (sem IP/localhost). */
export function isSafeReturnUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith("[")) return false;
    return true;
  } catch {
    return false;
  }
}
