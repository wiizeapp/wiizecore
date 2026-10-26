import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/cron/activation-fee')({server:{handlers:{POST:async({request})=>{
 const {authenticateWiizePayCron}=await import('@/lib/cron-auth.server');const denied=authenticateWiizePayCron(request);if(denied)return denied;
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const {data,error}=await admin.from('activation_fee_payments').select('tenant_id').in('status',['pending','uncertain','confirmed']).order('updated_at').limit(20);
 if(error)return Response.json({error:'Unavailable'},{status:503});
 const {verifyActivationFee}=await import('@/lib/activation-fee.server');let checked=0,failed=0;
 for(const row of data ?? [])try{await verifyActivationFee(admin,row.tenant_id);checked++;await admin.from('activation_fee_payments').update({updated_at:new Date().toISOString()}).eq('tenant_id',row.tenant_id);}catch{failed++;}
 const {announceProductionLaunch}=await import('@/lib/production-launch.server');const launch=await announceProductionLaunch(admin);
 return Response.json({checked,failed,announced:launch.sent},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
}}}});