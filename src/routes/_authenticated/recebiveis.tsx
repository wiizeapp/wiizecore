import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Columns3, Download, Inbox, List, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { DataPagination, PageContainer, PageHeader, SummaryStrip, DataTableShell, StatusBadge, EmptyState, ErrorState, paginate } from "@/components/ds";
import { DataLoading, TableRowsSkeleton, TableStateRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ChargeSheet, type SheetGroup } from "@/components/charges/charge-sheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate, formatDocument } from "@/lib/format";
import { paymentMethodLabels, paymentStatusLabels } from "@/lib/labels";
import { OPEN_STATUSES, daysLate, isOpen, isOverdue, summarize, todayBR, type SummaryRow } from "@/lib/financial-summary";
import { authorizeExport } from "@/lib/exports.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/recebiveis")({
  head: () => ({
    meta: [
      { title: "Recebíveis — WiizePay" },
      { name: "description", content: "Quem pagou, quem está em aberto e quem está inadimplente, com filtros e exportação para Excel." },
      { property: "og:title", content: "Recebíveis — WiizePay" },
      { property: "og:description", content: "Controle de pagos, em aberto e inadimplentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Recebiveis,
});

type View = "todos" | "pagos" | "abertos" | "inadimplentes";
type DisplayMode = "table" | "kanban";
type Row = {
  id: string; charge_group_id: string | null; description: string | null; status: string; method: string; gross_amount: number; net_amount: number | null;
  platform_fee_amount: number | null; refunded_amount: number | null; due_on: string | null; paid_at: string | null;
  installment_number: number | null; installment_count: number | null; customer_id: string | null; created_at: string;
  customers: { name: string; document: string | null } | null;
};
const PAGE = 25;
const SELECT = "id, charge_group_id, description, status, method, gross_amount, net_amount, platform_fee_amount, refunded_amount, due_on, paid_at, installment_number, installment_count, customer_id, created_at, customers(name, document)";

function Recebiveis() {
  const { t: ui } = useTranslation("ui");
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId as string | undefined;
  const exportAuth = useServerFn(authorizeExport);
  const [view, setView] = useState<View>("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customer, setCustomer] = useState("all");
  const [method, setMethod] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table");
  const [kanbanPages, setKanbanPages] = useState({ pending: 0, overdue: 0, paid: 0 });
  const [selectedReceivable, setSelectedReceivable] = useState<Row | null>(null);
  const today = todayBR();

  const { data: customers } = useQuery({
    queryKey: ["customers-simple", tenantId, "rec"],
    enabled: Boolean(tenantId),
    queryFn: async () => (await supabase.from("customers").select("id, name").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });

  // Mesmos filtros para a lista, os totais e a exportação.
  function build(select: string, includeView = true) {
    let query = supabase.from("payments").select(select, { count: "exact" }).eq("tenant_id", tenantId!).not("status", "in", "(cancelled,failed)");
    if (includeView && view === "pagos") query = query.in("status", ["paid", "refunded"]);
    if (includeView && view === "abertos") query = query.in("status", [...OPEN_STATUSES]).gte("due_on", today);
    if (includeView && view === "inadimplentes") query = query.or(`status.eq.overdue,and(status.in.(${OPEN_STATUSES.join(",")}),due_on.lt.${today})`);
    if (from) query = query.gte("due_on", from);
    if (to) query = query.lte("due_on", to);
    if (customer !== "all") query = query.eq("customer_id", customer);
    if (method !== "all") query = query.eq("method", method as never);
    if (q.trim()) query = query.ilike("description", `%${q.trim().replace(/[%,()]/g, "")}%`);
    return query;
  }
  const key = [tenantId, view, from, to, customer, method, q];

  const list = useQuery({
    queryKey: ["recebiveis", ...key, page],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error, count } = await build(SELECT).order("due_on", { ascending: view !== "pagos" }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });
  const totals = useQuery({
    queryKey: ["recebiveis-totais", ...key],
    enabled: Boolean(tenantId),
    queryFn: async () => fetchAll(() => build("status, gross_amount, net_amount, platform_fee_amount, refunded_amount, due_on")),
  });
  const kanban = useQuery({
    queryKey: ["recebiveis-kanban", tenantId, from, to, customer, method, q],
    enabled: Boolean(tenantId) && displayMode === "kanban",
    queryFn: async () => (await fetchAll(() => build(SELECT, false))) as Row[],
  });
  const chargeDetail = useQuery({
    queryKey: ["receivable-charge-detail", tenantId, selectedReceivable?.charge_group_id, selectedReceivable?.id],
    enabled: Boolean(tenantId && selectedReceivable),
    queryFn: async () => {
      if (!selectedReceivable) return [] as Row[];
      let query = supabase.from("payments").select(SELECT).eq("tenant_id", tenantId!);
      query = selectedReceivable.charge_group_id ? query.eq("charge_group_id", selectedReceivable.charge_group_id) : query.eq("id", selectedReceivable.id);
      const { data, error } = await query.order("due_on", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const t = useMemo(() => summarize((totals.data ?? []) as unknown as SummaryRow[], today), [totals.data, today]);

  async function fetchAll(make: () => ReturnType<typeof build>) {
    const out: unknown[] = [];
    for (let i = 0; i < 400; i++) {
      const { data, error } = await make().order("due_on", { ascending: true }).range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function exportXlsx(kind: "cobrancas" | "pagamentos" | "inadimplencia" | "saques" | "extrato") {
    if (!tenantId) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const brDate = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(v.length === 10 ? `${v}T12:00:00-03:00` : v)) : "");
      let rows: Record<string, string | number>[] = [];
      let money: string[] = [];
      if (kind === "saques") {
        const { data } = await supabase.from("withdrawals").select("requested_at, amount, fee_amount, net_amount, status, completed_at").eq("tenant_id", tenantId).order("requested_at", { ascending: false }).limit(50000);
        rows = (data ?? []).map((w) => ({ "Solicitado em": brDate(w.requested_at), Valor: Number(w.amount), Taxa: Number(w.fee_amount), "Líquido": Number(w.net_amount), Status: w.status, "Concluído em": brDate(w.completed_at) }));
        money = ["Valor", "Taxa", "Líquido"];
      } else if (kind === "extrato") {
        const { data } = await supabase.from("transactions").select("occurred_at, kind, description, amount").eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(50000);
        rows = (data ?? []).map((x) => ({ Data: brDate(x.occurred_at), Tipo: x.kind === "provider_fee" || x.kind === "platform_fee" ? "Taxa financeira" : x.kind, "Descrição": x.description ?? "", Valor: Number(x.amount) }));
        money = ["Valor"];
      } else {
        const all = (await fetchAll(() => build(SELECT))) as Row[];
        const src = kind === "pagamentos" ? all.filter((r) => r.status === "paid" || r.status === "refunded") : kind === "inadimplencia" ? all.filter((r) => isOverdue(r, today)) : all;
        rows = src.map((r) => ({
          Cliente: r.customers?.name ?? "",
          "CPF/CNPJ": formatDocument(r.customers?.document),
          "Descrição": r.description ?? "",
          Parcela: r.installment_count ? `${r.installment_number}/${r.installment_count}` : "Única",
          Forma: paymentMethodLabels[r.method] ?? r.method,
          Vencimento: brDate(r.due_on),
          Valor: Number(r.gross_amount),
          ...(kind === "inadimplencia" ? { "Dias em atraso": daysLate(r.due_on, today) } : {}),
          ...(kind !== "inadimplencia" ? { "Pago em": brDate(r.paid_at), Taxas: r.paid_at ? Math.round((Number(r.gross_amount) - Number(r.net_amount ?? r.gross_amount)) * 100) / 100 : 0, "Líquido": r.paid_at ? Number(r.net_amount ?? 0) : 0 } : {}),
          Status: isOverdue(r, today) ? "Vencida" : paymentStatusLabels[r.status] ?? r.status,
        }));
        money = ["Valor", "Taxas", "Líquido"];
      }
      await exportAuth({ data: { kind, filters: { view, from, to, customer, method, q }, rows: rows.length } });
      const { safeSpreadsheetRows } = await import("@/lib/spreadsheet-safety");
      const ws = XLSX.utils.json_to_sheet(safeSpreadsheetRows(rows));
      const headers = rows.length ? Object.keys(rows[0]!) : ["Sem dados"];
      if (rows.length) {
        const n = rows.length;
        const totalRow: Record<string, string | { f: string }> = { [headers[0]!]: "Total" };
        headers.forEach((h, i) => {
          if (money.includes(h)) {
            const col = XLSX.utils.encode_col(i);
            totalRow[h] = { f: `SUM(${col}2:${col}${n + 1})` };
          }
        });
        XLSX.utils.sheet_add_json(ws, [totalRow], { skipHeader: true, origin: -1 });
        headers.forEach((h, i) => {
          if (!money.includes(h)) return;
          for (let r = 1; r <= n + 1; r++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c: i })];
            if (cell) cell.z = '"R$" #,##0.00;-"R$" #,##0.00';
          }
        });
      }
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));
      ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, kind.slice(0, 30));
      XLSX.writeFile(wb, `wiizepay-${kind}-${today}.xlsx`);
      toast.success(`Planilha gerada com ${rows.length} linha(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setExporting(false);
    }
  }

  const reset = () => { setPage(0); setKanbanPages({ pending: 0, overdue: 0, paid: 0 }); };
  const rows = list.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE));
  const detailGroup = useMemo<SheetGroup | null>(() => {
    const detailRows = chargeDetail.data ?? [];
    if (!selectedReceivable || !detailRows.length) return null;
    const next = detailRows.find((row) => isOpen(row.status) || row.status === "overdue") ?? detailRows[detailRows.length - 1]!;
    return {
      id: selectedReceivable.charge_group_id ?? selectedReceivable.id,
      customer: next.customers?.name ?? "Cliente não informado",
      customerId: next.customer_id,
      items: detailRows,
      next,
    };
  }, [chargeDetail.data, selectedReceivable]);

  return (
    <PageContainer>
      <PageHeader
        title={ui("Recebíveis")}
        description="Quem pagou, o que está em aberto e quem está inadimplente. Os números seguem os filtros abaixo."
        action={
          <Select onValueChange={(v) => void exportXlsx(v as never)} disabled={exporting}>
            <SelectTrigger className="w-full sm:w-[210px]"><Download className="size-4" /><SelectValue placeholder={exporting ? "Gerando…" : "Exportar Excel"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cobrancas">Cobranças (filtradas)</SelectItem>
              <SelectItem value="pagamentos">Pagamentos recebidos</SelectItem>
              <SelectItem value="inadimplencia">Inadimplência</SelectItem>
              <SelectItem value="saques">Saques</SelectItem>
              <SelectItem value="extrato">Extrato</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <SummaryStrip cols={5} items={[
        { label: ui("Faturado"), value: totals.isLoading ? null : formatBRL(t.billed), hint: `${t.paidCount} parcela(s) paga(s)` },
        { label: ui("Pago"), value: totals.isLoading ? null : formatBRL(t.paid), accent: true, hint: `${t.paidCount} ${ui("pagamento(s)")}` },
        { label: ui("Em aberto"), value: totals.isLoading ? null : formatBRL(t.pending) },
        { label: "Vencido", value: totals.isLoading ? null : formatBRL(t.overdue), hint: `${t.overdueCount} parcela(s)` },
        { label: "Líquido", value: totals.isLoading ? null : formatBRL(t.net), hint: `Taxas ${formatBRL(t.fees)}` },
      ]} />

      <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        {displayMode === "table" ? <div role="tablist" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
          {([["todos", ui("Todos")], ["pagos", "Quem pagou"], ["abertos", ui("A receber")], ["inadimplentes", ui("Vencidos")]] as const).map(([id, label]) => (
            <Button key={id} role="tab" aria-selected={view === id} variant="ghost" size="sm" onClick={() => { setView(id); reset(); }}
              className={`whitespace-nowrap ${view === id ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground"}`}>
              {label}
            </Button>
          ))}
        </div> : <p className="text-sm text-muted-foreground">Todos os recebíveis organizados por situação.</p>}
        <div className="flex w-fit shrink-0 rounded-lg border border-border bg-card p-1" aria-label="Visualização dos recebíveis">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDisplayMode("table")} className={displayMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground"}><List /> Tabela</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setDisplayMode("kanban"); setView("todos"); setPage(0); }} className={displayMode === "kanban" ? "bg-muted text-foreground" : "text-muted-foreground"}><Columns3 /> Kanban</Button>
        </div>
      </div>

      <DataTableShell
        toolbar={
          <>
            <div className="relative min-w-full flex-1 sm:min-w-[220px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar pela descrição" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
            </div>
            <Select value={customer} onValueChange={(v) => { setCustomer(v); reset(); }}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder={ui("Cliente")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {(customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={(v) => { setMethod(v); reset(); }}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Forma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as formas</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="boleto">{ui("Boleto")}</SelectItem>
                <SelectItem value="credit_card">{ui("Cartão")}</SelectItem>
              </SelectContent>
            </Select>
            <label className="grid min-w-[150px] flex-1 gap-1 text-xs text-muted-foreground sm:flex-none">Vence de<Input type="date" className="w-full sm:w-[150px]" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} /></label>
            <label className="grid min-w-[150px] flex-1 gap-1 text-xs text-muted-foreground sm:flex-none">Vence até<Input type="date" className="w-full sm:w-[150px]" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} /></label>
          </>
        }
      >
        {displayMode === "table" ? <><Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ui("Cliente")}</TableHead>
              <TableHead>Cobrança</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? <TableRowsSkeleton cols={5} /> : list.isError ? (
              <TableStateRow cols={5}><ErrorState onRetry={() => list.refetch()} /></TableStateRow>
            ) : rows.length ? rows.map((r) => {
              const late = isOverdue(r, today);
              return (
                 <TableRow key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => setSelectedReceivable(r)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedReceivable(r); } }}>
                   <TableCell className="font-medium"><Button type="button" variant="link" className="h-auto max-w-full justify-start truncate p-0 text-foreground hover:text-primary" onClick={() => setSelectedReceivable(r)}>{r.customers?.name ?? "—"}</Button></TableCell>
                    <TableCell><Button type="button" variant="link" className="h-auto max-w-full justify-start truncate p-0 font-medium text-foreground hover:text-primary" onClick={() => setSelectedReceivable(r)}>{r.description ?? "Cobrança"}</Button><span className="block text-xs text-muted-foreground">{r.installment_count ? `Parcela ${r.installment_number}/${r.installment_count}` : "Pagamento único"} · {paymentMethodLabels[r.method] ?? r.method}</span></TableCell>
                  <TableCell>{formatDate(r.due_on)}{late ? <span className="block text-xs text-destructive">{daysLate(r.due_on, today)} dia(s) em atraso</span> : r.paid_at ? <span className="block text-xs text-muted-foreground">pago em {formatDate(r.paid_at)}</span> : null}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.gross_amount)}</TableCell>
                  <TableCell><StatusBadge tone={r.status === "paid" ? "success" : late ? "danger" : "warning"}>{late ? "Vencida" : paymentStatusLabels[r.status] ?? r.status}</StatusBadge></TableCell>
                </TableRow>
              );
            }) : <TableStateRow cols={5}><EmptyState icon={<Inbox className="size-5" />} title="Nada encontrado" text="Altere os filtros para consultar outros recebíveis." /></TableStateRow>}
          </TableBody>
        </Table>
        <div className="flex flex-col gap-3 border-t border-border p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>{list.data?.count ?? 0} registro(s)</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{ui("Anterior")}</Button>
            <span>{page + 1} de {pages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{ui("Próxima")}</Button>
          </div>
        </div></> : <ReceivablesKanban rows={kanban.data ?? []} loading={kanban.isLoading} error={kanban.isError} onRetry={() => kanban.refetch()} today={today} pages={kanbanPages} onOpen={setSelectedReceivable} onPageChange={(column, nextPage) => setKanbanPages((current) => ({ ...current, [column]: nextPage }))} />}
      </DataTableShell>
      <ChargeSheet group={detailGroup} onClose={() => setSelectedReceivable(null)} />
    </PageContainer>
  );
}

