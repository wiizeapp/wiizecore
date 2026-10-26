import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {useTranslation} from 'react-i18next';
import {listAdminActivationFees} from '@/lib/admin-activation-fee.functions';
import {DataTableShell,TableRowsSkeleton,ErrorState} from '@/components/ds';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
export function ActivationFeeTable(){
 const {t}=useTranslation('ui');const read=useServerFn(listAdminActivationFees);
 const {data,isError,refetch}=useQuery({queryKey:['admin-activation-fees'],queryFn:()=>read()});
 if(isError)return <ErrorState onRetry={()=>refetch()}/>;
 if(!data)return <Table><TableBody><TableRowsSkeleton cols={4}/></TableBody></Table>;
 const labels:Record<string,string>={not_started:'Não iniciado',pending:'Pagamento pendente',confirmed:'Pagamento confirmado',uncertain:'Em conferência',divergent:'Divergência',refunded:'Reembolsado',refund_pending:'Reembolso pendente'};
 return <div className="space-y-3"><h2 className="font-semibold">{t('Taxas de ativação')}</h2><DataTableShell><Table><TableHeader><TableRow><TableHead>{t('Referência da empresa')}</TableHead><TableHead>{t('Situação')}</TableHead><TableHead>{t('Ambiente')}</TableHead><TableHead>{t('Cobrança Asaas')}</TableHead></TableRow></TableHeader><TableBody>{data.length===0?<TableRow><TableCell colSpan={4}>{t('Nenhuma cobrança de ativação.')}</TableCell></TableRow>:data.map(row=><TableRow key={row.id}><TableCell className="font-mono text-xs">{row.tenant_id.slice(0,8)}</TableCell><TableCell>{t(labels[row.status] ?? 'Em conferência')}</TableCell><TableCell>{row.environment==='sandbox'?t('Ambiente de testes'):t('Produção')}</TableCell><TableCell>{row.provider_payment_id ?? '—'}</TableCell></TableRow>)}</TableBody></Table></DataTableShell></div>;
}