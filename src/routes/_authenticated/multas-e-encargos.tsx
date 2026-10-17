import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Percent, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getLateFees, saveLateFees } from "@/lib/late-fees.functions";

export const Route = createFileRoute("/_authenticated/multas-e-encargos")({
  head: () => ({
    meta: [
      { title: "Multas e encargos — Wiize Core" },
      { name: "description", content: "Configure multa e juros por atraso aplicados às novas cobranças." },
      { property: "og:title", content: "Multas e encargos — Wiize Core" },
      { property: "og:description", content: "Regras padrão de atraso das suas cobranças." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const pct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parse = (v: string) => Number(v.replace(",", ".")) || 0;

function Page() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const fetchFn = useServerFn(getLateFees);
  const save = useServerFn(saveLateFees);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["late-fees"], queryFn: () => fetchFn() });
  const [f, setF] = useState({ fineEnabled: true, fine: "2,00", interestEnabled: true, interest: "1,00" });
  useEffect(() => {
    if (data) setF({ fineEnabled: data.fineEnabled, fine: pct(data.finePercent), interestEnabled: data.interestEnabled, interest: pct(data.interestPercent) });
  }, [data]);
  const mut = useMutation({
    mutationFn: () => save({ data: { fineEnabled: f.fineEnabled, finePercent: parse(f.fine), interestEnabled: f.interestEnabled, interestPercent: parse(f.interest) } }),
    onSuccess: () => { toast.success("Configurações salvas."); void qc.invalidateQueries({ queryKey: ["late-fees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const block = (icon: React.ReactNode, title: string, desc: string, enabled: boolean, onToggle: (v: boolean) => void, value: string, onValue: (v: string) => void, suffix: string, label: string) => (
    <div className="space-y-4 border-b border-border py-5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
          <div><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{desc}</p></div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={!data?.canEdit} aria-label={title} />
      </div>
      {enabled ? (
        <div className="ml-12 max-w-xs space-y-1">
          <Label>{label}</Label>
          <div className="flex items-center gap-2"><Input inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} disabled={!data?.canEdit} /><span className="whitespace-nowrap text-sm text-muted-foreground">{suffix}</span></div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Multas e encargos" description="Regras padrão de atraso aplicadas automaticamente às novas cobranças." />
      {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading || !data ? <ListSkeleton rows={3} /> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="surface-panel px-5 sm:px-6">
            {!data.configured ? <div className="mt-5 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-semibold">{ui("Padrão da Wiize já ativo")}</p><p className="mt-1 text-sm text-muted-foreground">{ui("Novas cobranças usam multa de 2% e juros de 1% ao mês. Revise e salve para confirmar ou personalize abaixo.")}</p></div></div> : null}
            {block(<Percent className="size-4" />, "Aplicar multa por atraso", "Valor único cobrado após o vencimento.", f.fineEnabled, (v) => setF({ ...f, fineEnabled: v }), f.fine, (v) => setF({ ...f, fine: v }), "%", "Percentual da multa")}
            {block(<TrendingUp className="size-4" />, "Aplicar juros por atraso", "Juros proporcionais aos dias de atraso.", f.interestEnabled, (v) => setF({ ...f, interestEnabled: v }), f.interest, (v) => setF({ ...f, interest: v }), "% ao mês", "Juros")}
            <div className="py-5"><Button onClick={() => mut.mutate()} disabled={!data.canEdit || mut.isPending}>{mut.isPending ? "Salvando…" : "Salvar configurações"}</Button>
              {!data.canEdit ? <p className="mt-2 text-xs text-muted-foreground">Somente dono, administrador ou financeiro pode alterar.</p> : null}</div>
          </section>
          <aside className="surface-panel h-fit p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configuração atual</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt>Multa</dt><dd className="numeric-tabular font-semibold">{data.fineEnabled ? `${pct(data.finePercent)}%` : "Desativada"}</dd></div>
              <div className="flex justify-between"><dt>Juros</dt><dd className="numeric-tabular font-semibold">{data.interestEnabled ? `${pct(data.interestPercent)}% ao mês` : "Desativados"}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">Essas condições valem para novas cobranças. Cobranças já criadas mantêm as condições do momento em que foram geradas. Se o serviço tiver multa/juros próprios, eles têm prioridade.</p>
            {!data.configured ? <p className="mt-3 rounded-md bg-primary/10 p-3 text-xs text-foreground">{ui("Configuração inicial aplicado automaticamente. Salve para registrar sua confirmação.")}</p> : null}
          </aside>
        </div>
      )}
    </div>
  );
}
