import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CreditCard, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { payCheckoutWithCard } from "@/lib/checkout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBRL } from "@/lib/format";

const fmtNumber = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
const fmtExpiry = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

/** Formulário de cartão: os dados vão direto para o processador e são apagados da tela ao enviar. */
export function CardPaymentForm({ token, paymentId, amount, disabled, onDone }: { token: string; paymentId: string; amount: number; disabled: boolean; onDone: () => void }) {
  const pay = useServerFn(payCheckoutWithCard);
  const [holderName, setHolderName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [ccv, setCcv] = useState("");
  const [sameHolder, setSameHolder] = useState(true);
  const [holderDocument, setHolderDocument] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      const [mm, yy] = expiry.split("/");
      return pay({ data: { token, paymentId, holderName, number, expiryMonth: mm ?? "", expiryYear: yy ? `20${yy}` : "", ccv, holderDocument: sameHolder ? "" : holderDocument } });
    },
    onSuccess: () => { setNumber(""); setCcv(""); setExpiry(""); setDone(true); onDone(); },
    onError: (e: Error) => { setCcv(""); toast.error(e.message.startsWith("[") ? "Confira os dados do cartão." : e.message); },
  });

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
        <div><p className="font-semibold">Pagamento enviado</p><p className="mt-1 text-xs text-muted-foreground">Estamos aguardando a confirmação da operadora. Esta página atualiza sozinha.</p></div>
      </div>
    );
  }

  const ready = holderName.trim().length >= 3 && number.replace(/\D/g, "").length >= 13 && expiry.length === 5 && ccv.length >= 3 && (sameHolder || holderDocument.replace(/\D/g, "").length >= 11);

  return (
    <form className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6" autoComplete="on" onSubmit={(e) => { e.preventDefault(); if (ready) mutation.mutate(); }}>
      <div className="space-y-1.5">
        <Label htmlFor="cc-number">Número do cartão</Label>
        <div className="relative">
          <CreditCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="cc-number" className="h-11 pl-9 font-mono tracking-wider" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={number} onChange={(e) => setNumber(fmtNumber(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cc-name">Nome impresso no cartão</Label>
        <Input id="cc-name" className="h-11 uppercase" autoComplete="cc-name" value={holderName} onChange={(e) => setHolderName(e.target.value.slice(0, 100))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="cc-exp">Validade</Label><Input id="cc-exp" className="h-11" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={expiry} onChange={(e) => setExpiry(fmtExpiry(e.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="cc-csc">Código (CVV)</Label><Input id="cc-csc" className="h-11" type="password" inputMode="numeric" autoComplete="cc-csc" placeholder="•••" value={ccv} onChange={(e) => setCcv(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/40 p-3.5 text-sm leading-5"><Checkbox className="mt-0.5" checked={sameHolder} onCheckedChange={(c) => setSameHolder(c === true)} />O titular do cartão sou eu (mesmo CPF/CNPJ da cobrança)</label>
      {!sameHolder ? <div className="space-y-1.5"><Label htmlFor="cc-doc">CPF ou CNPJ do titular</Label><Input id="cc-doc" className="h-11" inputMode="numeric" value={holderDocument} onChange={(e) => setHolderDocument(e.target.value.replace(/\D/g, "").slice(0, 14))} /></div> : null}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={disabled || !ready || mutation.isPending}>
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
        {mutation.isPending ? "Processando…" : `Pagar ${formatBRL(amount)}`}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground"><LockKeyhole className="size-3" />Os dados do cartão vão direto para o processador e não ficam salvos.</p>
    </form>
  );
}
