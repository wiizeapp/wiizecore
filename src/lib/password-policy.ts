/** Regra única de senha forte (cadastro e senha financeira). */
export const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 10, label: "Pelo menos 10 caracteres" },
  { test: (v: string) => /[a-z]/.test(v), label: "Uma letra minúscula" },
  { test: (v: string) => /[A-Z]/.test(v), label: "Uma letra maiúscula" },
  { test: (v: string) => /[0-9]/.test(v), label: "Um número" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "Um símbolo (ex.: ! @ # $ %)" },
  { test: (v: string) => !/(.)\1\1/.test(v) && !/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|senha|password|wiize)/i.test(v), label: "Sem sequências óbvias ou repetições" },
];

export function passwordProblems(value: string) {
  return PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.label);
}

export function assertStrongPassword(value: string, what = "A senha") {
  const problems = passwordProblems(value);
  if (problems.length) throw new Error(`${what} precisa ter: ${problems.join(", ").toLowerCase()}.`);
}
