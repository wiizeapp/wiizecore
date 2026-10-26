/** Autoridade única: só o servidor decide se a empresa pode receber pagamentos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function canReceivePayments(admin: any, tenantId: string): Promise<boolean> {
  const { data } = await admin.rpc("can_receive_payments", { _tenant_id: tenantId });
  return data === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertCanReceivePayments(admin: any, tenantId: string) {
  if (!(await canReceivePayments(admin, tenantId))) {
    throw new Error("O WiizePay ainda não está ativado para esta empresa. Conclua a ativação em Ativar pagamentos.");
  }
}
