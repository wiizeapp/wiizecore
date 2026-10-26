import {useEffect,useState} from 'react';
import confetti from 'canvas-confetti';
import {useServerFn} from '@tanstack/react-start';
import {useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {Loader2,PartyPopper,ArrowLeft,ArrowRight,Building2,Headphones,Infinity,ScanFace,Check,Copy,FileCheck2,Lock,QrCode,RefreshCw,Rocket,ShieldCheck,Zap} from 'lucide-react';
import {prepareActivationPix,refreshActivationFee} from '@/lib/activation-fee.functions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Brand} from '@/components/brand';

function celebrate(){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const end=Date.now()+3000;
 const frame=()=>{if(Date.now()>end) return;
  confetti({particleCount:3,angle:60,spread:55,startVelocity:60,origin:{x:0,y:0.6},zIndex:200});
  confetti({particleCount:3,angle:120,spread:55,startVelocity:60,origin:{x:1,y:0.6},zIndex:200});
  requestAnimationFrame(frame);};
 frame();
}

function Price(){
 const {t}=useTranslation('ui');
 return <div className="flex items-center justify-between gap-4">
  <div className="space-y-1">
   <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t('Taxa única de ativação')}</p>
   <p className="text-xs text-muted-foreground">{t('De')} <span className="line-through">R$ 49,90</span> · {t('sem mensalidade')}</p>
  </div>
  <p className="font-display text-4xl font-bold leading-none text-foreground" aria-label="R$ 19,90"><span className="mr-1 text-[0.45em] font-medium text-muted-foreground">R$</span>19<span className="text-[0.45em] font-medium text-muted-foreground">,90</span></p>
 </div>;
}

