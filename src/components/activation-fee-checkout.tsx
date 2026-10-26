import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {ArrowLeft,ArrowRight,Check,Copy,FileCheck2,Lock,QrCode,RefreshCw,Rocket,ShieldCheck,Zap} from 'lucide-react';
import {prepareActivationPix,refreshActivationFee} from '@/lib/activation-fee.functions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Brand} from '@/components/brand';

function Price({compact=false}:{compact?:boolean}){
 const {t}=useTranslation('ui');
 return <div className={compact?'':'space-y-1'}>
  <p className="text-xs text-muted-foreground">{t('De')} <span className="line-through">R$ 49,90</span> {t('por apenas')}</p>
  <p className={`font-display font-bold text-foreground ${compact?'text-5xl':'text-5xl'}`} aria-label="R$ 19,90"><span className="mr-1 text-[0.52em] font-medium text-muted-foreground">R$</span>19<span className="text-[0.52em] font-medium text-muted-foreground">,90</span></p>
  <p className="text-xs text-muted-foreground">{t('Pagamento único via Pix. Sem mensalidade e sem renovação.')}</p>
 </div>;
}

export function ActivationFeeCheckout(){
 const {t}=useTranslation('ui');const qc=useQueryClient();
 const prepare=useServerFn(prepareActivationPix),refresh=useServerFn(refreshActivationFee);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[document,setDocument]=useState(''),[email,setEmail]=useState(''),[accepted,setAccepted]=useState(false),[copied,setCopied]=useState(false);
 const [step,setStep]=useState<'intro'|'form'>('intro');
 const [qr,setQr]=useState<{encodedImage:string;payload:string}|null>(null);
 const benefits=[
  {icon:Zap,title:t('Receba de verdade'),text:t('Cobranças reais por Pix, boleto e cartão.')},
  {icon:FileCheck2,title:t('Cadastro guiado'),text:t('Envie seus dados e documentos com segurança.')},
  {icon:Lock,title:t('Conta protegida'),text:t('Análise feita pela instituição de pagamento parceira.')},
 ];
 return <section className="py-6">
  <div className="surface-panel overflow-hidden">
   <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1.4fr_1fr]">
    <div className="space-y-5">
     <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><ShieldCheck className="size-3.5"/>{t('Ambiente de testes')}</span>
     <div>
      <h2 className="font-display text-2xl font-bold">{t('Ative sua conta para receber de verdade')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('Sua conta ainda não está habilitada para operar em produção.')}</p>
     </div>
     <ul className="grid gap-3 sm:grid-cols-3">
      {benefits.map(b=><li key={b.title} className="rounded-xl border border-border bg-muted/40 p-4">
       <b.icon className="size-5 text-primary"/>
       <p className="mt-2 text-sm font-semibold">{b.title}</p>
       <p className="mt-1 text-xs text-muted-foreground">{b.text}</p>
      </li>)}
     </ul>
    </div>
    <div className="flex flex-col justify-center gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-6">
     <p className="text-sm font-semibold">{t('Como funciona a ativação')}</p>
     <ol className="space-y-3 text-sm text-muted-foreground">
      {[t('Inicie a ativação da sua conta'),t('Envie seus dados e documentos'),t('Após a aprovação, comece a receber')].map((x,i)=><li key={x} className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i+1}</span>{x}</li>)}
     </ol>
     <Button size="lg" className="w-full" onClick={()=>{setStep('intro');setOpen(true);}}><Rocket className="size-4"/>{t('Ativar produção')}</Button>
    </div>
   </div>
  </div>

  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
    <div className="space-y-5">
     <Brand className="shrink-0"/>
     <div className="flex gap-1.5" aria-hidden>{[0,1,2].map(i=><span key={i} className={`h-1 flex-1 rounded-full ${i<=(qr?2:step==='form'?1:0)?'bg-primary':'bg-muted'}`}/>)}</div>
     <DialogHeader className="space-y-2 text-left">
      <DialogTitle className="font-display text-xl">{t(qr?'Conclua o pagamento da ativação':step==='form'?'Dados do pagador':'Leve sua conta WiizeCore para produção')}</DialogTitle>
      <DialogDescription>{t(qr?'Escaneie o QR Code no app do seu banco':step==='form'?'Informe apenas os dados do pagador. O cadastro de produção começa após a confirmação do Pix.':'Uma taxa única que cobre a abertura e a verificação da sua conta de recebimentos. A aprovação final é feita pela instituição de pagamento parceira.')}</DialogDescription>
     </DialogHeader>
     {qr ? <div className="space-y-4">
      <img className="mx-auto size-52 rounded-xl border border-border bg-white p-2" src={`data:image/png;base64,${qr.encodedImage}`} alt={t('QR Code Pix')}/>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
       <span className="flex-1 truncate font-mono text-xs" aria-label={t('Código Pix copia e cola')}>{qr.payload}</span>
       <Button size="sm" variant="ghost" onClick={async()=>{await navigator.clipboard.writeText(qr.payload);setCopied(true);}}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{t(copied?'Código copiado':'Copiar código Pix')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('A confirmação pode levar alguns instantes. Não pague novamente.')}</p>
      <Button className="w-full" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await refresh();if(r.status==='confirmed'){await qc.invalidateQueries();setOpen(false);}else setError(t('Pagamento ainda pendente.'));}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível consultar a ativação.'));}finally{setBusy(false);}}}><RefreshCw className="size-4"/>{t('Consultar pagamento')}</Button>
     </div> : step==='intro' ? <div className="space-y-5">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><Price compact/></div>
      <div className="space-y-2">
       <p className="text-sm font-semibold">{t('O que está incluído na taxa única')}</p>
       <ul className="space-y-2 text-sm text-muted-foreground">
        {[t('Abertura da sua conta de recebimentos com a instituição de pagamento parceira'),t('Verificação de identidade e análise dos seus documentos'),t('Suporte durante todo o processo de ativação'),t('Uso vitalício da conta, sem mensalidade')].map(x=><li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary"/>{x}</li>)}
       </ul>
      </div>
      <Button className="w-full" size="lg" onClick={()=>setStep('form')}>{t('Avançar')}<ArrowRight className="size-4"/></Button>
      <Button className="w-full" variant="ghost" onClick={()=>setOpen(false)}>{t('Agora não')}</Button>
     </div> : <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await prepare({data:{name,document:document.replace(/\D/g,''),email,accepted:true}});if(r.paid){await qc.invalidateQueries();setOpen(false);}else setQr(r.qr);}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível preparar a ativação.'));}finally{setBusy(false);}}}>
      <div className="space-y-1.5"><Label htmlFor="payer-name">{t('Nome do pagador')}</Label><Input id="payer-name" value={name} onChange={e=>setName(e.target.value)} required minLength={3} maxLength={150}/></div>
      <div className="space-y-1.5"><Label htmlFor="payer-doc">CPF/CNPJ</Label><Input id="payer-doc" inputMode="numeric" value={document} onChange={e=>setDocument(e.target.value.replace(/\D/g,''))} required pattern="[0-9]{11}|[0-9]{14}" maxLength={14}/></div>
      <div className="space-y-1.5"><Label htmlFor="payer-email">E-mail</Label><Input id="payer-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={200}/></div>
      <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
       <p className="text-xs text-muted-foreground">{t('Taxa única não reembolsável conforme as condições aplicáveis, preservados os direitos legais. O pagamento não garante aprovação.')}</p>
       <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={v=>setAccepted(v===true)} className="mt-0.5"/><span>{t('Li as condições de ativação e os termos de uso.')} <a className="text-primary underline" href="/termos-de-uso" target="_blank" rel="noreferrer">{t('Consultar termos de uso')}</a></span></label>
      </div>
      <Button className="w-full" size="lg" disabled={busy||!accepted} type="submit"><QrCode className="size-4"/>{t('Gerar Pix')}</Button>
      <Button className="w-full" type="button" variant="ghost" onClick={()=>setStep('intro')}><ArrowLeft className="size-4"/>{t('Voltar')}</Button>
     </form>}
     {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
   </DialogContent>
  </Dialog>
 </section>;
}
