import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/states";
import { exportAuditEvents, getAuditOverview, listAuditEvents, verifyAuditIntegrity } from "@/lib/audit-admin.functions";

const CATEGORIES = ["auth", "security", "financial", "tenant", "admin", "integration", "system"] as const;
const CAT_LABEL: Record<string, string> = { auth: "Login", security: "Segurança", financial: "Financeiro", tenant: "Empresas", admin: "Administração", integration: "Integrações", system: "Sistema" };
const RESULT_LABEL: Record<string, string> = { success: "Sucesso", failure: "Falha", blocked: "Bloqueado" };
const ALL = "__all";

type Filters = Partial<Record<"from" | "to" | "category" | "result" | "risk" | "search" | "action", string | undefined>>;

/** Seção "Auditoria e Segurança" do painel administrativo. Todo acesso é validado e registrado no servidor. */
export function AdminAuditSecurity() {
  const { t: ui } = useTranslation("ui");
  const overviewFn = useServerFn(getAuditOverview);
  const listFn = useServerFn(listAuditEvents);
  const exportFn = useServerFn(exportAuditEvents);
  const verifyFn = useServerFn(verifyAuditIntegrity);
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  const overview = useQuery({ queryKey: ["audit-overview"], queryFn: () => overviewFn({ data: { days: 7 } }) });
  const list = useQuery({
    queryKey: ["audit-list", filters, page],
    queryFn: () => listFn({ data: { ...clean(filters), page, pageSize: 50 } as never }),
    placeholderData: keepPreviousData,
  });
  const integrity = useMutation({ mutationFn: () => verifyFn(), onError: (e: Error) => toast.error(ui(e.message)) });
  const exporter = useMutation({
    mutationFn: (format: "csv" | "json") => exportFn({ data: { ...clean(filters), format } as never }),
    onSuccess: (r) => {
      const blob = new Blob([r.content], { type: r.filename.endsWith(".csv") ? "text/csv" : "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    onError: (e: Error) => toast.error(ui(e.message)),
  });

  const o = overview.data;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={ui("Falhas de login e 2FA (7 dias)")} value={o?.failedLogins} loading={overview.isLoading} />
        <Stat label={ui("Ações bloqueadas (7 dias)")} value={o?.blocked} loading={overview.isLoading} />
        <Stat label={ui("Mudanças de permissão (7 dias)")} value={o?.permissionChanges} loading={overview.isLoading} />
        <Stat label={ui("Eventos de risco alto (7 dias)")} value={o?.highRisk} loading={overview.isLoading} />
      </div>
      {overview.isError ? <p className="text-sm text-destructive">{ui("Não foi possível carregar")}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="surface-panel space-y-2 p-4">
          <h3 className="text-sm font-semibold">{ui("Eventos por categoria (7 dias)")}</h3>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => { setDraft((d) => ({ ...d, category: c })); setFilters((f) => ({ ...f, category: c })); setPage(0); }}
                className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="block text-xs text-muted-foreground">{ui(CAT_LABEL[c] ?? c)}</span>
                <span className="font-semibold tabular-nums">{o ? (o.byCategory as Record<string, number>)[c] ?? 0 : "—"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="surface-panel space-y-2 p-4">
          <h3 className="text-sm font-semibold">{ui("Alertas de segurança recentes")}</h3>
          {o && o.alerts.length === 0 ? <p className="text-sm text-muted-foreground">{ui("Nenhum alerta no período.")}</p> : null}
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {(o?.alerts ?? []).map((a: any) => (
              <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.event_type}</span><Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>{a.severity}</Badge></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="surface-panel space-y-3 p-4">
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPage(0); }}>
          <Input type="date" aria-label={ui("De")} value={draft.from ?? ""} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          <Input type="date" aria-label={ui("Até")} value={draft.to ?? ""} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          <Pick value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} placeholder={ui("Categoria")} options={CATEGORIES.map((c) => [c, ui(CAT_LABEL[c] ?? c)])} />
          <Pick value={draft.result} onChange={(v) => setDraft({ ...draft, result: v })} placeholder={ui("Resultado")} options={Object.entries(RESULT_LABEL).map(([k, v]) => [k, ui(v)])} />
          <Pick value={draft.risk} onChange={(v) => setDraft({ ...draft, risk: v })} placeholder={ui("Risco")} options={[["low", ui("Baixo")], ["medium", ui("Médio")], ["high", ui("Alto")], ["critical", ui("Crítico")]]} />
          <Input placeholder={ui("ID do evento ou de correlação")} value={draft.search ?? ""} onChange={(e) => setDraft({ ...draft, search: e.target.value })} maxLength={80} />
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit" size="sm">{ui("Filtrar")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft({}); setFilters({}); setPage(0); }}>{ui("Limpar filtros")}</Button>
            <span className="flex-1" />
            <Button type="button" size="sm" variant="outline" disabled={integrity.isPending} onClick={() => integrity.mutate()}>
              {integrity.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{ui("Verificar integridade")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={exporter.isPending} onClick={() => exporter.mutate("csv")}><Download />CSV</Button>
            <Button type="button" size="sm" variant="outline" disabled={exporter.isPending} onClick={() => exporter.mutate("json")}><Download />JSON</Button>
          </div>
        </form>
        {integrity.data ? (
          <p className={`text-sm ${integrity.data.ok ? "text-primary" : "text-destructive"}`}>
            {integrity.data.ok
              ? ui("Corrente íntegra: {{n}} registros conferidos ({{legacy}} antigos sem hash).", { n: integrity.data.checked, legacy: integrity.data.legacy })
              : ui("Divergência encontrada no registro nº {{seq}}. Um alerta crítico foi criado.", { seq: integrity.data.brokenSeq })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{ui("Consultas limitadas a 90 dias. Toda consulta e exportação fica registrada.")}</p>

        {list.isError ? (
          <div className="py-6 text-center"><p className="text-sm text-destructive">{ui(list.error instanceof Error ? list.error.message : "Não foi possível carregar")}</p><Button className="mt-3" size="sm" onClick={() => void list.refetch()}>{ui("Tentar novamente")}</Button></div>
        ) : list.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={ui("Carregando...")} /></div>
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <EmptyState title={ui("Nenhum registro encontrado")} text={ui("Ajuste os filtros ou o período.")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{ui("Data (UTC)")}</TableHead><TableHead>{ui("Categoria")}</TableHead><TableHead>{ui("Ação")}</TableHead>
                <TableHead>{ui("Resultado")}</TableHead><TableHead>{ui("Risco")}</TableHead><TableHead>{ui("Origem")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {list.data!.rows.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">{String(r.created_at).replace("T", " ").slice(0, 19)}</TableCell>
                    <TableCell className="text-xs">{r.category ? ui(CAT_LABEL[r.category] ?? r.category) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.action}</TableCell>
                    <TableCell><Badge variant={r.result === "success" ? "secondary" : "destructive"}>{ui(RESULT_LABEL[r.result] ?? r.result)}</Badge></TableCell>
                    <TableCell className="text-xs">{r.risk ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.origin ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{ui("Página {{p}}", { p: page + 1 })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || list.isFetching} onClick={() => setPage((p) => p - 1)}>{ui("Anterior")}</Button>
            <Button size="sm" variant="outline" disabled={(list.data?.rows.length ?? 0) < 50 || list.isFetching} onClick={() => setPage((p) => p + 1)}>{ui("Próxima")}</Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{ui("Detalhes do evento")}</DialogTitle></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs">{detail ? JSON.stringify(detail, null, 2) : ""}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function clean(f: Filters) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v && v !== ALL) out[k] = k === "to" ? `${v}T23:59:59Z` : v;
  return out;
}

function Stat({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="surface-panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value ?? "—"}</p>
    </div>
  );
}

function Pick({ value, onChange, placeholder, options }: { value?: string | undefined; onChange: (v: string) => void; placeholder: string; options: (readonly [string, string])[] | string[][] }) {
  return (
    <Select value={value ?? ALL} onValueChange={onChange}>
      <SelectTrigger aria-label={placeholder}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map(([k, v]) => <SelectItem key={k} value={k as string}>{v}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