export function ActivationFeeCheckout(){
 const {t}=useTranslation('ui');const qc=useQueryClient();
 const prepare=useServerFn(prepareActivationPix),refresh=useServerFn(refreshActivationFee);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[document,setDocument]=useState(''),[email,setEmail]=useState(''),[accepted,setAccepted]=useState(false),[copied,setCopied]=useState(false);
 const [step,setStep]=useState<'intro'|'form'>('intro');
 const [qr,setQr]=useState<{encodedImage:string;payload:string}|null>(null);
 const [paid,setPaid]=useState(false);
 async function check(manual:boolean){
  if(manual){setBusy(true);setError('');}
  try{const r=await refresh();if(r.status==='confirmed'){setPaid(true);celebrate();}else if(manual) setError(t('Pagamento ainda pendente.'));}
  catch(e){if(manual) setError(e instanceof Error?t(e.message):t('Não foi possível consultar a ativação.'));}
  finally{if(manual) setBusy(false);}
 }
 useEffect(()=>{if(!open||!qr||paid) return;const id=window.setInterval(()=>void check(false),6000);return ()=>window.clearInterval(id);},[open,qr,paid]);
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
   <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden">
    <div className="min-w-0 space-y-5">
     <Brand className="shrink-0"/>
     <div className="flex gap-1.5" aria-hidden>{[0,1,2].map(i=><span key={i} className={`h-1 flex-1 rounded-full ${i<=(qr?2:step==='form'?1:0)?'bg-primary':'bg-muted'}`}/>)}</div>
     <DialogHeader className="space-y-2 text-left">
      <DialogTitle className="font-display text-xl">{t(qr?'Conclua o pagamento da ativação':step==='form'?'Dados do pagador':'Leve sua conta WiizeCore para produção')}</DialogTitle>
      <DialogDescription>{t(qr?'Escaneie o QR Code no app do seu banco':step==='form'?'Informe apenas os dados do pagador. O cadastro de produção começa após a confirmação do Pix.':'Abra e verifique sua conta de recebimentos. A aprovação final é da instituição parceira.')}</DialogDescription>
     </DialogHeader>
     {paid ? <div className="space-y-5 py-2 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary"><PartyPopper className="size-8"/></div>
      <div className="space-y-1.5"><p className="font-display text-xl font-bold">{t('Pagamento confirmado!')}</p><p className="text-sm text-muted-foreground">{t('Deu tudo certo. Agora envie seus dados e documentos para concluir a ativação da sua conta.')}</p></div>
      <Button className="w-full" size="lg" onClick={()=>{setOpen(false);void qc.invalidateQueries();}}>{t('Enviar documentos')}<ArrowRight className="size-4"/></Button>
     </div> : qr ? <div className="min-w-0 space-y-4">
      <div className="relative mx-auto w-fit rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-3">
       <div className="rounded-xl bg-white p-3 shadow-lg"><img className="size-48" src={qr.encodedImage.startsWith('data:')?qr.encodedImage:`data:image/png;base64,${qr.encodedImage}`} alt={t('QR Code Pix')}/></div>
      </div>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin text-primary"/>{t('Aguardando pagamento...')}</p>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
       <span className="min-w-0 flex-1 truncate font-mono text-xs" aria-label={t('Código Pix copia e cola')}>{qr.payload}</span>
       <Button size="sm" variant="ghost" className="shrink-0" onClick={async()=>{await navigator.clipboard.writeText(qr.payload);setCopied(true);}}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{t(copied?'Código copiado':'Copiar código Pix')}</Button>
      </div>
      <Button className="w-full" variant="outline" disabled={busy} onClick={()=>void check(true)}><RefreshCw className="size-4"/>{t('Consultar pagamento')}</Button>
      <p className="text-center text-[11px] text-muted-foreground">{t('A confirmação pode levar alguns instantes. Não pague novamente.')}</p>
     </div> : step==='intro' ? <div className="space-y-5">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5"><Price/></div>
      <div className="grid grid-cols-2 gap-2">
       {[{i:Building2,x:t('Abertura da conta')},{i:ScanFace,x:t('Verificação de identidade')},{i:Headphones,x:t('Suporte dedicado')},{i:Infinity,x:t('Pagamento único')}].map(({i:I,x})=><div key={x} className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs font-medium"><I className="size-4 shrink-0 text-primary"/>{x}</div>)}
      </div>
      <Button className="w-full" size="lg" onClick={()=>setStep('form')}>{t('Avançar')}<ArrowRight className="size-4"/></Button>
      <Button className="w-full" variant="ghost" onClick={()=>setOpen(false)}>{t('Agora não')}</Button>
     </div> : <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await prepare({data:{name,document:document.replace(/\D/g,''),email,accepted:true}});if(r.paid){setPaid(true);celebrate();}else setQr(r.qr);}catch(e){setError(e instanceof Error?t(e.message):t('Não foi possível preparar a ativação.'));}finally{setBusy(false);}}}>
      <div className="space-y-1.5"><Label htmlFor="payer-name">{t('Nome do pagador')}</Label><Input id="payer-name" value={name} onChange={e=>setName(e.target.value)} required minLength={3} maxLength={150}/></div>
      <div className="space-y-1.5"><Label htmlFor="payer-doc">CPF/CNPJ</Label><Input id="payer-doc" inputMode="numeric" value={document} onChange={e=>setDocument(e.target.value.replace(/\D/g,''))} required pattern="[0-9]{11}|[0-9]{14}" maxLength={14}/></div>
      <div className="space-y-1.5"><Label htmlFor="payer-email">E-mail</Label><Input id="payer-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={200}/></div>
      <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
       <p className="text-xs text-muted-foreground">{t('Taxa única, cobrada uma vez por empresa. Após o envio dos documentos, não é reembolsável, pois o valor custeia a abertura da conta, a análise de documentos e a ativação da infraestrutura de pagamentos. O pagamento não garante aprovação.')}</p>
       <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={v=>setAccepted(v===true)} className="mt-0.5"/><span>{t('Li e concordo com as condições da taxa de ativação, incluindo a não devolução após o envio dos documentos, os')} <a className="text-primary underline" href="/termos-de-uso" target="_blank" rel="noreferrer">{t('Termos de Uso')}</a> {t('e a')} <a className="text-primary underline" href="/politica-de-cancelamento-e-reembolso" target="_blank" rel="noreferrer">{t('Política de Reembolso')}</a>.</span></label>
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
