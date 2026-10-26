import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireMfaAuth} from './mfa-middleware';
import {validCpf,validCnpj} from './doc-validation';
async function member(context:{supabase:any;userId:string}) {
 const {data,error}=await context.supabase.from('tenant_members').select('tenant_id,role').eq('user_id',context.userId).eq('status','active').maybeSingle();
 if(error || !data || !['owner','admin'].includes(data.role)) throw new Error('Sem permissão para ativar esta conta.');
 return data.tenant_id as string;
}
export const getActivationFee=createServerFn({method:'POST'}).middleware([requireMfaAuth]).handler(async({context})=>{
 const tenantId=await member(context);
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const {data,error}=await admin.from('activation_fee_payments').select('status,provider_payment_id,environment').eq('tenant_id',tenantId).maybeSingle();
 if(error) throw new Error('Não foi possível consultar a ativação.');
 const enabled=process.env['ACTIVATION_FEE_ENABLED']==='true';
 if(enabled){const {announceProductionLaunch}=await import('./production-launch.server');await announceProductionLaunch(admin,20);}
 return {status:data?.status ?? 'not_started',amountCents:1990,environment:data?.environment ?? null,enabled};
});
export const prepareActivationPix=createServerFn({method:'POST'}).middleware([requireMfaAuth]).inputValidator(i=>z.object({name:z.string().trim().min(3).max(150),document:z.string().regex(/^\d{11}$|^\d{14}$/),email:z.string().email().max(200),accepted:z.literal(true)}).strict().parse(i)).handler(async({data,context})=>{
 const tenantId=await member(context);
 if(!validCpf(data.document) && !validCnpj(data.document)) throw new Error('CPF/CNPJ inválido.');
 // Production charging remains closed until approved terms and provider homologation.
 if(process.env['ACTIVATION_FEE_ENABLED']!=='true') throw new Error('A ativação está indisponível no momento.');
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const {activationMaster,activationLookup}=await import('./activation-fee.server');
 const {consumeRateLimit}=await import('./audit.server');
 const limit=await consumeRateLimit(admin,{scope:'activation_fee_prepare',identifier:tenantId,maxAttempts:10,windowSeconds:600,blockSeconds:600});
 if(!limit.allowed) throw new Error('Aguarde alguns minutos antes de tentar novamente.');
 const master=activationMaster(),reference=`activation:${tenantId}`;
 const {error:insertError}=await admin.from('activation_fee_payments').upsert({tenant_id:tenantId,owner_id:context.userId,environment:master.environment,origin_wallet_id:master.wallet,reference,terms_version:'activation-2026-10-nonrefundable'}, {onConflict:'tenant_id',ignoreDuplicates:true});
 if(insertError) throw new Error('Não foi possível preparar a ativação.');
 const {data:row,error}=await admin.from('activation_fee_payments').select('*').eq('tenant_id',tenantId).single();
 if(error || !row) throw new Error('Não foi possível consultar a ativação.');
 if(row.status==='confirmed') return {paid:true,qr:null};
 if(row.environment!==master.environment || row.origin_wallet_id!==master.wallet) throw new Error('A cobrança precisa de conferência.');
 async function obtain(kind:'fee_customer'|'fee_payment',create:()=>Promise<{id:string}>,path:string) {
   const {data:claim,error:claimError}=await admin.rpc('activation_claim_operation',{_tenant:tenantId,_kind:kind,_environment:master.environment,_reference:`${reference}:${kind}`});
   if(claimError || !claim) throw new Error('Não foi possível preparar a cobrança.');
   const op=claim as {claimed:boolean;id:string;provider_id?:string};
   if(op.provider_id) return op.provider_id;
   if(!op.claimed) {
     const found=await activationLookup(path);
     if(found.data?.length===1) {await admin.from('activation_provider_operations').update({state:'created',provider_id:found.data[0].id}).eq('id',op.id);return found.data[0].id as string;}
     throw new Error('A cobrança está em conferência. Não pague novamente.');
   }
   try {
     const result=await create();
     const {error:saveError}=await admin.from('activation_provider_operations').update({state:'created',provider_id:result.id}).eq('id',op.id);
     if(saveError) throw new Error('Conferência necessária.');
     return result.id;
   } catch {await admin.from('activation_provider_operations').update({state:'uncertain'}).eq('id',op.id);throw new Error('A cobrança está em conferência. Não pague novamente.');}
 }
 const customer=row.provider_customer_id ?? await obtain('fee_customer',()=>master.provider.createCustomer({name:data.name,cpfCnpj:data.document,email:data.email,externalReference:reference,notificationDisabled:true}),`/customers?externalReference=${encodeURIComponent(reference)}`);
 const payment=row.provider_payment_id ?? await obtain('fee_payment',()=>master.provider.createPayment({customer,billingType:'PIX',value:19.90,dueDate:new Date(Date.now()+86400000).toISOString().slice(0,10),externalReference:reference,description:'Taxa única de ativação WiizeCore'}),`/payments?externalReference=${encodeURIComponent(reference)}&customer=${encodeURIComponent(customer)}`);
 const {error:updateError}=await admin.from('activation_fee_payments').update({provider_customer_id:customer,provider_payment_id:payment,status:'pending'}).eq('id',row.id).neq('status','confirmed');
 if(updateError) throw new Error('A cobrança está em conferência. Não pague novamente.');
 return {paid:false,qr:await master.provider.getPixQrCode(payment)};
});
export const refreshActivationFee=createServerFn({method:'POST'}).middleware([requireMfaAuth]).handler(async({context})=>{
 const tenantId=await member(context);
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const {consumeRateLimit}=await import('./audit.server');
 const limit=await consumeRateLimit(admin,{scope:'activation_fee_refresh',identifier:tenantId,maxAttempts:20,windowSeconds:600,blockSeconds:60});
 if(!limit.allowed) throw new Error('Aguarde alguns instantes para consultar novamente.');
 const {verifyActivationFee}=await import('./activation-fee.server');
 const row=await verifyActivationFee(admin,tenantId);
 return {status:row?.status ?? 'not_started'};
});