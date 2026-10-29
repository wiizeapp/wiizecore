export function threeDsOperationallyEnabled(environmentEnabled: boolean, allowed: boolean): boolean {
  return environmentEnabled && allowed;
}
// A payment confirmation is not proof of a successful issuer authentication.
export function threeDsEvidenceLabel(status: string): string {
  if (status === "authenticated") return "Pagamento confirmado; autenticação não comprovada";
  if (status === "failed") return "Desafio não concluído";
  if (status === "capture_refused") return "Captura recusada";
  if (status === "challenge_redirected") return "Desafio solicitado pelo banco";
  if (status === "returned") return "Retorno recebido; aguardando confirmação";
  return "Sem confirmação de autenticação";
}