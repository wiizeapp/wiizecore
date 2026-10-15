/**
 * Exibição: junta "Taxa financeira" (platform_fee) e "Custo da infraestrutura"
 * (provider_fee) do mesmo pagamento em uma única linha "Taxa financeira".
 * Só afeta o que o usuário vê; os registros no banco continuam separados
 * para auditoria.
 */
type TxLike = { id: string; kind: string; amount: number | string; payment_id?: string | null };

const addAmounts = (a: TxLike, b: TxLike) => {
  a.amount = String(Number(a.amount) + Number(b.amount));
};

export function mergeFeeRows<T extends TxLike>(rows: T[]): T[] {
  const feeByPayment = new Map<string, T>();
  const pendingProvider = new Map<string, T[]>();
  const out: T[] = [];

  // Copia cada linha: nunca alterar os dados em cache (somar de novo a cada render inflava a taxa).
  for (const original of rows) {
    const t = { ...original };
    if (t.kind === "platform_fee" && t.payment_id) {
      const pend = pendingProvider.get(t.payment_id);
      if (pend?.length) {
        for (const p of pend) addAmounts(t, p);
        pendingProvider.delete(t.payment_id);
      }
      feeByPayment.set(t.payment_id, t);
      out.push(t);
      continue;
    }
    if (t.kind === "provider_fee" && t.payment_id) {
      const fee = feeByPayment.get(t.payment_id);
      if (fee) {
        addAmounts(fee, t);
        continue;
      }
      const list = pendingProvider.get(t.payment_id) ?? [];
      list.push(t);
      pendingProvider.set(t.payment_id, list);
      continue;
    }
    out.push(t);
  }

  // provider_fee sem platform_fee correspondente: exibe como veio.
  for (const list of pendingProvider.values()) out.push(...list);
  return out;
}
