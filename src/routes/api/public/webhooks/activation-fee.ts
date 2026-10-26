import {createFileRoute} from '@tanstack/react-router';
import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
export const Route=createFileRoute('/api/public/webhooks/activation-fee')({server:{handlers:{POST:async({request})=>{
 const secret=process.env['ASAAS_ACTIVATION_WEBHOOK_SECRET'];
 if(!secret) return new Response('Unavailable',{status:503});
 const supplied=request.headers.get('asaas-access-token') ?? '';
 const hash=(s:string)=>createHash('sha256').update(s).digest();
 if(!supplied || !timingSafeEqual(hash(secret),hash(supplied))) return new Response('Unauthorized',{status:401});
 const raw=await request.text();if(raw.length>200000) return new Response('Too large',{status:413});
 let event;try{event=z.object({id:z.string().min(1).max(200),event:z.string().min(1).max(100),payment:z.object({id:z.string().min(1).max(100)})}).parse(JSON.parse(raw));}catch{return new Response('Invalid',{status:400});}
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const {data:payment,error}=await admin.from('activation_fee_payments').select('id,tenant_id').eq('provider_payment_id',event.payment.id).maybeSingle();
 if(error) return new Response('Retry',{status:503});
 if(!payment) return new Response('Ignored',{status:200});
 const {error:insertError}=await admin.from('activation_fee_events').insert({external_id:event.id,payment_id:payment.id,event_type:event.event});
 if(insertError && insertError.code!=='23505') return new Response('Retry',{status:503});
 try{
  const {verifyActivationFee}=await import('@/lib/activation-fee.server');await verifyActivationFee(admin,payment.tenant_id);
  const {error:saveError}=await admin.from('activation_fee_events').update({state:'processed',processed_at:new Date().toISOString()}).eq('external_id',event.id);
  if(saveError) return new Response('Retry',{status:503});
  return new Response('OK');
 }catch{await admin.from('activation_fee_events').update({state:'failed',error_code:'verification_unavailable'}).eq('external_id',event.id);return new Response('Retry',{status:503});}
}}}});