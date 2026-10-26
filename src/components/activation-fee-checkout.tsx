import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {BadgeCheck,Check,Copy,FileCheck2,Lock,QrCode,RefreshCw,Rocket,ShieldCheck,Zap} from 'lucide-react';
import {prepareActivationPix,refreshActivationFee} from '@/lib/activation-fee.functions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Brand} from '@/components/brand';
import {MoneyValue} from '@/components/dashboard/money-value';

function Price({compact=false}:{compact?:boolean}){
 const {t}=useTranslation('ui');
 return <div className={compact?'':'space-y-1'}>
  <p className="text-xs text-muted-foreground">{t('De')} <span className="line-through">R$ 49,90</span> {t('por apenas')}</p>
  <p className={`font-display font-bold text-foreground ${compact?'text-3xl':'text-4xl'}`}><MoneyValue value="R$ 19,90" accentCents/></p>
  <p className="text-xs text-muted-foreground">{t('Taxa única via Pix. Sem mensalidade.')}</p>
 </div>;
}

export function ActivationFeeCheckout(){
 const {t}=useTranslation('ui');const qc=useQueryClient();
 const prepare=useServerFn(prepareActivationPix),refresh=useServerFn(refreshActivationFee);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[document,setDocument]=useState(''),[email,setEmail]=useState(''),[accepted,setAccepted]=useState(false),[copied,setCopied]=useState(false);
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
     <Price/>
     <Button size="lg" className="w-full" onClick={()=>setOpen(true)}><Rocket className="size-4"/>{t('Ativar produção')}</Button>
     <p className="text-center text-[11px] text-muted-foreground">{t('O pagamento não garante aprovação.')}</p>
    </div>
   </div>
  </div>

  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
    <div className="grid md:grid-cols-[0.9fr_1.1fr]">
     <aside className="space-y-5 border-b border-border bg-muted/40 p-6 md:border-b-0 md:border-r">
      <Brand className="shrink-0"/>
      <DialogHeader className="space-y-2 text-left">
       <DialogTitle className="font-display text-xl">{t(qr?'Conclua o pagamento da ativação':'Leve sua conta WiizeCore para produção')}</DialogTitle>
       <DialogDescription>{t('O pagamento permite continuar o cadastro. A produção depende da análise e aprovação da Asaas.')}</DialogDescription>
      </DialogHeader>
      <div className="rounded-xl border border-primary/25 bg-background p-4"><Price compact/></div>
      <ol className="space-y-3 text-sm">
       {[t('Pague a taxa única via Pix'),t('Complete o cadastro e envie os documentos'),t('Aguarde a análise e comece a receber')].map((s,i)=><li key={s} className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i+1}</span><span>{s}</span>
       </li>)}
      </ol>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><BadgeCheck className="size-4 text-primary"/>{t('Pagamento seguro processado pela Asaas.')}</p>
     </aside>

     <div className="p-6">
      {qr ? <div className="space-y-4">
       <p className="flex items-center gap-2 text-sm font-semibold"><QrCode className="size-4 text-primary"/>{t('Escaneie o QR Code no app do seu banco')}</p>
       <img className="mx-auto size-52 rounded-xl border border-border bg-white p-2" src={`data:image/png;base64,${qr.encodedImage}`} alt={t('QR Code Pix')}/>
       <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
        <span className="flex-1 truncate font-mono text-xs" aria-label={t('Código Pix copia e cola')}>{qr.payload}</span>
        <Button size="sm" variant="ghost" onClick={async()=>{await navigator.clipboard.writeText(qr.payload);setCopied(true);}}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{t(copied?'Código copiado':'Copiar código Pix')}</Button>
       </div>
       <p className="text-xs text-muted-foreground">{t('A confirmação pode levar alguns instantes. Não pague novamente.')}</p>
       <Button className="w-full" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await refresh();if(r.status==='confirmed'){await qc.invalidateQueries();setOpen(false);}else setError(t('Pagamento ainda pendente.'));}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível consultar a ativação.'));}finally{setBusy(false);}}}><RefreshCw className="size-4"/>{t('Consultar pagamento')}</Button>
      </div> : <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await prepare({data:{name,document:document.replace(/\D/g,''),email,accepted:true}});if(r.paid) await qc.invalidateQueries();else setQr(r.qr);}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível preparar a ativação.'));}finally{setBusy(false);}}}>
       <p className="text-sm text-muted-foreground">{t('Informe apenas os dados do pagador. O cadastro de produção começa após a confirmação do Pix.')}</p>
       <div className="space-y-1.5"><Label htmlFor="payer-name">{t('Nome do pagador')}</Label><Input id="payer-name" value={name} onChange={e=>setName(e.target.value)} required minLength={3} maxLength={150}/></div>
       <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="payer-doc">CPF/CNPJ</Label><Input id="payer-doc" inputMode="numeric" value={document} onChange={e=>setDocument(e.target.value.replace(/\D/g,''))} required pattern="[0-9]{11}|[0-9]{14}" maxLength={14}/></div>
        <div className="space-y-1.5"><Label htmlFor="payer-email">E-mail</Label><Input id="payer-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={200}/></div>
       </div>
       <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t('Taxa única não reembolsável conforme as condições aplicáveis, preservados os direitos legais. O pagamento não garante aprovação.')}</p>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={v=>setAccepted(v===true)} className="mt-0.5"/><span>{t('Li as condições de ativação e os termos de uso.')} <a className="text-primary underline" href="/termos-de-uso" target="_blank" rel="noreferrer">{t('Consultar termos de uso')}</a></span></label>
       </div>
       <Button className="w-full" size="lg" disabled={busy||!accepted} type="submit"><QrCode className="size-4"/>{t('Continuar para pagamento')}</Button>
       <Button className="w-full" type="button" variant="ghost" onClick={()=>setOpen(false)}>{t('Agora não')}</Button>
      </form>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
     </div>
    </div>
   </DialogContent>
  </Dialog>
 </section>;
}
