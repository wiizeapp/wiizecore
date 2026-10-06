import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { configureSubscriptionInvoices, getFiscalOverview } from "@/lib/invoices.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RULES = [
  ["ON_PAYMENT_CONFIRMATION", "Após o pagamento"],
  ["ON_PAYMENT_DUE_DATE", "Na data de vencimento"],
  ["BEFORE_PAYMENT_DUE_DATE", "Antes do vencimento"],
  ["ON_DUE_DATE_MONTH", "No mês do vencimento"],
  ["ON_NEXT_MONTH", "No mês seguinte"],
] as const;

/** "Emitir NFS-e automaticamente para esta recorrência" — regra oficial de assinaturas do provedor. */
export function SubscriptionInvoiceDialog({ subscriptionId, onClose }: { subscriptionId: string; onClose: () => void }) {
  const fetchOv = useServerFn(getFiscalOverview);
  const configure = useServerFn(configureSubscriptionInvoices);
  const ov = useQuery({ queryKey: ["fiscal-overview"], queryFn: () => fetchOv() });
  const [fs, setFs] = useState("");
  const [rule, setRule] = useState<(typeof RULES)[number][0]>("ON_PAYMENT_CONFIRMATION");
  const [days, setDays] = useState<5 | 10 | 15 | 30 | 60>(5);
  const [obs, setObs] = useState("");
  const m = useMutation({
    mutationFn: () => configure({ data: { subscriptionId, fiscalServiceId: fs, rule, days: rule === "BEFORE_PAYMENT_DUE_DATE" ? days : null, observations: obs || null } }),
    onSuccess: () => { toast.success("Emissão automática ativada para esta recorrência."); onClose(); },
    onError: (e: Error) => toast.error("Não foi possível ativar", { description: e.message }),
  });
  const services = (ov.data?.services ?? []).filter((s) => s.active);
  const ready = ov.data?.settings?.configStatus === "configured";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Emitir NFS-e automaticamente para esta recorrência</DialogTitle></DialogHeader>
        {!ready && !ov.isLoading ? <p className="text-sm text-muted-foreground">Você precisa concluir sua configuração fiscal antes de emitir notas.</p> : (
          <div className="space-y-4">
            <div><Label>Serviço fiscal</Label>
              <Select value={fs} onValueChange={setFs}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Quando emitir</Label>
              <Select value={rule} onValueChange={(v) => setRule(v as typeof rule)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RULES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
              {rule === "ON_PAYMENT_CONFIRMATION" ? <p className="mt-1 text-xs text-muted-foreground">A NFS-e será processada após a confirmação do pagamento.</p> : null}</div>
            {rule === "BEFORE_PAYMENT_DUE_DATE" ? (
              <div className="flex flex-wrap gap-1.5">{([5, 10, 15, 30, 60] as const).map((n) => (
                <button key={n} type="button" onClick={() => setDays(n)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${days === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n} dias</button>
              ))}</div>
            ) : null}
            <div><Label>Observações (opcional)</Label><Input maxLength={2000} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            <Button className="w-full" onClick={() => m.mutate()} disabled={!fs || m.isPending}>Ativar emissão automática</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
