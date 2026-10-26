export type Operation = "brasil" | "global";

export function isOperation(v: unknown): v is Operation {
  return v === "brasil" || v === "global";
}

/** Global permanece bloqueada até integração aprovada: nenhuma tela financeira pode agir nela. */
export function canUseFinancialScreens(op: Operation, globalEnabled: boolean) {
  return op === "brasil" || globalEnabled;
}
