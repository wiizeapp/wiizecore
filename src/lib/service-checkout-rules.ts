/** Regras puras do checkout aberto por serviço (seguro para o navegador). */
export type OpenMethod = "pix" | "boleto" | "credit_card";
export type OpenServiceType = "one_time" | "installment" | "recurring";

export const MAX_OPEN_INSTALLMENTS = 21;

/** Formas oferecidas conforme o tipo do serviço, limitadas ao que o serviço aceita. */
export function openMethods(type: OpenServiceType, accepted: readonly string[]): OpenMethod[] {
  const all: OpenMethod[] = ["pix", "boleto", "credit_card"];
  return all.filter((m) => accepted.includes(m));
  // Todos os tipos aceitam as três formas; o que muda são as parcelas (ver openInstallments).
}

/** Opções de parcelas: só serviço parcelado; 1 = à vista. Recorrente e único não parcelam. */
export function openInstallments(type: OpenServiceType): number[] {
  if (type !== "installment") return [1];
  return Array.from({ length: MAX_OPEN_INSTALLMENTS }, (_, i) => i + 1);
}

export function isValidChoice(type: OpenServiceType, accepted: readonly string[], method: string, n: number) {
  return (openMethods(type, accepted) as string[]).includes(method) && openInstallments(type).includes(n);
}
