import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { CalendarDays, Download, ReceiptText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { authorizeExport } from "@/lib/exports.functions";
import { mergeFeeRows } from "@/lib/tx-display";
import { formatBRL, formatDate } from "@/lib/format";
import { DataPagination, EmptyState, ErrorState, PageHeader, SummaryStrip, TableRowsSkeleton, TableStateRow } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/extrato")({
  head: () => ({
    meta: [
      { title: "Extrato completo — Wiize Recebe" },
      { name: "description", content: "Todas as movimentações da sua conta Wiize Recebe com filtros e exportação." },
      { property: "og:title", content: "Extrato completo — Wiize Recebe" },
      { property: "og:description", content: "Movimentações da conta Wiize Recebe com filtros e exportação para Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExtratoPage,
});

type Period = "today" | "yesterday" | "month" | "30d" | "90d" | "custom";
type Tx = { id: string; kind: string; description: string | null; amount: number | string; occurred_at: string; payment_id: string | null };
const PAGE = 20;
const KIND: Record<string, string> = { payment: "Recebimento", platform_fee: "Taxa financeira", provider_fee: "Taxa financeira", refund: "Reembolso", withdrawal: "Saque", adjustment: "Ajuste", anticipation: "Antecipação", anticipation_fee: "Taxa de antecipação" };
const TYPES: Record<string, string[] | null> = { all: null, in: ["payment", "anticipation"], fees: ["platform_fee", "provider_fee", "anticipation_fee"], refund: ["refund"], withdrawal: ["withdrawal"], adjustment: ["adjustment"] };
const ds = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(p: Period, c?: DateRange) {
  const n = new Date(); const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const s = (k: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + k);
  if (p === "yesterday") return { from: ds(s(-1)), to: ds(s(-1)) };
  if (p === "30d") return { from: ds(s(-29)), to: ds(t) };
  if (p === "90d") return { from: ds(s(-89)), to: ds(t) };
  if (p === "custom" && c?.from) return { from: ds(c.from), to: ds(c.to ?? c.from) };
  if (p === "month") return { from: ds(new Date(n.getFullYear(), n.getMonth(), 1)), to: ds(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
  return { from: ds(t), to: ds(t) };
}

function ExtratoPage() {
  const { t: ui } = useTranslation("ui");
  const { data: ws } = useWorkspace();
  const tenantId = ws?.tenantId as string | undefined;
  const exportAuth = useServerFn(authorizeExport);
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const { from, to } = useMemo(() => range(period, custom), [period, custom]);
  useEffect(() => setPage(0), [from, to, type, q]);

  const build = (cols: string, count = false) => {
    let x = supabase.from("transactions").select(cols, count ? { count: "exact" } : undefined).eq("tenant_id", tenantId!)
      .gte("occurred_at", `${from}T00:00:00-03:00`).lte("occurred_at", `${to}T23:59:59.999-03:00`);
    const kinds = TYPES[type];
    if (kinds) x = x.in("kind", kinds as never);
    const term = q.trim().replace(/[%_,()]/g, " ");
    if (term) x = x.ilike("description", `%${term}%`);
    return x;
  };
  const list = useQuery({
    queryKey: ["extrato", tenantId, from, to, type, q, page],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, count, error } = await build("id, kind, description, amount, occurred_at, payment_id", true).order("occurred_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Tx[], count: count ?? 0 };
    },
  });
  const totals = useQuery({
    queryKey: ["extrato-totals", tenantId, from, to, type, q],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await build("kind, amount").limit(50000);
      if (error) throw error;
      let inc = 0, fees = 0, out = 0;
      for (const r of (data ?? []) as unknown as { kind: string; amount: string }[]) {
        const c = Math.round(Number(r.amount) * 100);
        if (["platform_fee", "provider_fee", "anticipation_fee"].includes(r.kind)) fees += -c; else if (c >= 0) inc += c; else out += -c;
      }
      return { inc: inc / 100, fees: fees / 100, out: out / 100, net: (inc - fees - out) / 100 };
    },
  });

  async function exportXlsx() {
    if (!tenantId) return;
    setExporting(true);
    try {
      const all: Tx[] = [];
      for (let i = 0; i < 50; i++) {
        const { data, error } = await build("id, kind, description, amount, occurred_at, payment_id").order("occurred_at", { ascending: false }).range(i * 1000, i * 1000 + 999);
        if (error) throw error;
        all.push(...((data ?? []) as unknown as Tx[]));
        if (!data || data.length < 1000) break;
      }
      const rows = mergeFeeRows(all).map((t) => ({ Data: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(t.occurred_at)), Tipo: KIND[t.kind] ?? t.kind, "Descrição": t.description ?? "", Valor: Math.round(Number(t.amount) * 100) / 100 }));
      await exportAuth({ data: { kind: "extrato", filters: { from, to, type, q }, rows: rows.length } });
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Data: "Sem movimentações no filtro" }]);
      if (rows.length) {
        XLSX.utils.sheet_add_json(sheet, [{ Data: "Total", Valor: { f: `SUM(D2:D${rows.length + 1})` } as never }], { skipHeader: true, origin: -1 });
        for (let r = 1; r <= rows.length + 1; r++) { const c = sheet[XLSX.utils.encode_cell({ r, c: 3 })]; if (c) c.z = '"R$" #,##0.00;-"R$" #,##0.00'; }
      }
      sheet["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 40 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Extrato");
      XLSX.writeFile(wb, `wiizepay-extrato-${from}-a-${to}.xlsx`);
      toast.success(`Planilha gerada com ${rows.length} linha(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally { setExporting(false); }
  }

  const rows = mergeFeeRows(list.data?.rows ?? []);
  const t = totals.data;
  return (
    <div>
      <PageHeader title={ui("Extrato completo")} description="Todas as movimentações da sua conta Wiize Recebe."
        action={<Button variant="outline" disabled={exporting || !tenantId} onClick={exportXlsx}><Download className="h-4 w-4" /> {exporting ? "Exportando..." : "Exportar Excel"}</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:flex sm:w-fit sm:flex-wrap">
        {([["today", ui("Hoje")], ["yesterday", ui("Ontem")], ["month", "Mês"], ["30d", ui("Últimos 30 dias")], ["90d", ui("Últimos 90 dias")]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={period === k ? "default" : "ghost"} className="min-w-0 text-xs" onClick={() => setPeriod(k)}>{l}</Button>
        ))}
        <CustomPicker active={period === "custom"} value={custom} onChange={(r) => { setCustom(r); if (r?.from) setPeriod("custom"); }} />
      </div>
      <SummaryStrip cols={4} items={[
        { label: "Entradas", value: t ? formatBRL(t.inc) : null },
        { label: "Taxas", value: t ? formatBRL(t.fees) : null },
        { label: "Saídas", value: t ? formatBRL(t.out) : null },
        { label: "Resultado", value: t ? formatBRL(t.net) : null },
      ]} />
      <div className="surface-panel min-w-0 overflow-hidden">
        <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar descrição" className="pl-9" /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem><SelectItem value="in">Recebimentos</SelectItem><SelectItem value="fees">Taxas</SelectItem><SelectItem value="refund">Reembolsos</SelectItem><SelectItem value="withdrawal">Saques</SelectItem><SelectItem value="adjustment">Ajustes</SelectItem>
          </SelectContent></Select>
        </div>
        <Table className="min-w-0 sm:min-w-max">
          <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead className="hidden sm:table-cell">Tipo</TableHead><TableHead className="hidden md:table-cell">Data</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.isLoading || !tenantId ? <TableRowsSkeleton cols={4} /> : list.isError ? <TableStateRow cols={4}><ErrorState onRetry={() => list.refetch()} /></TableStateRow>
              : rows.length === 0 ? <TableStateRow cols={4}><EmptyState icon={<ReceiptText className="h-5 w-5" />} title="Nenhuma movimentação" text="Ajuste o período ou os filtros." /></TableStateRow>
              : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><p className="truncate font-medium">{r.description || KIND[r.kind] || "Movimentação"}</p><p className="text-xs text-muted-foreground sm:hidden">{KIND[r.kind] ?? r.kind} · {formatDate(r.occurred_at)}</p></TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{KIND[r.kind] ?? r.kind}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{formatDate(r.occurred_at)}</TableCell>
                  <TableCell className={`numeric-tabular whitespace-nowrap text-right font-semibold ${Number(r.amount) < 0 ? "text-destructive" : "text-primary"}`}>{formatBRL(Number(r.amount))}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <DataPagination page={page} pageSize={PAGE} total={list.data?.count ?? 0} onPageChange={setPage} />
      </div>
    </div>
  );
}

function CustomPicker({ active, value, onChange }: { active: boolean; value: DateRange | undefined; onChange: (v: DateRange | undefined) => void }) {
  const { t: ui } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="sm" variant={active ? "default" : "ghost"} className="min-w-0 text-xs"><CalendarDays className="h-3.5 w-3.5" />  {ui("Personalizado")}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-3">
        <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={1} disabled={{ after: new Date() }} />
        <div className="mt-2 flex justify-end"><Button size="sm" disabled={!value?.from} onClick={() => setOpen(false)}>Aplicar</Button></div>
      </PopoverContent>
    </Popover>
  );
}
