/** Browser-safe rules; authority always comes from authenticated server context. */
export function scopedProviderEventId(connectionId: string, externalEventId: string) {
  return `${connectionId}:${externalEventId}`;
}

export function assertReplaceableProviderPayment(
  payment: { id?: string; status?: string; deleted?: boolean },
  expectedId: string,
  reactivating: boolean,
) {
  if (payment.id !== expectedId) throw new Error("Não foi possível validar o pagamento atual.");
  if (reactivating) {
    if (payment.deleted !== true) throw new Error("Não foi possível confirmar o cancelamento anterior.");
  } else if (payment.deleted || !["PENDING", "OVERDUE"].includes(payment.status ?? "")) {
    throw new Error("O estado atual desta cobrança não permite substituição.");
  }
}