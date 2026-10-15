import { useState, type ReactNode } from "react";
import { TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gauge, Zap, Clock, Info, ListOrdered, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/ds";
import { getMyLimits, requestLimitIncrease } from "@/lib/limits.functions";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, formatDate } from "@/lib/format";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/limites")({
  head: () => ({
    meta: [
      { title: "Limites de saque — Wiize Recebe" },
      { name: "description", content: "Veja seu limite diário de saque Pix, saques do mês e peça aumento de limite." },
      { property: "og:title", content: "Limites de saque — Wiize Recebe" },
      { property: "og:description", content: "Limite pessoal de saque Pix da sua conta Wiize Recebe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Limites,
});

const statusLabel: Record<string, string> = { pending: "Enviado", in_review: "Em análise", approved: "Aprovado", rejected: "Recusado" };

function Limites() {
  const { t: ui } = useTranslation("ui");
  const fetchLimits = useServerFn(getMyLimits);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["my-limits"], queryFn: () => fetchLimits() });
  const [open, setOpen] = useState(false);
  const pct = data && data.dailyLimit > 0 ? Math.min(100, (data.usedToday / data.dailyLimit) * 100) : 0;
  const pctM = data && data.monthlyCount > 0 ? Math.min(100, (data.usedMonth / data.monthlyCount) * 100) : 0;
  const hasOpen = data?.requests?.some((r) => r.status === "pending" || r.status === "in_review");

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui("Limites de saque")}
        description="Este é o limite pessoal da sua conta. Saques são feitos somente via Pix."
        action={data?.canRequest ? (
          <Button onClick={() => setOpen(true)} disabled={hasOpen}>
            <TrendingUp className="mr-2 h-4 w-4" />{hasOpen ? "Pedido em análise" : "Pedir aumento"}
          </Button>
        ) : null}
      />

      {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading || !data ? <ListSkeleton rows={3} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="surface-panel p-5 sm:p-6">
            <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10"><Gauge className="h-4 w-4 text-primary" /></span><h2 className="font-display text-sm font-semibold tracking-tight">Limite diário de saque Pix</h2></div>
            <p className="numeric-tabular mt-4 font-display text-2xl font-bold sm:text-[1.7rem]">{formatBRL(data.remainingToday)}</p>
            <p className="text-sm text-muted-foreground">disponível hoje, de {formatBRL(data.dailyLimit)} por dia</p>
            <Progress value={pct} className="mt-4" />
            <p className="mt-2 text-xs text-muted-foreground">Já usado hoje: {formatBRL(data.usedToday)}</p>
          </div>
          <div className="surface-panel p-5 sm:p-6">
            <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10"><ListOrdered className="h-4 w-4 text-primary" /></span><h2 className="font-display text-sm font-semibold tracking-tight">Saques por mês</h2></div>
            <p className="numeric-tabular mt-4 font-display text-2xl font-bold sm:text-[1.7rem]">{data.remainingMonth}</p>
            <p className="text-sm text-muted-foreground">saques restantes este mês, de {data.monthlyCount} por mês</p>
            <Progress value={pctM} className="mt-4" />
            <p className="mt-2 text-xs text-muted-foreground">Já feitos este mês: {data.usedMonth}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card icon={<Zap className="h-4 w-4 text-primary" />} title="Somente Pix" text="O valor cai na chave Pix cadastrada, inclusive fins de semana." />
        <Card icon={<Clock className="h-4 w-4 text-primary" />} title="Quando renova" text="O limite diário volta à meia-noite e o mensal no dia 1º (horário de Brasília)." />
        <Card icon={<Info className="h-4 w-4 text-primary" />} title="Regras do saque"
          text={data ? `Mínimo ${formatBRL(data.minimum)} · taxa de ${formatBRL(data.fee)} por saque. Todo saque passa por análise.` : "…"} />
      </div>

      {data?.requests?.length ? (
        <div className="surface-panel p-5 sm:p-6">
          <h2 className="font-display text-sm font-semibold tracking-tight">Seus pedidos de aumento</h2>
          <ul className="mt-4 space-y-3">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0">
                <div>
                  <p className="text-sm font-medium">{formatBRL(Number(r.requested_daily_limit))} por dia{r.requested_monthly_count ? ` · ${r.requested_monthly_count} saques/mês` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    Pedido em {formatDate(r.created_at)}
                    {r.expected_response_on && r.status === "in_review" ? ` · previsão de retorno ${formatDate(r.expected_response_on)}` : ""}
                    {r.status === "pending" ? " · aguardando a equipe enviar ao banco parceiro e informar o prazo" : ""}
                    {r.review_message ? ` · ${r.review_message}` : ""}
                  </p>
                </div>
                <StatusBadge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{statusLabel[r.status] ?? r.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data ? <RequestDialog open={open} onOpenChange={setOpen} current={data.dailyLimit} currentMonthly={data.monthlyCount} /> : null}
    </div>
  );
}

function RequestDialog({ open, onOpenChange, current, currentMonthly }: { open: boolean; onOpenChange: (v: boolean) => void; current: number; currentMonthly: number }) {
  const qc = useQueryClient();
  const send = useServerFn(requestLimitIncrease);
  const [daily, setDaily] = useState(String(current * 2));
  const [monthly, setMonthly] = useState(String(currentMonthly));
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => send({ data: { dailyLimit: Number(daily.replace(",", ".")), monthlyCount: Number(monthly) || undefined, reason } }),
    onSuccess: () => { toast.success("Pedido enviado. Avisaremos quando houver retorno."); onOpenChange(false); void qc.invalidateQueries({ queryKey: ["my-limits"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pedir aumento de limite</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Novo limite diário de saque Pix (R$)</Label><Input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} /></div>
          <div><Label>Saques por mês</Label><Input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></div>
          <div><Label>Por que precisa de mais limite?</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: meu faturamento mensal aumentou e preciso sacar valores maiores." /></div>
          <p className="text-xs text-muted-foreground">O pedido é analisado pela equipe Wiize Recebe junto ao banco parceiro. Assim que ele informar o prazo, você verá aqui a previsão de retorno.</p>
          <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Enviando…" : "Enviar pedido"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Card({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="surface-panel p-5">
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">{icon}</span><span className="font-display text-sm font-semibold">{title}</span></div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
