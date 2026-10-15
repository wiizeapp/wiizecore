import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BookOpen, CreditCard, FileSignature, FileText, HelpCircle, Lightbulb, Percent, QrCode, Receipt, Rocket, ShieldCheck, ThumbsDown, ThumbsUp, Wallet, Info, AlertTriangle,
} from "lucide-react";
import { listPublicFees } from "@/lib/fees.functions";
import { rateArticle, submitSuggestion, SUGGESTION_CATEGORIES } from "@/lib/help-center.functions";
import { estimateAnticipation, estimateSaleFee, maxInstallments, parseMoney, type HelpMethod } from "@/lib/help-calculators";
import type { RateRow } from "@/lib/fee-math";
import { SETTLEMENT_RULES, settlementMethodOf, ANTICIPATION_ANALYSIS_DAYS } from "@/lib/settlement-rules";
import { HELP_REVIEWED_AT } from "@/lib/help-content";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, Shimmer } from "@/components/states";

const ICONS: Record<string, typeof BookOpen> = { rocket: Rocket, percent: Percent, receipt: Receipt, qr: QrCode, card: CreditCard, wallet: Wallet, file: FileText, sign: FileSignature, shield: ShieldCheck, help: HelpCircle };
export function CategoryIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  const I = ICONS[name] ?? BookOpen;
  return <I className={className} strokeWidth={1.8} aria-hidden="true" />;
}

export const METHOD_LABEL: Record<HelpMethod, string> = { pix: "Pix à vista", pix_recurring: "Pix Automático", boleto: "Boleto", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" };

/** Taxas ativas — mesma fonte do checkout e da página pública de taxas. */
export function useHelpFees() {
  const fn = useServerFn(listPublicFees);
  const q = useQuery({ queryKey: ["public-fees"], queryFn: () => fn(), staleTime: 300_000 });
  const rows: RateRow[] = useMemo(() => (q.data?.paymentFees ?? []).map((f) => ({ payment_method: f.payment_method, installment_min: f.installment_min, installment_max: f.installment_max, fixed: f.fixed_fee, percent: f.percentage_fee })), [q.data]);
  return { ...q, rows };
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const I = tone === "warn" ? AlertTriangle : Info;
  return <div className={`flex gap-3 rounded-xl border p-4 text-sm ${tone === "warn" ? "border-warning/40 bg-warning/10" : "border-border bg-muted/40"}`}><I className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="text-muted-foreground">{children}</div></div>;
}

const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function FeeTable() {
  const { t: ui } = useTranslation("ui");
  const { rows, isLoading, error, refetch, data } = useHelpFees();
  if (isLoading) return <div className="space-y-2 rounded-xl border border-border p-4">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-8 w-full" />)}</div>;
  if (error) return <ErrorState text={ui("Não foi possível carregar as taxas agora.")} onRetry={() => void refetch()} />;
  const order: HelpMethod[] = ["pix", "pix_recurring", "boleto", "debit_card", "credit_card"];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.payment_method as HelpMethod) - order.indexOf(b.payment_method as HelpMethod) || a.installment_min - b.installment_min);
  const svc = data?.serviceFees;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">{ui("Modalidade")}</th><th className="px-4 py-3 font-medium">{ui("Parcelas")}</th><th className="px-4 py-3 font-medium">{ui("Percentual")}</th><th className="px-4 py-3 font-medium">{ui("Tarifa fixa")}</th><th className="px-4 py-3 font-medium">{ui("Prazo previsto")}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => {
              const m = r.payment_method as HelpMethod;
              const settle = SETTLEMENT_RULES[settlementMethodOf(m === "pix_recurring" ? "pix" : m, r.installment_min)];
              return (
                <tr key={`${r.payment_method}-${r.installment_min}`}>
                  <td className="px-4 py-3 font-medium">{ui(METHOD_LABEL[m] ?? m)}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.installment_min === r.installment_max ? `${r.installment_min}x` : `${r.installment_min}x–${r.installment_max}x`}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-primary">{r.percent > 0 ? pct(r.percent) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.fixed > 0 ? formatBRL(r.fixed) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{ui(settle.text)}{m === "pix_recurring" ? ` · ${ui("a confirmar")}` : ""}</td>
                </tr>
              );
            })}
            {!sorted.length ? <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">{ui("Nenhuma taxa ativa encontrada.")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {svc ? <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {svc.withdrawal != null ? <span>{ui("Saque")}: <strong className="text-foreground">{formatBRL(svc.withdrawal)}</strong></span> : null}
        {svc.minimumWithdrawal != null ? <span>{ui("Saque mínimo")}: <strong className="text-foreground">{formatBRL(svc.minimumWithdrawal)}</strong></span> : null}
        {svc.invoice != null ? <span>{ui("Nota fiscal autorizada")}: <strong className="text-foreground">{formatBRL(svc.invoice)}</strong></span> : null}
      </div> : null}
    </div>
  );
}

