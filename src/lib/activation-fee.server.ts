import {validActivationPayment} from './activation-fee-policy';
import {AsaasProvider,ASAAS_BASE_URLS} from './asaas.server';
type Admin = typeof import('@/integrations/supabase/client.server')['supabaseAdmin'];
export async function assertActivationPaid(admin:Admin,tenantId:string) {
 const {data,error}=await admin.rpc('activation_fee_paid',{_tenant:tenantId});
 if(error || data!==true) throw new Error('Confirme o pagamento da taxa de ativação antes de continuar.');
}
export function activationMaster() {
 const key=process.env['ASAAS_MASTER_API_KEY'],env=process.env['ASAAS_ENVIRONMENT'],wallet=process.env['ASAAS_MASTER_WALLET_ID'];
 if(!key || !wallet || !['sandbox','production'].includes(env ?? '')) throw new Error('A ativação está indisponível no momento.');
 const environment=env as 'sandbox'|'production';
 return {key,wallet,environment,provider:new AsaasProvider(key,environment)};
}
export async function activationLookup(path:string) {
 const master=activationMaster();
 const r=await fetch(`${ASAAS_BASE_URLS[master.environment]}${path}`,{headers:{access_token:master.key,accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!r.ok) throw new Error('Não foi possível consultar a instituição de pagamento.');
 return r.json();
}
export async function verifyActivationFee(admin:Admin,tenantId:string) {
 const {data:row,error}=await admin.from('activation_fee_payments').select('*').eq('tenant_id',tenantId).maybeSingle();
 if(error) throw new Error('Não foi possível consultar a ativação.');
 if(!row || !row.provider_payment_id || !row.provider_customer_id) return row;
 const master=activationMaster();
 if(row.environment!==master.environment || row.origin_wallet_id!==master.wallet || row.currency!=='BRL') throw new Error('A cobrança precisa de conferência.');
 // GET through the original parent credential proves account ownership; wallet is checked independently.
 const walletInfo=await activationLookup('/wallets');
 if(!walletInfo.data?.some((w:{id:string})=>w.id===row.origin_wallet_id)) throw new Error('A conta de origem precisa de conferência.');
 const remote=await activationLookup(`/payments/${encodeURIComponent(row.provider_payment_id)}`);
 if(validActivationPayment(remote,{id:row.provider_payment_id,customer:row.provider_customer_id,reference:row.reference})) {
   const {data:changed,error:confirmError}=await admin.rpc('activation_confirm_fee',{_id:row.id,_provider:row.provider_payment_id,_cents:1990});
   if(confirmError) throw new Error('O pagamento está em conferência. Não pague novamente.');
   const {notifyTenant}=await import('./notify.server');
   await notifyTenant(admin,{tenantId,kind:'activation.payment_confirmed',title:'Pagamento confirmado',body:'Agora você pode concluir seu cadastro e enviar a documentação necessária.',link:'/ativacao',dedupeKey:`activation.fee:${row.id}`,email:{subject:'WiizeCore — Pagamento confirmado'}});
   const {logAudit}=await import('./audit.server');
   if(changed) await logAudit(admin,{tenantId,action:'activation.fee_confirmed',resource:'activation_fee',resourceId:row.id});
   return {...row,status:'confirmed'};
 }
 if(['REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS'].includes(remote.status)) {
   const next=remote.status==='REFUNDED'?'refunded':'refund_pending';
   const {error:refundError}=await admin.from('activation_fee_payments').update({status:next,updated_at:new Date().toISOString()}).eq('id',row.id);
   if(refundError) throw new Error('O pagamento está em conferência. Não pague novamente.');
   return {...row,status:next};
 }
 return row;
}