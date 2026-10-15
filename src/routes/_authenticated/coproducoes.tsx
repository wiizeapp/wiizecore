import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Handshake } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { CP_STATUS } from "@/lib/coproduction-labels";
import { cancelCoproduction, listCoproductions, retryCoproductionSplit } from "@/lib/coproductions.functions";

export const Route = createFileRoute("/_authenticated/coproducoes")({
  head: () => ({
    meta: [
      { title: "Coproduções — Wiize Recebe" },
      { name: "description", content: "Acompanhe as cobranças divididas com coprodutores e o valor líquido recebido em cada parcela." },
      { property: "og:title", content: "Coproduções — Wiize Recebe" },
      { property: "og:description", content: "Divisão do valor líquido recebido entre parceiros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const PAY: Record<string, string> = { paid: "Pago", refunded: "Estornado", cancelled: "Cancelado", overdue: "Em atraso" };
const pct = (n: number) => `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

type Inst = { number: number; count: number; status: string; received: number; refunded: boolean };
function Installments({ list }: { list: Inst[] }) {
  const { t: ui } = useTranslation("ui");
  return (
    <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
      {list.map((i) => (
        <li key={`${i.number}-${i.status}`} className="flex items-center justify-between gap-3 px-3 py-2">
          <span>{i.number}/{i.count} — {ui(PAY[i.status] ?? "Pendente")}</span>
          <span className="numeric-tabular font-medium">{i.status === "paid" || i.refunded ? formatBRL(i.received) : "—"}</span>
        </li>
      ))}
    </ul>
  );
}

function Page() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const list = useServerFn(listCoproductions);
  const cancel = useServerFn(cancelCoproduction);
  const retry = useServerFn(retryCoproductionSplit);
  const [tab, setTab] = useState<"created" | "participating">("created");
  const q = useQuery({ queryKey: ["coproductions"], queryFn: () => list() });
  const done = () => void qc.invalidateQueries({ queryKey: ["coproductions"] });
  const cancelMut = useMutation({ mutationFn: (id: string) => cancel({ data: { id } }), onSuccess: () => { toast.success(ui("Coprodução cancelada.")); done(); }, onError: (e: Error) => toast.error(e.message) });
  const retryMut = useMutation({ mutationFn: (id: string) => retry({ data: { id } }), onSuccess: () => { toast.success(ui("Divisão registrada no processador.")); done(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Coproduções")} description={ui("A divisão é aplicada sobre o valor líquido efetivamente recebido em cada pagamento, após as taxas aplicáveis.")} />
      <div className="inline-flex rounded-lg border border-border p-1">
        {([["created", "Que eu criei"], ["participating", "Que participo"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "ghost"} onClick={() => setTab(k)}>{ui(l)}</Button>
        ))}
      </div>
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError || !q.data ? <ErrorState onRetry={() => q.refetch()} /> : tab === "created" ? (
        q.data.created.length === 0 ? <EmptyState icon={<Handshake className="size-5" />} title={ui("Nenhuma coprodução criada")} text={ui("Ao criar uma cobrança, marque “Esta cobrança possui coprodutores”.")} /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {q.data.created.map((c: any) => (
              <article key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate font-semibold">{c.service}</h3><p className="truncate text-sm text-muted-foreground">{c.customer} · {formatBRL(c.total)}</p></div>
                  <StatusBadge tone={CP_STATUS[c.status]?.tone ?? "neutral"}>{ui(CP_STATUS[c.status]?.label ?? c.status)}</StatusBadge>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {c.participants.map((p: any) => (
                    <li key={p.id} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{p.name} · {pct(p.percentage)}{p.responsibility ? ` · ${p.responsibility}` : ""}</span><StatusBadge tone={CP_STATUS[p.status]?.tone ?? "neutral"}>{ui(CP_STATUS[p.status]?.label ?? p.status)}</StatusBadge></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs font-medium text-muted-foreground">{ui("Repassado aos coprodutores por parcela")}</p>
                <Installments list={c.installments} />
                {c.splitError && c.status === "active" ? <p className="mt-2 text-xs text-destructive">{ui("O processador ainda não registrou a divisão. O pagamento segue bloqueado.")}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === "active" && c.splitError ? <Button size="sm" onClick={() => retryMut.mutate(c.id)} disabled={retryMut.isPending}>{ui("Tentar novamente")}</Button> : null}
                  {c.status !== "cancelled" && !c.installments.some((i: Inst) => i.status === "paid") ? <Button size="sm" variant="outline" onClick={() => { if (confirm(ui("Cancelar esta coprodução? Para dividir de novo, crie uma nova cobrança."))) cancelMut.mutate(c.id); }} disabled={cancelMut.isPending}>{ui("Cancelar coprodução")}</Button> : null}
                </div>
              </article>
            ))}
          </div>
        )
      ) : q.data.participating.length === 0 ? <EmptyState icon={<Handshake className="size-5" />} title={ui("Você ainda não participa de coproduções")} text={ui("Quando alguém convidar você, o convite aparece aqui e no sininho.")} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.participating.map((c: any) => (
            <article key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="truncate font-semibold">{c.service}</h3><p className="truncate text-sm text-muted-foreground">{c.customer} · {ui("por")} {c.owner}</p></div>
                <StatusBadge tone={CP_STATUS[c.participantStatus]?.tone ?? "neutral"}>{ui(CP_STATUS[c.participantStatus]?.label ?? c.participantStatus)}</StatusBadge>
              </div>
              <p className="mt-2 text-sm">{ui("Participação")}: <strong>{pct(c.percentage)}</strong>{c.responsibility ? ` · ${c.responsibility}` : ""}</p>
              <p className="mt-3 text-xs font-medium text-muted-foreground">{ui("Valor líquido recebido por parcela")}</p>
              <Installments list={c.installments} />
              {c.participantStatus === "pending" ? <Button asChild size="sm" className="mt-3"><Link to="/coproducoes/$id" params={{ id: c.id }}>{ui("Ver convite")}</Link></Button> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
