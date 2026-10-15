/** Regras puras do checkout aberto por serviço (seguro para o navegador). */
export type OpenMethod = "pix" | "boleto" | "credit_card";
export type OpenServiceType = "one_time" | "installment" | "recurring";

export const MAX_OPEN_INSTALLMENTS = 21;

/** Formas oferecidas: Pix, boleto e cartão, limitadas ao que o serviço aceita. */
export function openMethods(accepted: readonly string[]): OpenMethod[] {
  return (["pix", "boleto", "credit_card"] as OpenMethod[]).filter((m) => accepted.includes(m));
}

/** Opções de parcelas: só serviço parcelado; 1 = à vista. Recorrente e único não parcelam. */
export function openInstallments(type: OpenServiceType, max = MAX_OPEN_INSTALLMENTS): number[] {
  if (type !== "installment") return [1];
  return Array.from({ length: Math.min(MAX_OPEN_INSTALLMENTS, Math.max(1, Math.floor(max))) }, (_, i) => i + 1);
}

export function isValidChoice(type: OpenServiceType, accepted: readonly string[], method: string, n: number, max = MAX_OPEN_INSTALLMENTS) {
  return (openMethods(accepted) as string[]).includes(method) && openInstallments(type, max).includes(n);
}
