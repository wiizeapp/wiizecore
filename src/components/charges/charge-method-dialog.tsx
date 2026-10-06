import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getChargeTimeline, providerSwitchMethod } from "@/lib/charge-attempts.functions";
import { formatBRL, formatDateTime } from "@/lib/format";

const METHOD: Record<string, string> = { pix: "Pix", boleto: "Boleto", credit_card: "Cartão de crédito", debit_card: "Débito" };
const ATTEMPT_STATUS: Record<string, string> = { pending: "Em andamento", active: "Atual", superseded: "Substituída", paid: "Paga", failed: "Falhou", cancelled: "Cancelada" };
const REASON: Record<string, string> = { original: "Original", method_change: "Troca de forma", regularization: "Regularização", retry: "Nova tentativa" };
const EVENT: Record<string, string> = {
  created: "Cobrança criada", method_changed: "Forma de pagamento alterada", regularized: "Cobrança regularizada",
  "provider.paid": "Pagamento confirmado", "provider.overdue": "Venceu", "provider.failed": "Pagamento falhou",
  "provider.cancelled": "Cancelada no provedor", "provider.refunded": "Estornada", "provider.processing": "Em processamento",
  "provider.awaiting_payment": "Aguardando pagamento",
};
const ACTOR: Record<string, string> = { customer: "pelo cliente", provider: "pelo prestador", system: "pelo sistema", admin: "pelo administrador" };

export function ChargeMethodDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const fetchTimeline = useServerFn(getChargeTimeline);
  const switchFn = useServerFn(providerSwitchMethod);
  const qc = useQueryClient();
  const [method, setMethod] = useState<"pix" | "boleto" | "credit_card" | null>(null);
  const [password, setPassword] = useState("");

  const q = useQuery({
    queryKey: ["charge-timeline", paymentId],
    queryFn: () => fetchTimeline({ data: { paymentId: paymentId! } }),
    enabled: Boolean(paymentId),
  });

  const mut = useMutation({
    mutationFn: () => switchFn({ data: { paymentId: paymentId!, method: method!, password, idempotencyKey: crypto.randomUUID().replace(/-/g, "") } }),
    onSuccess: async () => {
      toast.success("Forma de pagamento alterada. O link do cliente continua o mesmo.");
      setPassword(""); setMethod(null);
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ["charges"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = () => { setPassword(""); setMethod(null); onClose(); };
  const d = q.data;

  return (
    <Dialog open={Boolean(paymentId)} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Forma de pagamento e histórico</DialogTitle>
          <DialogDescription>O cliente continua usando o mesmo link, mesmo após trocas ou regularização.</DialogDescription>
        </DialogHeader>
        {q.isLoading || !d ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted-foreground">Forma atual</span>
              <span className="font-semibold">{d.method ? METHOD[d.method] ?? d.method : "Cliente escolhe"} · {formatBRL(d.amount)}</span>
            </div>
            {d.late.days > 0 ? (
              <dl className="space-y-1 rounded-lg bg-muted/40 p-3">
                <div className="flex justify-between"><dt>Valor original</dt><dd>{formatBRL(d.late.base)}</dd></div>
                <div className="flex justify-between"><dt>Multa</dt><dd>{formatBRL(d.late.fine)}</dd></div>
                <div className="flex justify-between"><dt>Juros ({d.late.days} dias)</dt><dd>{formatBRL(d.late.interest)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Total atualizado</dt><dd>{formatBRL(d.late.total)}</dd></div>
              </dl>
            ) : null}

            {d.canSwitch && d.canEdit ? (
              <div className="space-y-3">
                <Label>Alterar forma de pagamento</Label>
                <div className="flex flex-wrap gap-2">
                  {d.methods.filter((m) => m !== d.method || d.late.days > 0).map((m) => (
                    <Button key={m} type="button" size="sm" variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)}>{METHOD[m]}</Button>
                  ))}
                </div>
                {method ? (
                  <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (password) mut.mutate(); }}>
                    <Label htmlFor="fin-pass">Para alterar a forma de pagamento desta cobrança, confirme sua senha financeira.</Label>
                    <Input id="fin-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                    <DialogFooter className="pt-2">
                      <Button type="button" variant="ghost" onClick={() => setMethod(null)}>Cancelar</Button>
                      <Button type="submit" disabled={!password || mut.isPending}>{mut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Confirmar</Button>
                    </DialogFooter>
                  </form>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg bg-muted/40 p-3 text-muted-foreground">{!d.canEdit ? "Somente dono, administrador ou financeiro pode alterar a forma de pagamento." : d.switchBlockedReason}</p>
            )}

            {d.attempts.length ? (
              <div className="space-y-2">
                <h3 className="font-semibold">Tentativas</h3>
                <ol className="divide-y divide-border rounded-lg border border-border">
                  {d.attempts.map((a) => (
                    <li key={a.attempt_number} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span>{a.attempt_number}. {a.method ? METHOD[a.method] : "—"} <span className="text-muted-foreground">· {REASON[a.reason] ?? a.reason}</span></span>
                      <span className="text-right"><span className="numeric-tabular">{formatBRL(a.amount)}</span> <span className="text-xs text-muted-foreground">{ATTEMPT_STATUS[a.status] ?? a.status}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="font-semibold">Histórico</h3>
              {d.events.length ? (
                <ul className="space-y-2 border-l border-border pl-4">
                  {d.events.map((e, i) => {
                    const meta = (e.metadata ?? {}) as { from?: string; to?: string };
                    return (
                      <li key={i}>
                        <p className="font-medium">{EVENT[e.event_type] ?? e.event_type} <span className="font-normal text-muted-foreground">{ACTOR[e.actor] ?? ""}</span></p>
                        {meta.from || meta.to ? <p className="text-xs text-muted-foreground">{METHOD[meta.from ?? ""] ?? "—"} → {METHOD[meta.to ?? ""] ?? "—"}</p> : null}
                        <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-muted-foreground">Ainda não há eventos registrados.</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
