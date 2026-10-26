import {describe,it,expect} from 'vitest';
import {validActivationPayment,ACTIVATION_CENTS} from './activation-fee-policy';
const expected={id:'pay_1',customer:'cus_1',reference:'activation:1'};
const paid={...expected,externalReference:expected.reference,billingType:'PIX',value:'19.90',status:'RECEIVED'};
describe('activation fee rules',()=>{
 it('requires exactly R$19.90',()=>{expect(ACTIVATION_CENTS).toBe(1990);expect(validActivationPayment(paid,expected)).toBe(true);expect(validActivationPayment({...paid,value:'19.89'},expected)).toBe(false);});
 it('rejects pending or merely confirmed states',()=>{for(const status of ['PENDING','CONFIRMED','OVERDUE']) expect(validActivationPayment({...paid,status},expected)).toBe(false);});
 it('rejects another charge, payer or purpose',()=>{for(const change of [{id:'other'},{customer:'other'},{externalReference:'other'},{billingType:'BOLETO'},{deleted:true}]) expect(validActivationPayment({...paid,...change},expected)).toBe(false);});
});