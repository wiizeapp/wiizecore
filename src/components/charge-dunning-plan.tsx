import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, HelpCircle, Mail, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { changeChargeDunningPlan, getChargeDunningPlan } from "@/lib/dunning.functions";

export type DunningPlanChoice = "essential" | "smart" | "intensive";

const CHANNEL = { whatsapp: { icon: MessageCircle, label: "WhatsApp" }, sms: { icon: MessageSquare, label: "SMS" }, email: { icon: Mail, label: "E-mail" }, voice: { icon: Phone, label: "Ligação" } } as const;

export const PLAN_INFO: Record<DunningPlanChoice, { name: string; price: string; channels: (keyof typeof CHANNEL)[]; summary: string }> = {
  essential: { name: "Essencial", price: "R$ 0,99", channels: ["whatsapp"], summary: "Só WhatsApp" },
  smart: { name: "Inteligente", price: "R$ 2,99", channels: ["whatsapp", "sms", "email"], summary: "WhatsApp + SMS + E-mail" },
  intensive: { name: "Intensivo", price: "R$ 3,99", channels: ["whatsapp", "sms", "email", "voice"], summary: "WhatsApp + SMS + E-mail + Ligação" },
};

export function ChannelChips({ channels }: { channels: readonly (keyof typeof CHANNEL)[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {channels.map((c, i) => {
        const Icon = CHANNEL[c].icon;
        return (
          <span key={c} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-xs font-bold text-primary">+</span> : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"><Icon className="size-3" />{CHANNEL[c].label}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Seletor de plano usado na criação da cobrança. `null` = padrão da empresa. */
export function DunningPlanPicker({ value, onChange }: { value: DunningPlanChoice | null; onChange: (v: DunningPlanChoice | null) => void }) {
  const options: (DunningPlanChoice | null)[] = [null, "essential", "smart", "intensive"];
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <Label>Lembretes desta cobrança</Label>
      <p className="text-xs text-muted-foreground">Os avisos de lembrete chegam ao cliente em parceria com o Asaas, que cuida da entrega das mensagens.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <div key={o ?? "default"} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
              <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-0 py-2 text-left text-xs font-semibold hover:bg-transparent" onClick={() => onChange(o)}>
                <span className="truncate">{o ? `${PLAN_INFO[o].name} · ${PLAN_INFO[o].price}` : "Padrão da empresa"}</span>
                {active ? <Check className="ml-auto size-3.5 shrink-0 text-primary" /> : null}
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Detalhes de ${o ? PLAN_INFO[o].name : "Padrão da empresa"}`}><HelpCircle className="size-4" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-2 text-sm" align="end">
                  <p className="font-semibold">{o ? `${PLAN_INFO[o].name} · ${PLAN_INFO[o].price}` : "Padrão da empresa"}</p>
                  {o ? <><p className="text-muted-foreground">{PLAN_INFO[o].summary}</p><ChannelChips channels={PLAN_INFO[o].channels} /></> : <p className="text-muted-foreground">Usa o plano salvo em Lembretes de cobrança.</p>}
                  <p className="text-xs text-muted-foreground">O valor é cobrado por parcela ou ciclo desta cobrança.</p>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Vale só para esta cobrança. O valor é descontado por parcela ou ciclo.</p>
    </div>
  );
}

/** Diálogo para trocar o plano de uma cobrança já criada (pede senha financeira). */
export function ChangeChargeDunningDialog({ chargeGroupId, onClose }: { chargeGroupId: string | null; onClose: () => void }) {
  const getPlan = useServerFn(getChargeDunningPlan);
  const change = useServerFn(changeChargeDunningPlan);
  const qc = useQueryClient();
  const [plan, setPlan] = useState<DunningPlanChoice | null>(null);
  const [password, setPassword] = useState("");
  const { data } = useQuery({
    queryKey: ["charge-dunning-plan", chargeGroupId],
    enabled: !!chargeGroupId,
    queryFn: () => getPlan({ data: { chargeGroupId: chargeGroupId! } }),
  });
  const current = data?.plan ?? null;
  const selected = plan ?? current;
  const mut = useMutation({
    mutationFn: () => change({ data: { chargeGroupId: chargeGroupId!, plan: selected!, financialPassword: password } }),
    onSuccess: (r) => {
      toast.success(r.diff > 0 ? `Plano alterado. Diferença de R$ ${r.diff.toFixed(2).replace(".", ",")} descontada.` : r.diff < 0 ? "Plano alterado. A diferença voltou para o seu saldo." : "Plano alterado.");
      void qc.invalidateQueries({ queryKey: ["charge-dunning-plan", chargeGroupId] });
      close();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível trocar o plano."),
  });
  const close = () => { setPlan(null); setPassword(""); onClose(); };
  return (
    <Dialog open={!!chargeGroupId} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lembretes desta cobrança</DialogTitle>
          <DialogDescription>Troque o plano só desta cobrança. Parcelas em aberto pagam ou recebem de volta a diferença.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(Object.keys(PLAN_INFO) as DunningPlanChoice[]).map((code) => (
            <button key={code} type="button" onClick={() => setPlan(code)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${selected === code ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
              <span className="space-y-1">
                <span className="block text-sm font-semibold">{PLAN_INFO[code].name} · {PLAN_INFO[code].price}{current === code ? <span className="ml-2 text-xs font-normal text-muted-foreground">(atual)</span> : null}</span>
                <ChannelChips channels={PLAN_INFO[code].channels} />
              </span>
              {selected === code ? <Check className="size-4 text-primary" /> : null}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="charge-dunning-pass">Senha financeira</Label>
          <Input id="charge-dunning-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button disabled={!selected || selected === current || !password || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Salvando…" : "Confirmar troca"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
