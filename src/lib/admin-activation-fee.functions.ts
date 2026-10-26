import {createServerFn} from '@tanstack/react-start';
import {requireMfaAuth} from './mfa-middleware';
export const listAdminActivationFees=createServerFn({method:'POST'}).middleware([requireMfaAuth]).handler(async({context})=>{
 const {assertAdminPage}=await import('./admin-session.server');const {admin}=await assertAdminPage(context);
 const {data,error}=await admin.from('activation_fee_payments').select('id,tenant_id,status,environment,provider_payment_id,amount_cents,confirmed_amount_cents,confirmed_at,created_at').order('created_at',{ascending:false}).limit(100);
 if(error)throw new Error('Não foi possível consultar a ativação.');return data ?? [];
});