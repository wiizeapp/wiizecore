import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useState } from "react";
import { SecureActionDialog } from "@/components/developer/secure-action-dialog";
import { PageHeader } from "@/components/app-shell";
import { ErrorState, ListSkeleton } from "@/components/states";
import { StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { getCoproductionInvite, respondCoproduction } from "@/lib/coproductions.functions";
import { CP_STATUS } from "@/lib/coproduction-labels";

export const Route = createFileRoute("/_authenticated/coproducoes_/$id")({
  head: () => ({
    meta: [
      { title: "Convite de coprodução — Wiize Core" },
      { name: "description", content: "Veja e responda ao convite para participar de uma coprodução na Wiize Core." },
      { property: "og:title", content: "Convite de coprodução — Wiize Core" },
      { property: "og:description", content: "Aceite ou recuse a participação no valor líquido recebido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Invite,
});

function Invite() {
  const { id } = Route.useParams();
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const get = useServerFn(getCoproductionInvite);
  const respond = useServerFn(respondCoproduction);
  const [accept, setAccept] = useState<boolean | null>(null);
  const q = useQuery({ queryKey: ["coproduction-invite", id], queryFn: () => get({ data: { id } }) });
  const m = useMutation({
    mutationFn: (data: { accept: boolean; financialPassword: string }) => respond({ data: { id, ...data } }),
    onSuccess: (r) => { toast.success(r.status === "accepted" ? ui("Coprodução aceita.") : ui("Convite recusado.")); void qc.invalidateQueries({ queryKey: ["coproduction-invite", id] }); void qc.invalidateQueries({ queryKey: ["coproductions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError || !q.data) return <ErrorState text={q.error instanceof Error ? q.error.message : "Não foi possível carregar este convite."} onRetry={() => q.refetch()} />;
  const d = q.data;
  const pct = `${d.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const rows: [string, string][] = [
    ["Parceiro principal", d.owner], ["Cliente", d.customer], ["Serviço", d.service], ["Cobrança", formatBRL(d.total)],
    ["Parcelas", String(d.installments)], ["Sua participação", pct], ...(d.responsibility ? [["Responsabilidade", d.responsibility] as [string, string]] : []),
  ];
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={ui("Você foi convidado para uma coprodução")} />
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex justify-end"><StatusBadge tone={CP_STATUS[d.status]?.tone ?? "neutral"}>{ui(CP_STATUS[d.status]?.label ?? d.status)}</StatusBadge></div>
        <dl className="mt-2 divide-y divide-border text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">{ui(k)}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        </dl>
        <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">{ui("A divisão será aplicada sobre o valor líquido efetivamente recebido em cada pagamento, após as taxas aplicáveis. Parcelas não pagas não geram valor. Estimativa de participação: os valores reais aparecem depois de cada pagamento confirmado.")}</p>
        {d.canRespond ? (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" disabled={m.isPending} onClick={() => setAccept(false)}>{ui("Recusar")}</Button>
            <Button className="flex-1" disabled={m.isPending} onClick={() => setAccept(true)}>{ui("Aceitar coprodução")}</Button>
          </div>
        ) : null}
      </section>
      <Button asChild variant="ghost"><Link to="/coproducoes">{ui("Ver minhas coproduções")}</Link></Button>
      <SecureActionDialog open={accept !== null} onOpenChange={(v) => !v && setAccept(null)} title={ui(accept ? "Aceitar coprodução" : "Recusar")} confirmLabel={ui("Confirmar")} needsPassword requiredMfa onConfirm={async ({ password }) => {
        if (accept === null) return;
        await m.mutateAsync({ accept, financialPassword: password });
      }} />
    </div>
  );
}
