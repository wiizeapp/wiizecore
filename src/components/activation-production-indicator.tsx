import {Link} from '@tanstack/react-router';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {useTranslation} from 'react-i18next';
import {getActivationFee} from '@/lib/activation-fee.functions';
import {Button} from '@/components/ui/button';
export function ActivationProductionIndicator(){
 const {t}=useTranslation('ui'),read=useServerFn(getActivationFee);
 const {data}=useQuery({queryKey:['activation-fee'],queryFn:()=>read(),staleTime:60000});
 if(!data || data.status==='confirmed') return null;
 return <Button variant="outline" size="sm" asChild><Link to="/ativacao">{t('Ativar produção')}</Link></Button>;
}