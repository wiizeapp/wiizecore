/** Cartões fictícios do ambiente de testes. Nunca são enviados ao provedor nem gravados. */
export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", outcome: "approve", label: "Pagamento aprovado" },
  { number: "4000 0000 0000 0002", outcome: "decline", label: "Pagamento recusado" },
  { number: "4000 0000 0000 0077", outcome: "pending", label: "Pagamento pendente (em análise)" },
] as const;

export type TestCardOutcome = (typeof TEST_CARDS)[number]["outcome"];

/** Resultado do cartão de teste, ou null se o número não for um cartão de teste. */
export function testCardOutcome(raw: string): TestCardOutcome | null {
  const digits = raw.replace(/\D/g, "");
  return TEST_CARDS.find((c) => c.number.replace(/\s/g, "") === digits)?.outcome ?? null;
}
