import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Mail, MapPin, Phone, RotateCcw, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getRefundContext, requestRefund } from "@/lib/refunds.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatDateTime, formatDocument } from "@/lib/format";
import { paymentMethodLabels, paymentStatusLabels } from "@/lib/labels";
import { StatusBadge, ListSkeleton, ErrorState } from "@/components/ds";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChargeLinkField } from "@/components/charges/copy-charge-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SheetItem = { id: string; description: string | null; status: string; method: string | null; gross_amount: number | string; platform_fee_amount: number | string | null; net_amount: number | string | null; due_on: string | null; paid_at?: string | null; created_at?: string; installment_number: number | null; installment_count: number | null };
export type SheetGroup = { id: string; customer: string; customerId?: string | null; items: SheetItem[]; next: SheetItem };

export const REFUND_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  requested: { label: "Solicitado", tone: "warning" }, processing: { label: "Em processamento", tone: "warning" },
  completed: { label: "Concluído", tone: "success" }, failed: { label: "Falhou", tone: "danger" }, cancelled: { label: "Cancelado", tone: "neutral" },
};

export function ChargeSheet({ group, onClose }: { group: SheetGroup | null; onClose: () => void }) {
  const paidItems = group?.items.filter((p) => ["paid", "refunded"].includes(p.status)) ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const paymentId = selected ?? paidItems[paidItems.length - 1]?.id ?? null;
  const customer = useQuery({
    queryKey: ["charge-sheet-customer", group?.customerId],
    enabled: Boolean(group?.customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, document, email, phone, whatsapp, city, state, address, address_number")
        .eq("id", group?.customerId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const gross = group?.items.reduce((sum, item) => sum + Number(item.gross_amount), 0) ?? 0;
  const fees = group?.items.reduce((sum, item) => sum + Number(item.platform_fee_amount ?? 0), 0) ?? 0;
  const net = group?.items.reduce((sum, item) => sum + Number(item.net_amount ?? 0), 0) ?? 0;
  return (
    <Sheet open={Boolean(group)} onOpenChange={(o) => { if (!o) { setSelected(null); onClose(); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {group ? (
          <>
            <SheetHeader><SheetTitle>{group.next.description ?? "Cobrança"}</SheetTitle></SheetHeader>
             <div className="mt-1 flex items-center justify-between gap-3">
               <p className="min-w-0 truncate text-sm text-muted-foreground">{group.customer}</p>
               {group.customerId ? <Button asChild variant="ghost" size="sm"><Link to="/clientes/$id" params={{ id: group.customerId }} search={{ aba: "visao" }}><ExternalLink className="size-3.5" />Central 360º</Link></Button> : null}
             </div>
             <dl className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-border text-sm">
               <div className="min-w-0 border-r border-border p-3"><dt className="text-xs text-muted-foreground">Cobrado</dt><dd className="numeric-tabular mt-1 truncate font-semibold">{formatBRL(gross)}</dd></div>
               <div className="min-w-0 border-r border-border p-3"><dt className="text-xs text-muted-foreground">Taxa financeira</dt><dd className="numeric-tabular mt-1 truncate font-semibold">{formatBRL(fees)}</dd></div>
               <div className="min-w-0 p-3"><dt className="text-xs text-muted-foreground">Líquido</dt><dd className="numeric-tabular mt-1 truncate font-semibold text-primary">{formatBRL(net)}</dd></div>
             </dl>
             <div className="mt-4"><ChargeLinkField chargeGroupId={group.id} /></div>
             {(() => {
               const valid = group.items.filter((p) => p.status !== "cancelled");
               const paid = valid.filter((p) => p.status === "paid");
               const open = valid.filter((p) => ["awaiting_payment", "overdue", "created"].includes(p.status));
               const overdue = valid.filter((p) => p.status === "overdue");
               const last = [...paid].sort((a, b) => String(a.paid_at ?? a.due_on).localeCompare(String(b.paid_at ?? b.due_on))).pop();
               const next = [...open].sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))[0];
               const pct = valid.length ? Math.round((paid.length / valid.length) * 100) : 0;
               const sum = (l: SheetItem[]) => l.reduce((a, p) => a + Number(p.gross_amount), 0);
               return (
                 <section className="mt-4 rounded-lg border border-border p-3">
                   <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Andamento</h3>
                     <StatusBadge tone={valid.length && paid.length === valid.length ? "success" : overdue.length ? "danger" : "warning"}>{valid.length && paid.length === valid.length ? "Quitada" : overdue.length ? `${overdue.length} em atraso` : "Em dia"}</StatusBadge></div>
                   <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{paid.length} de {valid.length} pagas</span><span>{pct}%</span></div>
                   <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                   <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                     <div><dt className="text-xs text-muted-foreground">Recebido</dt><dd className="numeric-tabular font-semibold">{formatBRL(sum(paid))}</dd></div>
                     <div><dt className="text-xs text-muted-foreground">A receber</dt><dd className="numeric-tabular font-semibold">{formatBRL(sum(open.filter((p) => p.status !== "overdue")))}</dd></div>
                     <div><dt className="text-xs text-muted-foreground">Em atraso</dt><dd className={`numeric-tabular font-semibold ${overdue.length ? "text-destructive" : ""}`}>{formatBRL(sum(overdue))}</dd></div>
                     <div><dt className="text-xs text-muted-foreground">Forma atual</dt><dd className="font-medium">{group.next.method ? (paymentMethodLabels[group.next.method as keyof typeof paymentMethodLabels] ?? "—") : "Cliente escolhe"}</dd></div>
                     <div><dt className="text-xs text-muted-foreground">Último pagamento</dt><dd className="font-medium">{last ? formatDate(last.paid_at ?? last.due_on) : "—"}</dd></div>
                     <div><dt className="text-xs text-muted-foreground">Próximo vencimento</dt><dd className="font-medium">{next ? formatDate(next.due_on) : "—"}</dd></div>
                     {group.next.created_at ? <div><dt className="text-xs text-muted-foreground">Criada em</dt><dd className="font-medium">{formatDate(group.next.created_at)}</dd></div> : null}
                   </dl>
                 </section>
               );
             })()}
             {customer.data ? (
               <section className="mt-4 rounded-lg border border-border p-3">
                 <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Dados do cliente</h3><UserRound className="size-4 text-muted-foreground" /></div>
                 <div className="mt-3 grid gap-2 text-sm">
                   <p className="font-medium">{customer.data.name}</p>
                   {customer.data.document ? <p className="text-muted-foreground">CPF/CNPJ: {formatDocument(customer.data.document)}</p> : null}
                   {customer.data.email ? <p className="flex min-w-0 items-center gap-2 text-muted-foreground"><Mail className="size-3.5 shrink-0" /><span className="truncate">{customer.data.email}</span></p> : null}
                   {customer.data.phone || customer.data.whatsapp ? <p className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5 shrink-0" />{customer.data.phone || customer.data.whatsapp}</p> : null}
                   {customer.data.address || customer.data.city || customer.data.state ? <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" /><span>{[[customer.data.address, customer.data.address_number].filter(Boolean).join(", "), [customer.data.city, customer.data.state].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")}</span></p> : null}
                 </div>
               </section>
             ) : null}
            <div className="mt-5 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Parcelas / pagamentos</p>
               {group.items.map((p) => (
                 <Button key={p.id} type="button" variant="ghost" onClick={() => setSelected(p.id)}
                   className={`h-auto w-full justify-between rounded-lg px-3 py-2 text-left text-sm ${paymentId === p.id ? "bg-muted" : ""}`}>
                  <span>{p.installment_count ? `${p.installment_number}/${p.installment_count} · ` : ""}{formatDate(p.due_on)}</span>
                  <span className="flex items-center gap-2"><span className="numeric-tabular">{formatBRL(p.gross_amount)}</span>
                    <StatusBadge tone={p.status === "paid" ? "success" : p.status === "overdue" ? "danger" : "neutral"}>{paymentStatusLabels[p.status as keyof typeof paymentStatusLabels] ?? p.status}</StatusBadge></span>
                 </Button>
              ))}
            </div>
            {paymentId ? <PaymentRefundPanel key={paymentId} paymentId={paymentId} /> : (
              <p className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Quando houver um pagamento confirmado, os valores e a opção de reembolso aparecem aqui.</p>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PaymentRefundPanel({ paymentId }: { paymentId: string }) {
  const fn = useServerFn(getRefundContext);
  const q = useQuery({ queryKey: ["refund-ctx", paymentId], queryFn: () => fn({ data: { paymentId } }) });
  const [open, setOpen] = useState(false);
  if (q.isLoading) return <div className="mt-6"><ListSkeleton rows={3} /></div>;
  if (q.isError || !q.data) return <div className="mt-6"><ErrorState onRetry={() => q.refetch()} /></div>;
  const d = q.data;
  const rows: [string, string][] = [
    ["Forma de pagamento", d.payment.method ? (paymentMethodLabels[d.payment.method as keyof typeof paymentMethodLabels] ?? "—") : "—"],
    ["Valor pago", formatBRL(d.payment.gross)],
    ["Taxa financeira", `− ${formatBRL(d.payment.fee)}`],
    ["Valor líquido", formatBRL(d.payment.net)],
    ["Já reembolsado", formatBRL(d.payment.refunded)],
    ["Disponível para reembolso", formatBRL(d.eligibleNet)],
  ];
  return (
    <div className="mt-6">
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between border-b border-border pb-2"><dt className="text-muted-foreground">{k}</dt><dd className="numeric-tabular font-medium">{v}</dd></div>)}
      </dl>
      {d.deadline && !d.blocked ? <p className="mt-2 text-xs text-muted-foreground">Reembolso possível até {formatDate(d.deadline)}.</p> : null}
      {d.canWrite ? (
        <Button className="mt-4 w-full" variant="outline" disabled={Boolean(d.blocked)} onClick={() => setOpen(true)} title={d.blocked ?? undefined}>
          <RotateCcw className="h-4 w-4" /> Reembolsar
        </Button>
      ) : null}
      {d.blocked && d.payment.paidAt ? <p className="mt-2 text-xs text-muted-foreground">{d.blocked}</p> : null}

      {d.refunds.length ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Histórico de reembolsos</p>
          <ol className="space-y-2">
            {d.refunds.map((r: any) => (
              <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between"><span className="numeric-tabular font-semibold">{formatBRL(r.refund_amount)}</span><StatusBadge tone={REFUND_STATUS[r.status]?.tone ?? "neutral"}>{REFUND_STATUS[r.status]?.label ?? r.status}</StatusBadge></div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.created_at)} · {r.reason}</p>
                {Number(r.deduction_amount) > 0 ? <p className="text-xs text-muted-foreground">Dedução {formatBRL(r.deduction_amount)} · {r.deduction_reason}</p> : null}
                {r.failure_reason ? <p className="text-xs text-destructive">{r.failure_reason}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {open ? <RefundDialog paymentId={paymentId} ctx={d} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

const parse = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

function RefundDialog({ paymentId, ctx, onClose }: { paymentId: string; ctx: any; onClose: () => void }) {
  const qc = useQueryClient();
  const req = useServerFn(requestRefund);
  const [mode, setMode] = useState<"net" | "gross">(ctx.policy.default_mode);
  const [kind, setKind] = useState<"total" | "partial">("total");
  const [amount, setAmount] = useState("");
  const [dType, setDType] = useState<"none" | "fixed" | "percent">(ctx.policy.default_deduction_type);
  const [dValue, setDValue] = useState(ctx.policy.default_deduction_value ? String(ctx.policy.default_deduction_value).replace(".", ",") : "");
  const [dReason, setDReason] = useState("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [password, setPassword] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const eligible = mode === "gross" ? ctx.eligibleGross : ctx.eligibleNet;
  const base = kind === "total" ? eligible : Math.min(parse(amount), eligible);
  const ded = dType === "fixed" ? parse(dValue) : dType === "percent" ? Math.round(base * Math.min(parse(dValue), 100)) / 100 : 0;
  const final = Math.max(0, Math.round((base - ded) * 100) / 100);
  const valid = base > 0 && final > 0 && reason.trim().length >= 3 && (ded === 0 || dReason.trim());
  const m = useMutation({
    mutationFn: () => req({ data: { paymentId, mode, kind, amount: kind === "partial" ? base : undefined, deductionType: dType, deductionValue: dType === "none" ? 0 : parse(dValue), deductionReason: dReason || undefined, reason, financialPassword: password, idempotencyKey: key } }),
    onSuccess: (r) => {
      if (r.status === "failed") toast.error(r.failure ?? "O reembolso não foi realizado.");
      else toast.success(r.status === "completed" ? "Reembolso concluído." : "Reembolso enviado. Avisaremos quando for concluído.");
      void qc.invalidateQueries({ queryKey: ["refund-ctx", paymentId] });
      void qc.invalidateQueries({ queryKey: ["payments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{step === "form" ? "Reembolsar pagamento" : "Confirmar reembolso"}</DialogTitle></DialogHeader>
        {step === "form" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {([["net", "Devolver o que recebi", formatBRL(ctx.eligibleNet)], ["gross", "Devolver valor pago", formatBRL(ctx.eligibleGross)]] as const).map(([k, t, v]) => (
                <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-xl border p-3 text-left text-sm ${mode === k ? "border-primary bg-primary/5" : "border-border"}`}>
                  <span className="block font-medium">{t}</span><span className="numeric-tabular text-xs text-muted-foreground">{v}</span>
                </button>
              ))}
            </div>
            {mode === "gross" ? <p className="text-xs text-muted-foreground">A taxa Wiize Recebe ({formatBRL(ctx.payment.fee)}) não é devolvida. A diferença sai do seu saldo.</p> : null}
            {ctx.policy.allow_partial ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="total">Total</SelectItem><SelectItem value="partial">Parcial</SelectItem></SelectContent></Select></div>
                {kind === "partial" ? <div><Label>Valor</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" /></div> : null}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dedução</Label>
                <Select value={dType} onValueChange={(v) => setDType(v as typeof dType)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Sem dedução</SelectItem><SelectItem value="fixed">Valor fixo</SelectItem><SelectItem value="percent">Porcentagem</SelectItem></SelectContent></Select></div>
              {dType !== "none" ? <div><Label>{dType === "percent" ? "Porcentagem" : "Valor"}</Label><Input inputMode="decimal" value={dValue} onChange={(e) => setDValue(e.target.value.replace(/[^\d.,]/g, ""))} /></div> : null}
            </div>
            {dType !== "none" ? (
              <div><Label>Motivo da dedução</Label>
                <Select value={dReason} onValueChange={setDReason}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{["Multa contratual", "Serviço já prestado", "Cancelamento fora do prazo", "Outro"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            ) : null}
            <div><Label>Motivo do reembolso</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente cancelou o serviço" /></div>
            <Summary base={base} ded={ded} final={final} />
            <Button className="w-full" disabled={!valid} onClick={() => setStep("confirm")}>Continuar</Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (password) m.mutate(); }}>
            <Summary base={base} ded={ded} final={final} />
            <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">Depois de enviado ao processador, o reembolso não pode ser desfeito.</p>
            <div><Label>Senha financeira</Label><Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("form")}>Voltar</Button>
              <Button type="submit" className="flex-1" disabled={!password || m.isPending}>{m.isPending ? "Enviando..." : `Reembolsar ${formatBRL(final)}`}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Summary({ base, ded, final }: { base: number; ded: number; final: number }) {
  return (
    <dl className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
      <div className="flex justify-between"><dt className="text-muted-foreground">Valor do reembolso</dt><dd className="numeric-tabular">{formatBRL(base)}</dd></div>
      {ded > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Dedução</dt><dd className="numeric-tabular">− {formatBRL(ded)}</dd></div> : null}
      <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>Cliente recebe</dt><dd className="numeric-tabular text-primary">{formatBRL(final)}</dd></div>
    </dl>
  );
}
