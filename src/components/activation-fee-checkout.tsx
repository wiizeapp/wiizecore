import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {Copy,RefreshCw,ShieldCheck} from 'lucide-react';
import {prepareActivationPix,refreshActivationFee} from '@/lib/activation-fee.functions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export function ActivationFeeCheckout(){
 const {t}=useTranslation('ui');const qc=useQueryClient();
 const prepare=useServerFn(prepareActivationPix),refresh=useServerFn(refreshActivationFee);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[document,setDocument]=useState(''),[email,setEmail]=useState(''),[accepted,setAccepted]=useState(false),[copied,setCopied]=useState(false);
 const [qr,setQr]=useState<{encodedImage:string;payload:string}|null>(null);
 return <section className="py-6 space-y-5">
 <ShieldCheck className="size-8 text-primary"/><h2 className="text-xl font-semibold">{t('Ambiente de testes')}</h2>
 <p className="text-muted-foreground">{t('Sua conta ainda não está habilitada para operar em produção.')}</p>
 <Button onClick={()=>setOpen(true)}>{t('Ativar produção')}</Button>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{t(qr?'Conclua o pagamento da ativação':'Leve sua conta WiizeCore para produção')}</DialogTitle><DialogDescription>{t('O pagamento permite continuar o cadastro. A produção depende da análise e aprovação da Asaas.')}</DialogDescription></DialogHeader>
 <div className="border-y border-border py-5"><p className="text-sm text-muted-foreground">{t('Taxa única de ativação')}</p><p className="text-3xl font-semibold">R$ 19,90</p><p className="text-sm">{t('Pagamento via Pix. Sem mensalidade de ativação.')}</p></div>
 {qr ? <div className="space-y-4"><img className="mx-auto size-56" src={`data:image/png;base64,${qr.encodedImage}`} alt={t('QR Code Pix')}/><Input aria-label={t('Código Pix copia e cola')} readOnly value={qr.payload}/><Button variant="outline" onClick={async()=>{await navigator.clipboard.writeText(qr.payload);setCopied(true);}}><Copy className="size-4"/>{t(copied?'Código copiado':'Copiar código Pix')}</Button><p className="text-sm text-muted-foreground">{t('A confirmação pode levar alguns instantes. Não pague novamente.')}</p><Button disabled={busy} onClick={async()=>{setBusy(true);try{const r=await refresh();if(r.status==='confirmed'){await qc.invalidateQueries();setOpen(false);}else setError(t('Pagamento ainda pendente.'));}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível consultar a ativação.'));}finally{setBusy(false);}}}><RefreshCw className="size-4"/>{t('Consultar pagamento')}</Button></div> : <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await prepare({data:{name,document:document.replace(/\D/g,''),email,accepted:true}});if(r.paid) await qc.invalidateQueries();else setQr(r.qr);}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível preparar a ativação.'));}finally{setBusy(false);}}}>
 <p className="text-sm">{t('Informe apenas os dados do pagador. O cadastro de produção começa após a confirmação do Pix.')}</p>
 <Label htmlFor="payer-name">{t('Nome do pagador')}</Label><Input id="payer-name" value={name} onChange={e=>setName(e.target.value)} required minLength={3} maxLength={150}/>
 <Label htmlFor="payer-doc">CPF/CNPJ</Label><Input id="payer-doc" value={document} onChange={e=>setDocument(e.target.value.replace(/\D/g,''))} required pattern="[0-9]{11}|[0-9]{14}" maxLength={14}/>
 <Label htmlFor="payer-email">E-mail</Label><Input id="payer-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={200}/>
 <p className="text-xs text-muted-foreground">{t('Taxa única não reembolsável conforme as condições aplicáveis, preservados os direitos legais. O pagamento não garante aprovação.')}</p>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={v=>setAccepted(v===true)}/><span>{t('Li as condições de ativação e os termos de uso.')}</span></label><a className="text-sm text-primary underline" href="/termos-de-uso" target="_blank" rel="noreferrer">{t('Consultar termos de uso')}</a>
 <div className="flex flex-wrap gap-2"><Button disabled={busy||!accepted} type="submit">{t('Continuar para pagamento')}</Button><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>{t('Agora não')}</Button></div></form>}
 {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
 </DialogContent></Dialog></section>;
}