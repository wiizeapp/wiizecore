import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminListSuggestions, adminSuggestionDetail, adminUpdateSuggestion, SUGGESTION_CATEGORIES, SUGGESTION_PRIORITIES, SUGGESTION_STATUSES } from "@/lib/help-center.functions";
import { SUGGESTION_CATEGORY_LABEL } from "@/components/help/help-parts";
import { DataPagination, EmptyState, ErrorState, SearchField, StatCard, StatGrid, StatusBadge, TableRowsSkeleton, matchesSearch, paginate } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  new: { label: "Nova", tone: "neutral" }, analysis: { label: "Em análise", tone: "warning" }, planned: { label: "Planejada", tone: "neutral" },
  in_progress: { label: "Em desenvolvimento", tone: "warning" }, done: { label: "Implementada", tone: "success" }, rejected: { label: "Não aprovada", tone: "danger" },
};
const PRIORITY: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta" };
const ACTION: Record<string, string> = { created: "Sugestão enviada", status: "Status alterado", priority: "Prioridade alterada", assigned: "Responsável definido", unassigned: "Responsável removido", note: "Nota interna adicionada" };

type Row = Awaited<ReturnType<typeof adminListSuggestions>>[number];

export function AdminSuggestions() {
  const list = useServerFn(adminListSuggestions);
  const q = useQuery({ queryKey: ["admin-suggestions"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = q.data ?? [];
  const filtered = useMemo(() => {
    const prio = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return items
      .filter((s) => (status === "all" || s.status === status) && (cat === "all" || s.category === cat) && (!from || s.created_at.slice(0, 10) >= from) && (!to || s.created_at.slice(0, 10) <= to) && matchesSearch(search, [s.title, s.description]))
      .sort((a, b) => sort === "old" ? a.created_at.localeCompare(b.created_at) : sort === "priority" ? (prio[a.priority]! - prio[b.priority]!) || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at));
  }, [items, status, cat, from, to, search, sort]);
  const pageRows = paginate(filtered, page, 20);
  const count = (s: string) => items.filter((x) => x.status === s).length;
  const current = items.find((s) => s.id === openId) ?? null;

  if (q.error) return <ErrorState text={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard label="Total" value={items.length} loading={q.isLoading} />
        <StatCard label="Novas" value={count("new")} loading={q.isLoading} />
        <StatCard label="Em análise" value={count("analysis")} loading={q.isLoading} />
        <StatCard label="Planejadas" value={count("planned")} loading={q.isLoading} />
        <StatCard label="Implementadas" value={count("done")} loading={q.isLoading} />
        <StatCard label="Não aprovadas" value={count("rejected")} loading={q.isLoading} />
      </StatGrid>
      <div className="surface-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchField value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Buscar por título ou descrição" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}><SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{SUGGESTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS[s]!.label}</SelectItem>)}</SelectContent></Select>
          <Select value={cat} onValueChange={(v) => { setCat(v); setPage(0); }}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{SUGGESTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{SUGGESTION_CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent></Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" aria-label="De" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" aria-label="Até" />
          <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Mais recentes</SelectItem><SelectItem value="old">Mais antigas</SelectItem><SelectItem value="priority">Prioridade</SelectItem></SelectContent></Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Título</TableHead><TableHead>Categoria</TableHead><TableHead>Usuário</TableHead><TableHead>Empresa</TableHead><TableHead>Envio</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead>Prioridade</TableHead><TableHead>Responsável</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.isLoading ? <TableRowsSkeleton cols={9} /> : pageRows.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)}>
                  <TableCell className="max-w-[260px] truncate font-medium">{s.title}</TableCell>
                  <TableCell className="text-xs">{SUGGESTION_CATEGORY_LABEL[s.category as keyof typeof SUGGESTION_CATEGORY_LABEL] ?? s.category}</TableCell>
                  <TableCell className="text-xs">{s.user_email ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.tenant_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(s.created_at)}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{s.source_page ?? "—"}</TableCell>
                  <TableCell><StatusBadge tone={STATUS[s.status]?.tone ?? "neutral"}>{STATUS[s.status]?.label ?? s.status}</StatusBadge></TableCell>
                  <TableCell className="text-xs">{PRIORITY[s.priority]}</TableCell>
                  <TableCell className="text-xs">{s.assigned_email ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!q.isLoading && !filtered.length ? <div className="p-4"><EmptyState title="Nenhuma sugestão encontrada" text="As sugestões enviadas pela Central de Ajuda aparecem aqui." /></div> : null}
        <div className="p-4"><DataPagination page={page} total={filtered.length} pageSize={20} onPageChange={setPage} /></div>
      </div>
      <SuggestionSheet row={current} onClose={() => setOpenId(null)} />
    </div>
  );
}

function SuggestionSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const detailFn = useServerFn(adminSuggestionDetail);
  const updateFn = useServerFn(adminUpdateSuggestion);
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const d = useQuery({ queryKey: ["admin-suggestion", row?.id], queryFn: () => detailFn({ data: { id: row!.id } }), enabled: !!row });
  const m = useMutation({
    mutationFn: (patch: { status?: (typeof SUGGESTION_STATUSES)[number]; priority?: (typeof SUGGESTION_PRIORITIES)[number]; assignToMe?: boolean; unassign?: boolean; note?: string }) => updateFn({ data: { id: row!.id, ...patch } }),
    onSuccess: () => { setNote(""); void qc.invalidateQueries({ queryKey: ["admin-suggestions"] }); void qc.invalidateQueries({ queryKey: ["admin-suggestion", row?.id] }); toast.success("Sugestão atualizada."); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {row ? <>
          <SheetHeader><SheetTitle className="pr-6 text-left">{row.title}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-muted-foreground">Usuário</p><p>{row.user_email ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Empresa</p><p>{row.tenant_name ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Enviada em</p><p>{formatDateTime(row.created_at)}</p></div>
              <div><p className="text-muted-foreground">Categoria</p><p>{SUGGESTION_CATEGORY_LABEL[row.category as keyof typeof SUGGESTION_CATEGORY_LABEL]}</p></div>
              <div className="col-span-2"><p className="text-muted-foreground">Página de origem</p><p className="break-all">{row.source_page ?? "—"}</p></div>
            </div>
            <div><p className="mb-1 text-xs text-muted-foreground">Descrição</p><p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">{row.description}</p></div>
            {d.data?.extra ? <div><p className="mb-1 text-xs text-muted-foreground">Informações adicionais</p><p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">{d.data.extra}</p></div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="mb-1 text-xs text-muted-foreground">Status</p><Select value={row.status} onValueChange={(v) => m.mutate({ status: v as (typeof SUGGESTION_STATUSES)[number] })} disabled={m.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUGGESTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS[s]!.label}</SelectItem>)}</SelectContent></Select></div>
              <div><p className="mb-1 text-xs text-muted-foreground">Prioridade</p><Select value={row.priority} onValueChange={(v) => m.mutate({ priority: v as (typeof SUGGESTION_PRIORITIES)[number] })} disabled={m.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUGGESTION_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY[p]}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Responsável:</span><span>{row.assigned_email ?? "ninguém"}</span>
              <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ assignToMe: true })}>Assumir</Button>
              {row.assigned_to ? <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ unassign: true })}>Remover</Button> : null}</div>
            <div>
              <p className="mb-1 text-xs font-medium">Notas internas <span className="font-normal text-muted-foreground">(nunca visíveis ao cliente)</span></p>
              <div className="space-y-2">{(d.data?.notes ?? []).map((n) => <div key={n.id} className="rounded-lg border border-border p-3"><p className="whitespace-pre-wrap">{n.note}</p><p className="mt-1 text-[11px] text-muted-foreground">{n.author} · {formatDateTime(n.created_at)}</p></div>)}</div>
              <Textarea className="mt-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adicionar nota interna" maxLength={4000} />
              <Button size="sm" className="mt-2" disabled={!note.trim() || m.isPending} onClick={() => m.mutate({ note })}>Salvar nota</Button>
            </div>
            <div><p className="mb-2 text-xs font-medium">Histórico</p>
              <ol className="space-y-1.5 text-xs">{(d.data?.events ?? []).map((e) => <li key={e.id} className="flex justify-between gap-3 border-b border-border pb-1.5"><span>{ACTION[e.action] ?? e.action}{e.action === "status" ? `: ${STATUS[e.from_value ?? ""]?.label ?? "—"} → ${STATUS[e.to_value ?? ""]?.label ?? "—"}` : e.action === "priority" ? `: ${PRIORITY[e.from_value ?? ""] ?? "—"} → ${PRIORITY[e.to_value ?? ""] ?? "—"}` : ""}</span><span className="shrink-0 text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}</span></li>)}</ol>
            </div>
          </div>
        </> : null}
      </SheetContent>
    </Sheet>
  );
}
