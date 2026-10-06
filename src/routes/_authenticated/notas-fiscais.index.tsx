import { useServiceFees } from "@/hooks/use-service-fees";
import { NameText } from "@/components/ds/name-text";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronRight, Download, FileText, Plus, Search, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getFiscalOverview } from "@/lib/invoices.functions";
import { PERIOD_OPTIONS, resolveRange, type PeriodKey } from "@/lib/dashboard-period";
import { INVOICE_ORIGIN_LABEL, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/invoice-status";
import { formatBRL, formatDate } from "@/lib/format";
import { DataPagination, paginate, PageHeader, SummaryStrip, StatusBadge, EmptyState, ErrorState, ListSkeleton, TableRowsSkeleton, TableStateRow } from "@/components/ds";
import { IssueWizard, type WizardInit } from "@/components/invoices/issue-wizard";
import { FiscalOnboarding } from "@/components/invoices/fiscal-onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

type Search = { emitir?: "payment" | "installment" | "standalone" | undefined; cobranca?: string | undefined; cliente?: string | undefined };

export const Route = createFileRoute("/_authenticated/notas-fiscais/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    emitir: ["payment", "installment", "standalone"].includes(String(s["emitir"])) ? (s["emitir"] as Search["emitir"]) : undefined,
    cobranca: typeof s["cobranca"] === "string" ? s["cobranca"] : undefined,
    cliente: typeof s["cliente"] === "string" ? s["cliente"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Notas Fiscais — WiizePay" },
      { name: "description", content: "Emita, acompanhe e gerencie suas notas fiscais de serviço." },
      { property: "og:title", content: "Notas Fiscais — WiizePay" },
      { property: "og:description", content: "Emita, acompanhe e gerencie suas notas fiscais de serviço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotasFiscais,
});

export type InvoiceRow = {
  id: string; number: string | null; status: InvoiceStatus; origin: string; value: number; effective_date: string; created_at: string;
  customer_id: string | null; service_id: string | null; payment_id: string | null; customers: { name: string } | null; fiscal_services: { name: string } | null;
};

function NotasFiscais() {
  const { t: ui } = useTranslation("ui");
  const invoiceFee = useServiceFees()?.invoice ?? null;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: ws } = useWorkspace();
  const tenantId = ws?.tenantId;
  const fetchOverview = useServerFn(getFiscalOverview);
  const overview = useQuery({ queryKey: ["fiscal-overview"], queryFn: () => fetchOverview() });
  const [periodo, setPeriodo] = useState<PeriodKey>("hoje");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [status, setStatus] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [wizard, setWizard] = useState<WizardInit | null>(search.emitir ? { origin: search.emitir, paymentId: search.cobranca, customerId: search.cliente } : null);
  const range = useMemo(() => resolveRange(periodo, de, ate), [periodo, de, ate]);

  const invoices = useQuery({
    queryKey: ["invoices", tenantId, range.start.toISOString(), range.end.toISOString()],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("id, number, status, origin, value, effective_date, created_at, customer_id, service_id, payment_id, customers(name), fiscal_services(name)")
        .eq("tenant_id", tenantId!).gte("created_at", range.start.toISOString()).lt("created_at", range.end.toISOString())
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as unknown as InvoiceRow[];
    },
  });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (invoices.data ?? []).filter((r) =>
      (status === "all" || r.status === status || (status === "SYNCHRONIZED" && r.status === "PENDING")) &&
      (origin === "all" || r.origin === origin) &&
      (!t || [r.number, r.customers?.name, r.fiscal_services?.name].some((x) => (x ?? "").toLowerCase().includes(t))));
  }, [invoices.data, status, origin, q]);
  const visibleRows = paginate(rows, page, 10);

  const d = invoices.data;
  const authorized = d?.filter((r) => r.status === "AUTHORIZED");
  const s = overview.data?.settings;
  const configured = s?.configStatus === "configured";

  function exportCsv() {
  const { t: ui } = useTranslation("ui");
    const head = ["Número", ui("Cliente"), "Serviço", "Valor", "Data", "Origem", "Status"];
    const lines = rows.map((r) => [r.number ?? "", r.customers?.name ?? "", r.fiscal_services?.name ?? "", String(r.value).replace(".", ","), r.effective_date, INVOICE_ORIGIN_LABEL[r.origin] ?? r.origin, INVOICE_STATUS_LABEL[r.status]]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `notas-fiscais-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const openWizard = (init: WizardInit = {}) => {
    if (!configured) { void navigate({ to: "/notas-fiscais/configuracoes" }); return; }
    setWizard(init);
  };

  return (
    <div>
      <PageHeader
        title={ui("Notas Fiscais")}
        description={`${ui("Emita notas de cobranças da WiizePay ou de serviços recebidos por fora.")} ${invoiceFee != null ? ui("Taxa de {{fee}} por nota autorizada, descontada do seu saldo.", { fee: formatBRL(invoiceFee) }) : ui("Taxa por nota autorizada, descontada do seu saldo.")}`}
        action={<>
          <Button variant="outline" asChild><Link to="/notas-fiscais/configuracoes"><Settings2 className="mr-1.5 h-4 w-4" />Configurações fiscais</Link></Button>
          <Button onClick={() => openWizard()} disabled={overview.isLoading}><Plus className="mr-1.5 h-4 w-4" />Emitir nota</Button>
        </>}
      />

      {overview.isLoading ? <div className="mb-6"><ListSkeleton rows={2} /></div> : overview.isError ? <div className="mb-6"><ErrorState onRetry={() => overview.refetch()} /></div> : !s || s.configStatus === "pending" ? (
        <FiscalOnboarding steps={overview.data!.steps} done={overview.data!.stepsDone} />
      ) : s.configStatus === "attention" ? (
        <div className="surface-panel mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning/15"><AlertTriangle className="h-4 w-4 text-warning" /></span>
            <div>
              <p className="font-display text-sm font-semibold">Configuração incompleta</p>
              <p className="text-xs text-muted-foreground">Você precisa concluir sua configuração fiscal antes de emitir notas. {s.missing[0] ?? ""}</p>
            </div>
          </div>
          <Button size="sm" asChild><Link to="/notas-fiscais/configuracoes">Continuar configuração</Link></Button>
        </div>
      ) : null}

      <div className="mb-4 grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
          {PERIOD_OPTIONS.map((o) => (
            <Button key={o.key} type="button" size="sm" variant={periodo === o.key ? "default" : "ghost"} onClick={() => { setPeriodo(o.key); setPage(0); }} className="h-8 px-3 text-xs">{o.label}</Button>
          ))}
          <Button type="button" size="sm" variant={periodo === "custom" ? "default" : "ghost"} onClick={() => { setPeriodo("custom"); setPage(0); if (!de) { const t = new Date().toISOString().slice(0, 10); setDe(t); setAte(t); } }} className="h-8 px-3 text-xs">{ui("Personalizado")}</Button>
        </div>
        {periodo === "custom" ? <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5"><Input type="date" className="h-9 min-w-0" value={de} onChange={(e) => { setDe(e.target.value); setPage(0); }} /><span className="text-xs text-muted-foreground">até</span><Input type="date" className="h-9 min-w-0" value={ate} onChange={(e) => { setAte(e.target.value); setPage(0); }} /></div> : null}
      </div>

      <SummaryStrip cols={5} items={[
        { label: "Notas emitidas", value: d ? String(authorized!.length) : null, accent: true },
        { label: "Valor faturado em notas", value: d ? formatBRL(authorized!.reduce((t, r) => t + Number(r.value), 0)) : null },
        { label: "Pendentes", value: d ? String(d.filter((r) => ["PENDING", "SCHEDULED", "SYNCHRONIZED", "PROCESSING_CANCELLATION"].includes(r.status)).length) : null },
        { label: "Com erro", value: d ? String(d.filter((r) => r.status === "ERROR" || r.status === "CANCELLATION_DENIED").length) : null },
        { label: "Canceladas", value: d ? String(d.filter((r) => r.status === "CANCELED").length) : null },
      ]} />

      <section className="surface-panel overflow-hidden">
        <div className="grid min-w-0 gap-2 border-b border-border p-3 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Buscar por número, cliente ou serviço" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
            <SelectTrigger className="h-9 w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(["SCHEDULED", "SYNCHRONIZED", "AUTHORIZED", "ERROR", "PROCESSING_CANCELLATION", "CANCELED", "CANCELLATION_DENIED"] as InvoiceStatus[]).map((k) => <SelectItem key={k} value={k}>{INVOICE_STATUS_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={origin} onValueChange={(value) => { setOrigin(value); setPage(0); }}>
            <SelectTrigger className="h-9 w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {Object.entries(INVOICE_ORIGIN_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" />CSV</Button>
        </div>

        {/* Celular: cards */}
        <div className="divide-y divide-border md:hidden">
          {invoices.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : invoices.isError ? <div className="p-4"><ErrorState onRetry={() => invoices.refetch()} /></div> : rows.length === 0 ? (
            <Empty onIssue={() => openWizard()} filtered={Boolean(d?.length)} />
          ) : visibleRows.map((r) => (
            <Link key={r.id} to="/notas-fiscais/$id" params={{ id: r.id }} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.customers?.name ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{r.number ? `Nº ${r.number}` : "Sem número"} · {formatDate(r.effective_date)} · {INVOICE_ORIGIN_LABEL[r.origin]}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="numeric-tabular text-sm font-semibold">{formatBRL(r.value)}</p>
                <StatusBadge tone={INVOICE_STATUS_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</StatusBadge>
              </div>
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Número</TableHead><TableHead>{ui("Cliente")}</TableHead><TableHead>Serviço</TableHead><TableHead className="text-right">Valor</TableHead>
              <TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {invoices.isLoading ? <TableRowsSkeleton cols={8} /> : invoices.isError ? <TableStateRow cols={8}><ErrorState onRetry={() => invoices.refetch()} /></TableStateRow> : rows.length === 0 ? (
                <TableStateRow cols={8}><Empty onIssue={() => openWizard()} filtered={Boolean(d?.length)} /></TableStateRow>
              ) : visibleRows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/notas-fiscais/$id", params: { id: r.id } })}>
                  <TableCell className="numeric-tabular font-medium">{r.number ?? "—"}</TableCell>
                  <TableCell><NameText max="max-w-[12rem]">{r.customers?.name}</NameText></TableCell>
                  <TableCell className="text-muted-foreground">{r.fiscal_services?.name ?? "—"}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.value)}</TableCell>
                  <TableCell>{formatDate(r.effective_date)}</TableCell>
                  <TableCell>{INVOICE_ORIGIN_LABEL[r.origin] ?? r.origin}</TableCell>
                  <TableCell><StatusBadge tone={INVOICE_STATUS_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</StatusBadge></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link to="/notas-fiscais/$id" params={{ id: r.id }}>Ver <ChevronRight className="ml-0.5 h-3.5 w-3.5" /></Link></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DataPagination page={page} pageSize={10} total={rows.length} onPageChange={setPage} />
      </section>

      {overview.data ? (
        <IssueWizard open={wizard !== null} onOpenChange={(v) => { if (!v) { setWizard(null); void navigate({ to: "/notas-fiscais", search: {}, replace: true }); } }}
          services={overview.data.services as never} init={wizard ?? undefined} environment={overview.data.environment} />
      ) : null}
    </div>
  );
}

function Empty({ onIssue, filtered }: { onIssue: () => void; filtered: boolean }) {
  return filtered
    ? <EmptyState icon={<FileText className="h-5 w-5" />} title="Nenhuma nota com esses filtros" text="Ajuste a busca ou os filtros." />
    : <EmptyState icon={<FileText className="h-5 w-5" />} title="Nenhuma nota fiscal ainda" text="Suas notas fiscais aparecerão aqui." action={<Button size="sm" onClick={onIssue}>Emitir primeira nota</Button>} />;
}
