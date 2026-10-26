import {describe,it,expect,vi} from 'vitest';
import {assertActivationPaid} from './activation-fee.server';
describe('server activation fee boundary',()=>{
 it('rejects missing payment regardless of browser state',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:false,error:null});
  await expect(assertActivationPaid({rpc} as never,'tenant-one')).rejects.toThrow('taxa de ativação');
  expect(rpc).toHaveBeenCalledWith('activation_fee_paid',{_tenant:'tenant-one'});
 });
 it('fails closed on database failure',async()=>{
  await expect(assertActivationPaid({rpc:vi.fn().mockResolvedValue({data:true,error:{code:'failure'}})} as never,'tenant-one')).rejects.toThrow();
 });
 it('accepts only authoritative boolean true',async()=>{
  await expect(assertActivationPaid({rpc:vi.fn().mockResolvedValue({data:true,error:null})} as never,'tenant-one')).resolves.toBeUndefined();
  await expect(assertActivationPaid({rpc:vi.fn().mockResolvedValue({data:'true',error:null})} as never,'tenant-one')).rejects.toThrow();
 });
});