type KanbanColumnKey = "pending" | "overdue" | "paid";
const KANBAN_PAGE_SIZE = 6;

function ReceivablesKanban({ rows, loading, error, onRetry, today, pages, onOpen, onPageChange }: {
  rows: Row[]; loading: boolean; error: boolean; onRetry: () => unknown; today: string;
  onOpen: (row: Row) => void;
  pages: Record<KanbanColumnKey, number>; onPageChange: (column: KanbanColumnKey, page: number) => void;
}) {
  const { t: ui } = useTranslation("ui");
  if (loading) return <DataLoading label="Organizando recebíveis" className="min-h-72" />;
  if (error) return <ErrorState onRetry={onRetry} />;
  const columns: { key: KanbanColumnKey; title: string; tone: "warning" | "danger" | "success"; rows: Row[] }[] = [
    { key: "pending", title: ui("A receber"), tone: "warning", rows: rows.filter((row) => isOpen(row.status) && !isOverdue(row, today)) },
    { key: "overdue", title: ui("Vencidos"), tone: "danger", rows: rows.filter((row) => isOverdue(row, today)) },
    { key: "paid", title: "Pagos", tone: "success", rows: rows.filter((row) => ["paid", "refunded"].includes(row.status)) },
  ];
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain p-3 sm:p-4">
      <div className="grid min-w-[900px] grid-cols-3 gap-4">
        {columns.map((column) => {
          const pageRows = paginate(column.rows, pages[column.key], KANBAN_PAGE_SIZE);
          const total = column.rows.reduce((sum, row) => sum + Number(row.gross_amount), 0);
          return (
            <section key={column.key} className="min-w-0 rounded-lg border border-border bg-muted/30">
              <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border p-3">
                <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold">{column.title}</h3><StatusBadge tone={column.tone}>{column.rows.length}</StatusBadge></div><p className="numeric-tabular mt-1 text-xs text-muted-foreground">{formatBRL(total)}</p></div>
              </header>
              <div className="space-y-2 p-2.5">
                 {pageRows.length ? pageRows.map((row) => <ReceivableKanbanCard key={row.id} row={row} today={today} onOpen={() => onOpen(row)} />) : <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-border px-3 text-center text-xs text-muted-foreground">Nenhum recebível nesta etapa.</div>}
              </div>
              <DataPagination page={pages[column.key]} pageSize={KANBAN_PAGE_SIZE} total={column.rows.length} onPageChange={(nextPage) => onPageChange(column.key, nextPage)} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReceivableKanbanCard({ row, today, onOpen }: { row: Row; today: string; onOpen: () => void }) {
  const late = isOverdue(row, today);
  const paid = ["paid", "refunded"].includes(row.status);
  return (
    <Button type="button" variant="ghost" onClick={onOpen} aria-label={`Ver cobrança de ${row.customers?.name ?? "cliente não informado"}`} className="h-auto w-full rounded-md border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/35 hover:bg-card">
      <article className="w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{row.customers?.name ?? "Cliente não informado"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{row.description ?? "Cobrança"}</p></div>
        <StatusBadge tone={paid ? "success" : late ? "danger" : "warning"}>{paid ? paymentStatusLabels[row.status] ?? "Pago" : late ? "Vencido" : "A receber"}</StatusBadge>
      </div>
      <p className="numeric-tabular mt-3 font-display text-lg font-bold">{formatBRL(row.gross_amount)}</p>
      <div className="mt-2 flex items-end justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground"><span>{paymentMethodLabels[row.method] ?? row.method}</span><span className="text-right">{paid && row.paid_at ? `Pago em ${formatDate(row.paid_at)}` : `Vence ${formatDate(row.due_on)}`}</span></div>
      </article>
    </Button>
  );
}