export function SettlementTable() {
  const { t: ui } = useTranslation("ui");
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(SETTLEMENT_RULES).map(([k, r]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">{ui(r.label)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{ui(r.text)}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{ui(r.kind === "business" ? "Contado em dias úteis a partir da confirmação" : "Contado em dias corridos a partir da operação")}</p>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-semibold">{ui("Pix Automático")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui("Pendente de validação com a Asaas para a conta integrada.")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">{ui("Análise da antecipação")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui("Cartão")}: {ANTICIPATION_ANALYSIS_DAYS.credit_card} {ui("dias úteis")} · {ui("Boleto")}: {ANTICIPATION_ANALYSIS_DAYS.boleto} {ui("dias úteis")}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{ui("Última revisão das condições operacionais")}: {formatDate(HELP_REVIEWED_AT)}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${strong ? "text-base font-semibold text-foreground" : ""}`}>{value}</span></div>;
}

export function FeeCalculator() {
  const { t: ui } = useTranslation("ui");
  const { rows, isLoading, error, refetch } = useHelpFees();
  const [amount, setAmount] = useState("1.000,00");
  const [method, setMethod] = useState<HelpMethod>("credit_card");
  const [inst, setInst] = useState(1);
  const methods = (["pix", "pix_recurring", "boleto", "debit_card", "credit_card"] as HelpMethod[]).filter((m) => rows.some((r) => r.payment_method === m));
  const max = maxInstallments(rows, method);
  const gross = parseMoney(amount);
  const n = Math.min(inst, max);
  const r = gross ? estimateSaleFee(rows, method, gross, n) : null;
  const settle = SETTLEMENT_RULES[settlementMethodOf(method === "pix_recurring" ? "pix" : method, n)];
  if (isLoading) return <div className="surface-panel space-y-3 p-5"><Shimmer className="h-10 w-full" /><Shimmer className="h-40 w-full" /></div>;
  if (error) return <ErrorState text={ui("Não foi possível carregar as taxas agora.")} onRetry={() => void refetch()} />;
  return (
    <div className="surface-panel grid gap-6 p-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="fc-amount">{ui("Valor da venda")}</Label><Input id="fc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!gross} />{!gross ? <p className="text-xs text-destructive">{ui("Informe um valor maior que zero, por exemplo 1.500,00.")}</p> : null}</div>
        <div className="space-y-1.5"><Label>{ui("Meio de pagamento")}</Label>
          <Select value={method} onValueChange={(v) => { setMethod(v as HelpMethod); setInst(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{ui(METHOD_LABEL[m])}</SelectItem>)}</SelectContent></Select>
        </div>
        {max > 1 ? <div className="space-y-1.5"><Label>{ui("Parcelas")}</Label>
          <Select value={String(n)} onValueChange={(v) => setInst(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: max }, (_, i) => i + 1).map((i) => <SelectItem key={i} value={String(i)}>{i}x</SelectItem>)}</SelectContent></Select>
        </div> : null}
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4" aria-live="polite">
        {r ? <>
          <Row label={ui("Valor bruto")} value={formatBRL(r.gross)} />
          <Row label={`${ui("Taxa percentual")} (${pct(r.percent)})`} value={formatBRL(r.percentPart)} />
          <Row label={`${ui("Tarifa fixa")}${r.fixedCount > 1 ? ` (${r.fixedCount}× ${formatBRL(r.fixed)})` : ""}`} value={formatBRL(r.fixedPart)} />
          <Row label={ui("Custo total estimado")} value={formatBRL(r.fee)} />
          <Row label={ui("Custo efetivo")} value={pct(r.effectivePct)} />
          <div className="my-2 border-t border-border" />
          <Row label={ui("Valor líquido estimado")} value={<span className="text-primary">{formatBRL(r.net)}</span>} strong />
          <p className="mt-2 text-xs text-muted-foreground">{ui("Prazo previsto")}: {ui(settle.text)}{method === "pix_recurring" ? ` (${ui("a confirmar")})` : ""}</p>
        </> : <p className="py-6 text-center text-sm text-muted-foreground">{gross ? ui("Não há taxa ativa para esta combinação.") : ui("Informe um valor válido para ver o resultado.")}</p>}
      </div>
      <p className="text-xs text-muted-foreground lg:col-span-2">{ui("Valores estimados com as taxas vigentes. O valor definitivo depende das condições efetivas da transação.")}</p>
    </div>
  );
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function AnticipationCalculator() {
  const { t: ui } = useTranslation("ui");
  const { rows, data, isLoading, error, refetch } = useHelpFees();
  const [amount, setAmount] = useState("1.000,00");
  const [method, setMethod] = useState<"credit_card" | "boleto">("credit_card");
  const [inst, setInst] = useState(3);
  const [payDate, setPayDate] = useState(today);
  const [antDate, setAntDate] = useState(today);
  const configured = data?.anticipationFees.find((f) => f.payment_method === method)?.monthly_percentage_fee ?? null;
  const [custom, setCustom] = useState("");
  const rate = configured ?? (custom ? Number(custom.replace(",", ".")) : null);
  const gross = parseMoney(amount);
  const max = maxInstallments(rows, method);
  const n = Math.min(inst, max);
  const valid = gross && rate != null && Number.isFinite(rate) && rate >= 0 && rate <= 30 && antDate >= payDate;
  const r = valid ? estimateAnticipation({ rows, method, gross: gross!, installments: n, paymentDate: payDate, anticipationDate: antDate, monthlyRate: rate! }) : null;
  if (isLoading) return <div className="surface-panel space-y-3 p-5"><Shimmer className="h-10 w-full" /><Shimmer className="h-40 w-full" /></div>;
  if (error) return <ErrorState text={ui("Não foi possível carregar as taxas agora.")} onRetry={() => void refetch()} />;
  return (
    <div className="surface-panel space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="ac-amount">{ui("Valor bruto da venda")}</Label><Input id="ac-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!gross} /></div>
        <div className="space-y-1.5"><Label>{ui("Modalidade")}</Label><Select value={method} onValueChange={(v) => setMethod(v as "credit_card" | "boleto")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credit_card">{ui("Cartão de crédito")}</SelectItem><SelectItem value="boleto">{ui("Boleto")}</SelectItem></SelectContent></Select></div>
        {max > 1 ? <div className="space-y-1.5"><Label>{ui("Parcelas")}</Label><Select value={String(n)} onValueChange={(v) => setInst(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: max }, (_, i) => i + 1).map((i) => <SelectItem key={i} value={String(i)}>{i}x</SelectItem>)}</SelectContent></Select></div> : null}
        <div className="space-y-1.5"><Label htmlFor="ac-pay">{ui("Data do pagamento")}</Label><Input id="ac-pay" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="ac-ant">{ui("Data da antecipação")}</Label><Input id="ac-ant" type="date" value={antDate} min={payDate} onChange={(e) => setAntDate(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="ac-rate">{ui("Taxa mensal de antecipação")}</Label>
          {configured != null ? <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm tabular-nums">{pct(configured)} <span className="ml-2 text-xs text-muted-foreground">{ui("configuração vigente")}</span></div>
            : <><Input id="ac-rate" inputMode="decimal" placeholder="Ex.: 3,5" value={custom} onChange={(e) => setCustom(e.target.value)} /><p className="text-xs text-warning">{ui("Taxa hipotética — sem taxa oficial configurada para esta modalidade.")}</p></>}
        </div>
      </div>
      {antDate < payDate ? <p className="text-xs text-destructive">{ui("A data da antecipação não pode ser anterior ao pagamento.")}</p> : null}
      {r ? <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]" aria-live="polite">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <Row label={ui("Valor bruto")} value={formatBRL(r.sale.gross)} />
          <Row label={ui("Taxa de processamento")} value={formatBRL(r.sale.fee)} />
          <Row label={ui("Recebimento normal (líquido)")} value={formatBRL(r.sale.net)} />
          <Row label={ui("Custo estimado de antecipação")} value={formatBRL(r.anticipationFee)} />
          <Row label={ui("Custo efetivo total")} value={pct(r.effectivePct)} />
          <div className="my-2 border-t border-border" />
          <Row label={ui("Valor líquido antecipado")} value={<span className="text-primary">{formatBRL(r.finalNet)}</span>} strong />
          <p className="mt-1 text-xs text-muted-foreground">{ui("Diferença para o recebimento normal")}: {formatBRL(r.anticipationFee)}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[420px] text-xs"><thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="px-3 py-2">{ui("Parcela")}</th><th className="px-3 py-2">{ui("Data prevista")}</th><th className="px-3 py-2">{ui("Dias")}</th><th className="px-3 py-2">{ui("Líquido")}</th><th className="px-3 py-2">{ui("Custo")}</th></tr></thead>
            <tbody className="divide-y divide-border">{r.receivables.map((x) => <tr key={x.number}><td className="px-3 py-2">{x.number}</td><td className="px-3 py-2">{formatDate(x.due)}</td><td className="px-3 py-2 tabular-nums">{x.days}</td><td className="px-3 py-2 tabular-nums">{formatBRL(x.net)}</td><td className="px-3 py-2 tabular-nums">{formatBRL(x.fee)}</td></tr>)}</tbody></table>
        </div>
      </div> : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{ui("Preencha os campos para ver a simulação.")}</p>}
      <Callout tone="warn">{ui("Simulação informativa: custo = valor de cada parcela × taxa mensal × dias até a data prevista ÷ 30. A antecipação depende de elegibilidade, análise e aprovação da Asaas; a cotação oficial aparece em Receba mais rápido.")}</Callout>
    </div>
  );
}

const CAT_LABEL: Record<(typeof SUGGESTION_CATEGORIES)[number], string> = {
  feature: "Nova funcionalidade", improvement: "Melhoria de funcionalidade existente", usage: "Dúvida ou dificuldade de uso", bug: "Problema encontrado", help_content: "Conteúdo da Central de Ajuda", fees: "Taxas ou prazos", other: "Outra sugestão",
};
export const SUGGESTION_CATEGORY_LABEL = CAT_LABEL;

export function SuggestionDialog({ open, onOpenChange, defaultCategory = "feature", sourceLabel }: { open: boolean; onOpenChange: (v: boolean) => void; defaultCategory?: keyof typeof CAT_LABEL; sourceLabel?: string }) {
  const { t: ui } = useTranslation("ui");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const send = useServerFn(submitSuggestion);
  const [category, setCategory] = useState<keyof typeof CAT_LABEL>(defaultCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [extra, setExtra] = useState("");
  const key = useRef<string>(crypto.randomUUID());
  const m = useMutation({
    mutationFn: () => send({ data: { category, title, description, extra: extra || undefined, sourcePage: pathname, idempotencyKey: key.current } }),
    onSuccess: () => {
      toast.success(ui("Obrigado por compartilhar sua ideia! Sua sugestão foi enviada para a equipe WiizePay."));
      setTitle(""); setDescription(""); setExtra(""); key.current = crypto.randomUUID(); onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message || ui("Não foi possível enviar. Tente novamente.")),
  });
  const valid = title.trim().length >= 3 && description.trim().length >= 10;
  return (
    <Dialog open={open} onOpenChange={(v) => !m.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{ui("Envie sua sugestão")}</DialogTitle><DialogDescription>{ui("Sua opinião ajuda a melhorar a WiizePay. Conte o que você gostaria de ver ou o que podemos melhorar.")}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid && !m.isPending) m.mutate(); }}>
          <div className="space-y-1.5"><Label>{ui("Tipo de sugestão")}</Label><Select value={category} onValueChange={(v) => setCategory(v as keyof typeof CAT_LABEL)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUGGESTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ui(CAT_LABEL[c])}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="sg-title">{ui("Título da sugestão")}</Label><Input id="sg-title" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="sg-desc">{ui("Descrição detalhada")}</Label><Textarea id="sg-desc" rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} required /><p className="text-[11px] text-muted-foreground">{ui("Mínimo de 10 caracteres. Não inclua dados de cartão ou senhas.")}</p></div>
          <div className="space-y-1.5"><Label>{ui("Página relacionada")}</Label><div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{sourceLabel ? `${sourceLabel} · ` : ""}{pathname}</div></div>
          <div className="space-y-1.5"><Label htmlFor="sg-extra">{ui("Informações adicionais (opcional)")}</Label><Textarea id="sg-extra" rows={2} maxLength={2000} value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>{ui("Cancelar")}</Button><Button type="submit" disabled={!valid || m.isPending}>{m.isPending ? ui("Enviando…") : ui("Enviar sugestão")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuggestCTA({ category, sourceLabel }: { category?: keyof typeof CAT_LABEL; sourceLabel?: string }) {
  const { t: ui } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Lightbulb className="size-5" aria-hidden="true" /></span>
        <div><p className="font-semibold">{ui("Não encontrou o que precisava?")}</p><p className="mt-1 text-sm text-muted-foreground">{ui("Ajude-nos a melhorar a WiizePay. Envie uma sugestão, compartilhe uma ideia ou informe o que poderia ser melhor.")}</p></div></div>
      <Button onClick={() => setOpen(true)} className="shrink-0">{ui("Enviar sugestão")}</Button>
      <SuggestionDialog open={open} onOpenChange={setOpen} defaultCategory={category} sourceLabel={sourceLabel} />
    </div>
  );
}

export function ArticleFeedback({ slug }: { slug: string }) {
  const { t: ui } = useTranslation("ui");
  const rate = useServerFn(rateArticle);
  const [sent, setSent] = useState<boolean | null>(null);
  const m = useMutation({ mutationFn: (helpful: boolean) => rate({ data: { slug, helpful } }), onSuccess: (_d, h) => setSent(h), onError: () => toast.error(ui("Não foi possível registrar sua avaliação.")) });
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6 text-sm">
      <span className="text-muted-foreground">{sent === null ? ui("Este conteúdo ajudou?") : ui("Obrigado pela avaliação!")}</span>
      <Button size="sm" variant={sent === true ? "default" : "outline"} disabled={m.isPending} onClick={() => m.mutate(true)} className="gap-1.5"><ThumbsUp className="size-4" />{ui("Sim")}</Button>
      <Button size="sm" variant={sent === false ? "default" : "outline"} disabled={m.isPending} onClick={() => m.mutate(false)} className="gap-1.5"><ThumbsDown className="size-4" />{ui("Não")}</Button>
    </div>
  );
}

export function HelpBreadcrumb({ items }: { items: { label: string; to?: string; params?: Record<string, string> }[] }) {
  const { t: ui } = useTranslation("ui");
  return (
    <nav aria-label="breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Link to="/ajuda" className="hover:text-foreground">{ui("Central de Ajuda")}</Link>
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span aria-hidden="true">/</span>{i.to ? <Link to={i.to as "/ajuda"} params={i.params as never} className="hover:text-foreground">{ui(i.label)}</Link> : <span className="text-foreground">{ui(i.label)}</span>}</span>)}
    </nav>
  );
}
