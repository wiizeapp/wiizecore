import Decimal from "decimal.js";
export const ACTIVATION_CENTS = 1990;
export function validActivationPayment(remote: { id:string; customer?:string; externalReference?:string; billingType?:string; value?:number|string; status?:string; deleted?:boolean }, expected:{id:string;customer:string;reference:string}) {
  return remote.id===expected.id && remote.customer===expected.customer && remote.externalReference===expected.reference && remote.billingType==='PIX' && !remote.deleted && new Decimal(remote.value ?? 0).times(100).equals(ACTIVATION_CENTS) && remote.status==='RECEIVED';
}