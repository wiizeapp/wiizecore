import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RefreshCw, Eye } from "lucide-react";
import { getAdminCardRisk, getAdminCardRiskHistory, decideAdminCardRisk } from "@/lib/admin-card-risk.functions";
import { CARD_RISK_REASON_LABELS, canDecide, type CardRiskAction } from "@/lib/card-risk-rules";
import { DataPagination, DataTableShell, ErrorState, ListSkeleton, StatCard, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

const STATUS: Record<string, string> = { open: "Em análise", confirmed: "Confirmado", false_positive: "Falso positivo", closed: "Encerrado" };
const ACTIONS: Record<CardRiskAction, string> = { confirm: "Confirmar suspeita", false_positive: "Marcar falso positivo", unblock: "Desbloquear", close: "Encerrar" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Case = Awaited<ReturnType<typeof getAdminCardRisk>>["cases"][number];

export function AdminCardRisk() {
  const { t: ui } = useTranslation("ui");
  const [page, setPage] = useState(0), [status, setStatus] = useState("all"), [level, setLevel] = useState("all"), [reason, setReason] = useState("all");
  const [days, setDays] = useState("7"), [tenantId, setTenantId] = useState(""), [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Case | null>(null), [action, setAction] = useState<CardRiskAction | null>(null), [justification, setJustification] = useState("");
  const read = useServerFn(getAdminCardRisk), readHistory = useServerFn(getAdminCardRiskHistory), decide = useServerFn(decideAdminCardRisk);
  const qc = useQueryClient();
  const valid = (!tenantId || UUID.test(tenantId)) && (!search || UUID.test(search));
  const q = useQuery({
    queryKey: ["admin-card-risk", page, status, level, reason, days, tenantId, search], enabled: valid,
    queryFn: () => read({ data: { page, days: Number(days), status: status === "all" ? undefined : status as never, level: level === "all" ? undefined : level as never, reason: reason === "all" ? undefined : reason, tenantId: tenantId || undefined, search: search || undefined } }),
  });
  const h = useQuery({ queryKey: ["admin-card-risk-history", selected?.id], enabled: Boolean(selected), queryFn: () => readHistory({ data: { id: selected!.id } }) });
  const m = useMutation({
    mutationFn: () => decide({ data: { caseId: selected!.id, action: action!, justification, version: selected!.version } }),
    onSuccess: () => { toast.success(ui("Decisão registrada.")); setAction(null); setJustification(""); setSelected(null); void qc.invalidateQueries({ queryKey: ["admin-card-risk"] }); },
    onError: (e: Error) => toast.error(ui(e.message)),
  });
  const reset = () => setPage(0);
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{ui("Antifraude do cartão")}</h2><p className="text-sm text-muted-foreground">{ui("Casos gerados pelas regras de comportamento suspeito do checkout. Bloqueios duram 1 hora.")}</p></div>
      <Button variant="outline" size="icon" onClick={() => void q.refetch()} aria-label={ui("Atualizar")}><RefreshCw className="size-4" /></Button>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label={ui("Eventos suspeitos")} value={q.data?.summary.events ?? "—"} loading={q.isPending} />
      <StatCard label={ui("Casos em aberto")} value={q.data?.summary.open ?? "—"} loading={q.isPending} />
      <StatCard label={ui("Bloqueios ativos")} value={q.data?.summary.blocked ?? "—"} loading={q.isPending} />
      <StatCard label={ui("Casos revisados")} value={q.data?.summary.reviewed ?? "—"} loading={q.isPending} />
    </div>
    <DataTableShell toolbar={<>
      <Input className="sm:max-w-xs" value={search} onChange={(e) => { setSearch(e.target.value.trim()); reset(); }} placeholder={ui("Código do caso ou da cobrança")} aria-label={ui("Código do caso ou da cobrança")} />
      <Input className="sm:max-w-xs" value={tenantId} onChange={(e) => { setTenantId(e.target.value.trim()); reset(); }} placeholder={ui("Identificador da empresa")} aria-label={ui("Identificador da empresa")} />
      <Select value={days} onValueChange={(v) => { setDays(v); reset(); }}><SelectTrigger className="sm:w-36" aria-label={ui("Período")}><SelectValue /></SelectTrigger><SelectContent>{["1", "7", "30", "90"].map((d) => <SelectItem key={d} value={d}>{ui(d === "1" ? "Últimas 24h" : `Últimos ${d} dias`)}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={(v) => { setStatus(v); reset(); }}><SelectTrigger className="sm:w-40" aria-label={ui("Status")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ui("Todos os status")}</SelectItem>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{ui(v)}</SelectItem>)}</SelectContent></Select>
      <Select value={level} onValueChange={(v) => { setLevel(v); reset(); }}><SelectTrigger className="sm:w-36" aria-label={ui("Nível de risco")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ui("Todos os níveis")}</SelectItem><SelectItem value="high">{ui("Alto")}</SelectItem><SelectItem value="medium">{ui("Médio")}</SelectItem></SelectContent></Select>
      <Select value={reason} onValueChange={(v) => { setReason(v); reset(); }}><SelectTrigger className="sm:w-56" aria-label={ui("Motivo")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ui("Todos os motivos")}</SelectItem>{Object.entries(CARD_RISK_REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{ui(v)}</SelectItem>)}</SelectContent></Select>
    </>}>
      {!valid ? <p className="p-4 text-sm text-destructive">{ui("Informe um código válido.")}</p> : q.isPending ? <ListSkeleton /> : q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : <>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow>{["Última ocorrência", "Empresa", "Origem do sinal", "Motivos", "Nível", "Status", "Bloqueio", "Tentativas", ""].map((v) => <TableHead key={v}>{v ? ui(v) : null}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{q.data?.cases.map((c) => <TableRow key={c.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(c.last_seen_at)}</TableCell>
            <TableCell className="font-medium">{c.tenantName}</TableCell>
            <TableCell>{ui(c.subject_kind === "origin" ? "Mesma origem" : "Mesmo cartão")}</TableCell>
            <TableCell className="max-w-64 text-sm">{c.reasons.map((r) => ui(CARD_RISK_REASON_LABELS[r] ?? r)).join(" · ")}</TableCell>
            <TableCell><StatusBadge tone={c.level === "high" ? "danger" : "warning"}>{ui(c.level === "high" ? "Alto" : "Médio")}</StatusBadge></TableCell>
            <TableCell>{ui(STATUS[c.status] ?? c.status)}</TableCell>
            <TableCell className="whitespace-nowrap text-sm">{c.blockActive && c.blocked_until ? `${ui("Ativo até")} ${formatDateTime(c.blocked_until)}` : ui("Sem bloqueio")}</TableCell>
            <TableCell className="numeric-tabular">{c.attempts}</TableCell>
            <TableCell><Button size="icon" variant="ghost" aria-label={ui("Ver detalhes")} onClick={() => setSelected(c)}><Eye className="size-4" /></Button></TableCell>
          </TableRow>)}
          {!q.data?.cases.length ? <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">{ui("Nenhum caso suspeito encontrado")}</TableCell></TableRow> : null}</TableBody></Table></div>
        <DataPagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} />
      </>}
    </DataTableShell>
    <Dialog open={Boolean(selected)} onOpenChange={(o) => { if (!o) { setSelected(null); setAction(null); setJustification(""); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ui("Detalhes do caso")}</DialogTitle></DialogHeader>
        {selected ? <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">{ui("Código do caso")}</dt><dd className="break-all">{selected.id}</dd>
            <dt className="text-muted-foreground">{ui("Última cobrança")}</dt><dd className="break-all">{selected.last_payment_id ?? "—"}</dd>
            <dt className="text-muted-foreground">{ui("Primeira ocorrência")}</dt><dd>{formatDateTime(selected.first_seen_at)}</dd>
            <dt className="text-muted-foreground">{ui("Tentativas registradas")}</dt><dd>{selected.attempts}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">{(Object.keys(ACTIONS) as CardRiskAction[]).filter((a) => canDecide(selected.status, a) && (a !== "unblock" || selected.blockActive)).map((a) => <Button key={a} size="sm" variant={action === a ? "default" : "outline"} onClick={() => setAction(a)}>{ui(ACTIONS[a])}</Button>)}</div>
          {action ? <div className="space-y-2">
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} maxLength={1000} placeholder={ui("Justificativa obrigatória (mínimo 10 caracteres)")} aria-label={ui("Justificativa")} />
            <Button disabled={justification.trim().length < 10 || m.isPending} onClick={() => m.mutate()}>{ui("Registrar decisão")}</Button>
          </div> : null}
          <div><h3 className="mb-2 font-semibold">{ui("Histórico de decisões")}</h3>
            {h.isPending ? <ListSkeleton /> : h.isError ? <ErrorState onRetry={() => void h.refetch()} /> : <ol className="space-y-3">{h.data?.map((d) => <li key={d.id} className="border-b border-border pb-2"><p className="font-medium">{ui(ACTIONS[d.action as CardRiskAction] ?? d.action)} · {d.actor}</p><p className="text-muted-foreground">{formatDateTime(d.created_at)}</p><p className="mt-1 break-words">{d.justification}</p></li>)}{!h.data?.length ? <li className="text-muted-foreground">{ui("Nenhuma decisão registrada")}</li> : null}</ol>}
          </div>
        </div> : null}
      </DialogContent>
    </Dialog>
  </div>;
}
