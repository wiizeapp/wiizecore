import { useTranslation } from "react-i18next";
import { csvCell } from "@/lib/csv-safe";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronUp, Download, Eye, EyeOff, FilePlus2, FileSignature,
  LineChart as LineChartIcon, Plus, RefreshCw, UserPlus, Wallet,
  FileText, Route as JourneyIcon, CircleHelp, Clock3, ReceiptText, RotateCcw, TrendingUp, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { canUseDashboardMockup, dashboardMockupData } from "@/components/dashboard/mockup-data";
import { MoneyValue } from "@/components/dashboard/money-value";
import { firstChargeCustomers, monthlyMrr, projectedMrr } from "@/lib/dashboard-mrr";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatBRL, formatDate } from "@/lib/format";
import { buckets, pctChange, PERIOD_OPTIONS, resolveRange, toCents, type PeriodKey } from "@/lib/dashboard-period";
import { Change, Empty, Panel, RankList, Skeleton, type AppPath } from "@/components/dashboard/parts";
import { isOpen, isOverdue, summarize, type SummaryRow } from "@/lib/financial-summary";
import { DataPagination, paginate } from "@/components/ds";

type Search = { periodo?: PeriodKey | undefined; de?: string | undefined; ate?: string | undefined };

export const Route = createFileRoute("/_authenticated/painel")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    periodo: typeof s["periodo"] === "string" ? (s["periodo"] as PeriodKey) : undefined,
    de: typeof s["de"] === "string" ? s["de"] : undefined,
    ate: typeof s["ate"] === "string" ? s["ate"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard — WiizePay" },
      { name: "description", content: "Centro de comando financeiro e comercial da sua empresa na WiizePay." },
      { property: "og:title", content: "Dashboard — WiizePay" },
      { property: "og:description", content: "Centro de comando financeiro e comercial da sua empresa na WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const chartConfig = { sold: { label: "Faturamento", color: "var(--primary)" } } satisfies ChartConfig;

const METHOD_LABEL: Record<string, string> = { pix: "Pix", boleto: "Boleto", credit_card: "Cartão de crédito", debit_card: "Cartão de débito" };
const fmtDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cents = (c: number) => formatBRL(c / 100);
const inRange = (iso: string | null, a: Date, b: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= a.getTime() && t < b.getTime();
};

function useTenantQuery<T>(key: string, tenantId: string | undefined, fn: (t: string) => Promise<T>) {
  return useQuery({ queryKey: ["dash", key, tenantId], enabled: Boolean(tenantId), queryFn: () => { if (!tenantId) throw new Error("Empresa indisponível"); return fn(tenantId); } });
}

function Dashboard() {
  const { t: ui, i18n } = useTranslation("ui");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/painel" });
  const periodo = search.periodo ?? "hoje";
  const range = useMemo(() => resolveRange(periodo, search.de, search.ate), [periodo, search.de, search.ate]);
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const { user } = useAuth();
  const [mockupRequested, setMockupRequested] = useState(false);
  const eligibleForMockup = canUseDashboardMockup(user?.email);
  const mockup = eligibleForMockup && mockupRequested;
  const mockData = useMemo(() => dashboardMockupData(range, (key) => ui(key)), [range, ui]);
  const queryTenantId = mockup ? undefined : tenantId;
  const journeyStorageKey = user?.id ? `wiizepay:journey:closed:${user.id}` : null;
  const [hidden, setHidden] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(true);
  const [mrrChart, setMrrChart] = useState<"columns" | "line">("columns");
  useEffect(() => {
    if (!journeyStorageKey) return;
    try { setJourneyOpen(localStorage.getItem(journeyStorageKey) !== "true"); } catch { setJourneyOpen(true); }
  }, [journeyStorageKey]);
  const toggleJourney = () => {
    if (!mockup && journeyOpen && journeyStorageKey) {
      try { localStorage.setItem(journeyStorageKey, "true"); } catch { /* Storage may be unavailable. */ }
    }
    setJourneyOpen((open) => !open);
  };
  const [revenueChart, setRevenueChart] = useState<"columns" | "line">("columns");

  const walletQuery = useTenantQuery("wallet", queryTenantId, async (t) => {
    const { data, error } = await supabase.from("wallets").select("available_balance, pending_balance").eq("tenant_id", t).maybeSingle();
    if (error) throw error;
    return data;
  });
  const paymentsQuery = useTenantQuery("payments", queryTenantId, async (t) => {
    const { data, error } = await supabase
      .from("payments")
      .select("id, description, gross_amount, net_amount, platform_fee_amount, refunded_amount, status, method, created_at, paid_at, due_on, customer_id, service_id, subscription_id, installment_count")
      .eq("tenant_id", t)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return data ?? [];
  });
  const refundsQuery = useTenantQuery(`refunds:${range.start.toISOString()}:${range.end.toISOString()}`, queryTenantId, async (t) => {
    const { data, error } = await supabase.from("refunds").select("id, refund_amount, completed_at").eq("tenant_id", t).eq("status", "completed").gte("completed_at", range.start.toISOString()).lt("completed_at", range.end.toISOString());
    if (error) throw error;
    return data ?? [];
  });
  const customersQuery = useTenantQuery("customers", queryTenantId, async (t) => {
    const { data, error } = await supabase.from("customers").select("id, name, created_at").eq("tenant_id", t).limit(5000);
    if (error) throw error;
    return data ?? [];
  });
  const servicesQuery = useTenantQuery("services", queryTenantId, async (t) => {
    const { data, error } = await supabase.from("services").select("id, name").eq("tenant_id", t);
    if (error) throw error;
    return data ?? [];
  });
  const extrasQuery = useTenantQuery("extras", queryTenantId, async (t) => {
    const [c, s, a, released, withdrawals, fset, inv] = await Promise.all([
      supabase.from("contracts").select("id", { count: "exact", head: true }).eq("tenant_id", t),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", t),
      supabase.from("payment_activations").select("status").eq("tenant_id", t).maybeSingle(),
      supabase.from("payments").select("id, net_amount, description, released_at").eq("tenant_id", t).not("released_at", "is", null).order("released_at", { ascending: false }).limit(6),
      supabase.from("transactions").select("id, amount, description, kind, occurred_at, payment_id").eq("tenant_id", t).eq("kind", "withdrawal").order("occurred_at", { ascending: false }).limit(6),
      supabase.from("fiscal_settings").select("config_status").eq("tenant_id", t).maybeSingle(),
      supabase.from("invoices").select("status").eq("tenant_id", t).limit(1000),
    ]);
    if (released.error) throw released.error;
    if (withdrawals.error) throw withdrawals.error;
    const balanceMovements = [
      ...(released.data ?? []).map((payment) => ({ id: `payment-${payment.id}`, amount: payment.net_amount ?? 0, description: payment.description || "Recebimento liberado", kind: "payment", occurred_at: payment.released_at ?? "" })),
      ...(withdrawals.data ?? []),
    ].sort((left, right) => new Date(right.occurred_at ?? 0).getTime() - new Date(left.occurred_at ?? 0).getTime()).slice(0, 6);
    return { contracts: c.count ?? 0, subscriptions: s.count ?? 0, activation: a.data?.status ?? null, transactions: balanceMovements,
      fiscalConfigured: fset.data?.config_status === "configured",
      invoicesIssued: (inv.data ?? []).filter((r) => r.status === "AUTHORIZED").length,
      invoicesPending: (inv.data ?? []).filter((r) => ["PENDING", "SCHEDULED", "SYNCHRONIZED"].includes(r.status)).length,
      invoicesError: (inv.data ?? []).filter((r) => r.status === "ERROR").length };
  });

  // Visual fixtures never enter the query cache or the financial operation paths.
  const wallet = { ...walletQuery, data: mockup ? mockData.wallet : walletQuery.data, isPending: !mockup && walletQuery.isPending, isError: !mockup && walletQuery.isError };
  const payments = { ...paymentsQuery, data: mockup ? mockData.payments : paymentsQuery.data, isPending: !mockup && paymentsQuery.isPending, isError: !mockup && paymentsQuery.isError };
  const customers = { ...customersQuery, data: mockup ? mockData.customers : customersQuery.data, isPending: !mockup && customersQuery.isPending, isError: !mockup && customersQuery.isError };
  const services = { ...servicesQuery, data: mockup ? mockData.services : servicesQuery.data, isPending: !mockup && servicesQuery.isPending };
  const refunds = { ...refundsQuery, data: mockup ? mockData.refunds : refundsQuery.data, isPending: !mockup && refundsQuery.isPending, isError: !mockup && refundsQuery.isError };
  const extras = { ...extrasQuery, data: mockup ? mockData.extras : extrasQuery.data, isPending: !mockup && extrasQuery.isPending };

  const loading = payments.isPending || customers.isPending;
  const failed = payments.isError || customers.isError || wallet.isError;

  const s = useMemo(() => {
    const rows = payments.data ?? [];
    const custName = new Map((customers.data ?? []).map((c) => [c.id, c.name]));
    const svcName = new Map((services.data ?? []).map((c) => [c.id, c.name]));
    const calc = (a: Date, b: Date) => {
      const sales = rows.filter((r) => inRange(r.created_at, a, b));
      const paid = rows.filter((r) => ["paid", "refunded"].includes(r.status) && inRange(r.paid_at, a, b));
      const salesSummary = summarize(sales as unknown as SummaryRow[]);
      const paidSummary = summarize(paid as unknown as SummaryRow[]);
      // Faturado = somente parcelas pagas no período (data do pagamento).
      const sold = toCents(paidSummary.billed);
      const received = toCents(paidSummary.paid);
      const buyers = new Set(paid.map((r) => r.customer_id).filter(Boolean));
      return {
        sales: sales.filter((r) => !["cancelled", "failed"].includes(r.status)), paid, sold, received,
        pending: toCents(salesSummary.pending), overdue: toCents(salesSummary.overdue), fees: toCents(paidSummary.fees), net: toCents(paidSummary.net),
        count: salesSummary.count, billedCount: paidSummary.paidCount, pendingCount: sales.filter((r) => isOpen(r.status) && !isOverdue(r)).length,
        overdueCount: sales.filter((r) => isOverdue(r)).length, ticket: paidSummary.paidCount ? received / paidSummary.paidCount : 0, buyers: buyers.size,
      };
    };
    const curr = calc(range.start, range.end);
    const prev = calc(range.prevStart, range.prevEnd);
    const series = buckets(range).map((b) => {
      const c = calc(new Date(b.start), new Date(b.end));
      return { label: b.label, sold: c.sold / 100, received: c.received / 100 };
    });

    const group = <K extends string>(list: Array<(typeof rows)[number]>, key: (r: (typeof rows)[number]) => K | null) => {
      const m = new Map<K, { total: number; count: number }>();
      for (const r of list) {
        const k = key(r);
        if (!k) continue;
        const g = m.get(k) ?? { total: 0, count: 0 };
        g.total += toCents(r.gross_amount);
        g.count += 1;
        m.set(k, g);
      }
      return [...m.entries()];
    };
    const bySvc = group(curr.paid, (r) => r.service_id);
    const soldBySvc = group(curr.paid, (r) => r.service_id);
    const svcTop = {
      faturados: [...bySvc].sort((a, b) => b[1].total - a[1].total),
      vendidos: [...soldBySvc].sort((a, b) => b[1].count - a[1].count),
      ticket: [...bySvc].sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count),
    };
    const ltv = group(rows.filter((r) => r.status === "paid"), (r) => r.customer_id).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    const paidCounts = new Map<string, number>();
    for (const r of rows) if (r.status === "paid" && r.customer_id) paidCounts.set(r.customer_id, (paidCounts.get(r.customer_id) ?? 0) + 1);
    const recurring = [...paidCounts.values()].filter((n) => n > 1).length;
    const newCustomers = firstChargeCustomers(rows, range.start, range.end);
    const mrr = projectedMrr(rows);
    const mrrSeries = monthlyMrr(rows, fmtDay(new Date(range.end.getTime() - 1)).slice(0, 7), i18n.resolvedLanguage);

    const origin = { Avulso: 0, Recorrente: 0, Parcelado: 0 };
    for (const r of curr.paid) {
      const k = r.subscription_id ? "Recorrente" : (r.installment_count ?? 1) > 1 ? "Parcelado" : "Avulso";
      origin[k] += toCents(r.gross_amount);
    }
    const methods = group(curr.paid, (r) => r.method).sort((a, b) => b[1].total - a[1].total);

    const today = fmtDay(new Date());
    const open = rows.filter((r) => isOpen(r.status) || isOverdue(r));
    const upcoming = open.filter((r) => !isOverdue(r) && Boolean(r.due_on)).sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));
    const overdue = open.filter((r) => isOverdue(r));

    return {
      curr, prev, series, mrr, mrrSeries, svcTop, ltv, recurring, newCustomers, origin, methods, upcoming, overdue,
      openCount: curr.sales.filter((row) => isOpen(row.status) || isOverdue(row)).length, custName, svcName, totalCustomers: customers.data?.length ?? 0,
      hasPaid: rows.some((r) => r.status === "paid"), hasCharge: rows.length > 0, periodRows: curr.sales,
    };
  }, [payments.data, customers.data, services.data, range, i18n.resolvedLanguage]);

  const setPeriod = (p: Search) => navigate({ search: p, replace: true });
  const refresh = () => { if (mockup) return; for (const q of [wallet, payments, customers, services, extras, refunds]) void q.refetch(); };
  const updatedAt = Math.max(wallet.dataUpdatedAt, payments.dataUpdatedAt);
  const mins = updatedAt ? Math.floor((Date.now() - updatedAt) / 60000) : null;
  const mask = (v: string) => (hidden ? "R$ ••••,••" : v);

  const exportCsv = () => {
    if (mockup) return;
    const head = "id;descricao;valor;status;metodo;criado_em;pago_em";
    const lines = s.periodRows.map((r) =>
      [r.id, r.description ?? "", Number(r.gross_amount).toFixed(2).replace(".", ","), r.status, r.method ?? "", r.created_at, r.paid_at ?? ""].map(csvCell).join(";"),
    );
    const blob = new Blob([`\uFEFF${[head, ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wiizepay-dashboard-${fmtDay(range.start)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const available = toCents(wallet.data?.available_balance ?? 0);
  const toReceive = toCents(wallet.data?.pending_balance ?? 0);
  const activated = extras.data?.activation === "approved";

  const journey: { label: string; done: boolean; to: AppPath }[] = [
    { label: ui("Criar conta"), done: true, to: "/clientes" },
    { label: ui("Ativar pagamentos"), done: activated, to: "/ativacao" },
    { label: ui("Cadastrar primeiro cliente"), done: s.totalCustomers > 0, to: "/clientes" },
    { label: ui("Cadastrar serviço"), done: (services.data?.length ?? 0) > 0, to: "/servicos" },
    { label: ui("Criar primeira cobrança"), done: s.hasCharge, to: "/cobrancas" },
    { label: ui("Criar contrato"), done: (extras.data?.contracts ?? 0) > 0, to: "/contratos" },
    { label: ui("Receber primeiro pagamento"), done: s.hasPaid, to: "/cobrancas" },
    { label: ui("Ativar cobrança recorrente"), done: (extras.data?.subscriptions ?? 0) > 0, to: "/cobrancas" },
    { label: ui("Configurar emissão fiscal"), done: Boolean(extras.data?.fiscalConfigured), to: "/notas-fiscais/configuracoes" },
    { label: ui("Emitir primeira nota"), done: (extras.data?.invoicesIssued ?? 0) > 0, to: "/notas-fiscais" },
  ];
  const doneCount = journey.filter((j) => j.done).length;
  const next = journey.find((j) => !j.done);
  const showJourney = !extras.isPending && !services.isPending;

  const [svcTab, setSvcTab] = useState<"faturados" | "vendidos" | "ticket">("faturados");
  const [upcomingPage, setUpcomingPage] = useState(0);
  const periodGroupRef = useRef<HTMLDivElement>(null);
  // Mantém o período selecionado visível quando a barra de filtros vira uma linha só no celular.
  useEffect(() => {
    periodGroupRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [periodo]);
  const svcRaw = s.svcTop[svcTab];
  const svcItems = svcRaw.slice(0, 5).map(([id, g]) => ({
    label: s.svcName.get(id) ?? ui("Serviço"),
    value: svcTab === "vendidos" ? g.count : svcTab === "ticket" ? g.total / g.count : g.total,
    hint: svcTab === "vendidos" ? undefined : ui(g.count === 1 ? "{{count}} venda" : "{{count}} vendas", { count: g.count }),
  }));
  const upcomingRows = paginate(s.upcoming, upcomingPage, 4);

  const alerts: { text: string; to: AppPath }[] = [];
  if (!mockup && extras.data && activated && workspace && !workspace.hasFinancialPassword)
    alerts.push({ text: ui("Crie sua senha financeira para proteger saques e operações sensíveis."), to: "/seguranca" });
  if (s.overdue.length) alerts.push({ text: ui(s.overdue.length === 1 ? "{{count}} cobrança vencida aguardando pagamento." : "{{count}} cobranças vencidas aguardando pagamento.", { count: s.overdue.length }), to: "/cobrancas" });

  return (
    <div className="space-y-6" data-mockup={mockup || undefined} onClickCapture={(event) => { if (mockup && event.target instanceof Element && event.target.closest("a")) { event.preventDefault(); event.stopPropagation(); } }}> 
      {/* 1. Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{ui("Dashboard")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
             {mockup ? "Horizonte Studio" : workspace?.tenantName ?? ui("Sua empresa")} · {mockup ? ui("Dados demonstrativos") : mins === null ? ui("Carregando…") : mins < 1 ? ui("Atualizado agora") : ui("Atualizado há {{minutes}} min", { minutes: mins })}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {eligibleForMockup && <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground"><span>{ui("Mockup")}</span><Switch aria-label={ui("Mockup")} checked={mockup} onCheckedChange={setMockupRequested} /></label>}
          <div className="flex items-center gap-2">
          <div ref={periodGroupRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {PERIOD_OPTIONS.map((o) => (
              <button key={o.key} type="button" data-active={periodo === o.key} onClick={() => setPeriod({ periodo: o.key })}
                className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ${periodo === o.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                 {ui(o.label)}
              </button>
            ))}
            <CustomRange active={periodo === "custom"} onApply={(de, ate) => setPeriod({ periodo: "custom", de, ate })} onClear={() => setPeriod({ periodo: "hoje" })} />
          </div>
          <Button variant="outline" size="icon" className="shrink-0" onClick={refresh} disabled={mockup} aria-label={ui("Atualizar")}>
            <RefreshCw className={`h-4 w-4 ${payments.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" className="shrink-0" onClick={exportCsv} disabled={mockup || !s.periodRows.length} aria-label={ui("Exportar")}>
            <Download className="h-4 w-4 sm:mr-1.5" />  <span className="hidden sm:inline">{ui("Exportar")}</span>
          </Button>
        </div>
      </div>

      </div>
      {failed && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
           <span>{ui("Não foi possível carregar alguns dados.")}</span>
          <Button size="sm" variant="outline" onClick={refresh}>{ui("Tentar novamente")}</Button>
        </div>
      )}

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link key={a.text} to={a.to} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:border-primary/40">
              <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1">{a.text}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/* 2. Resumo financeiro compacto */}
      <section className="summary-strip--main surface-panel grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
        <div className="summary-strip-item min-w-0 p-5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            {ui("Saldo disponível")}
             <button type="button" onClick={() => setHidden((h) => !h)} aria-label={ui(hidden ? "Mostrar valores" : "Ocultar valores")} className="rounded p-0.5 hover:text-foreground">
              {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          {wallet.isPending ? <Skeleton h="mt-2 h-8" /> : <p className={`numeric-tabular mt-1.5 max-w-full overflow-hidden font-display font-bold text-primary ${valueTextSize(mask(cents(available)))}`}><MoneyValue value={mask(cents(available))} accentCents /></p>}
          <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{ui("A liberar {{value}}", { value: mask(cents(toReceive)) })}</span>
             <Link to="/financeiro" className="text-xs font-semibold text-primary hover:underline">{ui("Sacar")}</Link>
          </div>
        </div>
         <Stat icon={BarChart3} label={ui("Faturado")} value={mask(cents(s.curr.sold))} change={pctChange(s.curr.sold, s.prev.sold)} loading={loading} />
         <Stat icon={Clock3} label={ui("A receber")} value={mask(cents(s.curr.pending))} hint={ui(s.curr.pendingCount === 1 ? "{{count}} cobrança aguardando" : "{{count}} cobranças aguardando", { count: s.curr.pendingCount })} loading={loading} />
         <Stat icon={AlertTriangle} label={ui("Vencidos")} value={mask(cents(s.curr.overdue))} hint={ui(s.curr.overdueCount === 1 ? "{{count}} cobrança vencida" : "{{count}} cobranças vencidas", { count: s.curr.overdueCount })} loading={loading} />
      </section>

      <section aria-label={ui("Indicadores complementares")} className="grid overflow-hidden rounded-lg border border-border bg-card/60 grid-cols-2 sm:grid-cols-4">
        <CompactStat icon={TrendingUp} label={ui("MRR")} value={payments.isError ? "—" : mask(cents(s.mrr))} loading={payments.isPending} help={ui("O MRR deste painel é a previsão líquida das parcelas e cobranças recorrentes em aberto com vencimento nos próximos 30 dias, descontadas as taxas registradas. Não inclui cobranças avulsas nem valores já pagos, e não é saldo disponível.")} />
        <CompactStat icon={ReceiptText} label={ui("Cobranças ativas")} value={payments.isError ? "—" : hidden ? "••••" : String(s.openCount)} loading={payments.isPending} />
        <CompactStat icon={UserPlus} label={ui("Novos clientes no período")} value={payments.isError ? "—" : hidden ? "••••" : String(s.newCustomers)} loading={loading} />
        <CompactStat icon={RotateCcw} label={ui("Reembolsos no período")} value={refunds.isError ? "—" : mask(cents((refunds.data ?? []).reduce((total, row) => total + toCents(row.refund_amount), 0)))} loading={refunds.isPending} />
      </section>

      {showJourney && (
         <Panel title={<span className="flex items-center gap-2"><JourneyIcon className="h-4 w-4 text-primary" />{ui("Sua jornada no WiizePay")}</span>} subtitle={ui("Complete as etapas para aproveitar todo o potencial da WiizePay.")}
           action={<div className="flex shrink-0 items-center gap-2"><span className="numeric-tabular text-xs font-semibold text-primary">{ui("{{done}} de {{total}} etapas", { done: doneCount, total: journey.length })}</span><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={toggleJourney} aria-expanded={journeyOpen} aria-controls="dashboard-journey" aria-label={ui(journeyOpen ? "Fechar jornada" : "Abrir jornada")}>{journeyOpen ? <ChevronUp /> : <ChevronDown />}</Button></div>}>
          {journeyOpen && <><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(doneCount / journey.length) * 100}%` }} /></div>
          <ol id="dashboard-journey" className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{journey.map((j) => { const isNext = j === next; return <li key={j.label}><Link to={j.to} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${isNext ? "bg-primary/10 font-semibold" : "hover:bg-muted"} ${j.done ? "text-muted-foreground" : ""}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${j.done ? "border-primary bg-primary text-primary-foreground" : isNext ? "border-primary" : "border-border"}`}>{j.done && <Check className="h-3 w-3" />}</span><span className={j.done ? "line-through decoration-muted-foreground/40" : ""}>{j.label}</span>{isNext && <ArrowRight className="ml-auto h-3.5 w-3.5 text-primary" />}</Link></li>; })}</ol></>}
        </Panel>
      )}

      {/* 4. Faturamento */}
       <Panel title={ui("Faturamento")} subtitle={ui("Valor total vendido · {{granularity}}", { granularity: ui(range.granularity === "hour" ? "por hora" : "por dia") })}
         action={<div className="flex shrink-0 items-center gap-3"><div className="flex rounded-lg border border-border p-0.5" aria-label={ui("Formato do gráfico")}><Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${revenueChart === "columns" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setRevenueChart("columns")} aria-label={ui("Gráfico de colunas")}><BarChart3 /></Button><Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${revenueChart === "line" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setRevenueChart("line")} aria-label={ui("Gráfico de linha")}><LineChartIcon /></Button></div><div className="text-right"><Change value={pctChange(s.curr.sold, s.prev.sold)} /><p className="text-[11px] text-muted-foreground">{ui("vs. período anterior")}</p></div></div>}>
        {loading ? <Skeleton h="h-[280px]" /> : s.series.some((x) => x.sold) ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            {revenueChart === "columns" ? <BarChart data={s.series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
               <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `R$ ${Number(v).toLocaleString(i18n.resolvedLanguage, { notation: "compact" })}`} />
              <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<DashTooltip />} />
              <Bar dataKey="sold" fill="var(--primary)" radius={[5, 5, 0, 0]} maxBarSize={48} />
            </BarChart> : <LineChart data={s.series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
               <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `R$ ${Number(v).toLocaleString(i18n.resolvedLanguage, { notation: "compact" })}`} />
              <ChartTooltip cursor={{ strokeDasharray: "4 4" }} content={<DashTooltip />} />
              <Line type="monotone" dataKey="sold" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>}
          </ChartContainer>
         ) : <Empty text={ui("Sem faturamento neste período.")} to="/cobrancas" cta={ui("Criar cobrança")} />}
      </Panel>

      {/* Evolução mensal do MRR */}
       <Panel title={ui("Evolução MRR")} subtitle={ui("Parcelas e recorrências · líquido por mês de vencimento")}
         action={<div className="flex shrink-0 items-center gap-3"><div className="flex rounded-lg border border-border p-0.5" aria-label={ui("Formato do gráfico")}><Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${mrrChart === "columns" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setMrrChart("columns")} aria-label={ui("Gráfico de colunas")}><BarChart3 /></Button><Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${mrrChart === "line" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setMrrChart("line")} aria-label={ui("Gráfico de linha")}><LineChartIcon /></Button></div></div>}>
        {loading ? <Skeleton h="h-[280px]" /> : s.mrrSeries.some((x) => x.sold) ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            {mrrChart === "columns" ? <BarChart data={s.mrrSeries} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
               <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `R$ ${Number(v).toLocaleString(i18n.resolvedLanguage, { notation: "compact" })}`} />
              <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<DashTooltip metric="MRR" />} />
              <Bar dataKey="sold" fill="var(--primary)" radius={[5, 5, 0, 0]} maxBarSize={48} />
            </BarChart> : <LineChart data={s.mrrSeries} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
               <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `R$ ${Number(v).toLocaleString(i18n.resolvedLanguage, { notation: "compact" })}`} />
              <ChartTooltip cursor={{ strokeDasharray: "4 4" }} content={<DashTooltip metric="MRR" />} />
              <Line type="monotone" dataKey="sold" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>}
          </ChartContainer>
         ) : <Empty text={ui("Sem parcelas ou recorrências neste período.")} to="/cobrancas" cta={ui("Criar cobrança")} />}
      </Panel>

      {/* 5-7 */}
      <div className="grid gap-6 lg:grid-cols-3">
         <Panel title={ui("Receita por serviço")} subtitle={ui("Somente pagamentos confirmados no período")}
          action={
            <div className="flex rounded-lg border border-border p-0.5">
               {([["faturados", ui("Faturados")], ["vendidos", ui("Vendidos")], ["ticket", ui("Ticket")]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSvcTab(k)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${svcTab === k ? "bg-muted text-foreground" : "text-muted-foreground"}`}>{l}</button>
              ))}
            </div>
          }>
          {loading ? <Skeleton h="h-52" /> : svcItems.length ? (
             <RankList items={svcItems} format={svcTab === "vendidos" ? (value) => ui(value === 1 ? "{{count}} venda" : "{{count}} vendas", { count: value }) : cents} />
           ) : <Empty text={ui("Nenhuma venda de serviço no período.")} to="/servicos" cta={ui("Cadastrar serviço")} />}
        </Panel>
         <Panel title={ui("Clientes de maior valor")} subtitle={ui("Total recebido desde o início (não depende do período)")}>
          {loading ? <Skeleton h="h-40" /> : s.ltv.length ? (
            <RankList items={s.ltv.map(([id, g]) => ({ label: s.custName.get(id) ?? ui("Cliente"), value: g.total, hint: ui("{{count}} pagamentos", { count: g.count }) }))} format={cents} />
           ) : <Empty text={ui("Ainda sem clientes com pagamentos.")} to="/clientes" cta={ui("Cadastrar cliente")} />}
        </Panel>
         <Panel title={ui("Ticket médio do período")} subtitle={ui("Valor médio de cada venda realizada")}>
          {loading ? <Skeleton h="h-40" /> : (
            <div className="flex min-h-40 flex-col justify-center">
              <p className={`numeric-tabular max-w-full overflow-hidden font-display font-bold text-foreground ${valueTextSize(cents(s.curr.ticket))}`}><MoneyValue value={mask(cents(s.curr.ticket))} /></p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Change value={pctChange(s.curr.ticket, s.prev.ticket)} />
                 <span>{ui("comparado ao período anterior")}</span>
              </div>
              <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                 {ui(s.curr.billedCount === 1 ? "Calculado sobre {{count}} venda no período." : "Calculado sobre {{count}} vendas no período.", { count: s.curr.billedCount })}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* 8. Performance comercial */}
       <Panel title={ui("Performance comercial")} subtitle={ui("Indicadores do período selecionado")}>
        <div className="grid overflow-hidden rounded-lg border border-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
           <Mini label={ui("Clientes")} value={String(s.totalCustomers)} />
           <Mini label={ui("Novos clientes")} value={String(s.newCustomers)} />
           <Mini label={ui("Vendas")} value={String(s.curr.count)} change={pctChange(s.curr.count, s.prev.count)} />
           <Mini label={ui("Ticket médio")} value={cents(s.curr.ticket)} change={pctChange(s.curr.ticket, s.prev.ticket)} />
           <Mini label={ui("Receita por cliente")} value={cents(s.curr.buyers ? s.curr.received / s.curr.buyers : 0)} />
           <Mini label={ui("Clientes recorrentes")} value={String(s.recurring)} />
        </div>
        <div className="mt-6 grid gap-6 border-t border-border pt-5 md:grid-cols-2">
          <div>
             <p className="mb-3 text-sm font-semibold">{ui("De onde vem sua receita?")}</p>
             {s.curr.received ? <Split parts={Object.entries(s.origin).map(([k, v]) => ({ label: ui(k), value: v }))} total={s.curr.received} /> : <p className="text-sm text-muted-foreground">{ui("Sem vendas no período.")}</p>}
          </div>
          <div>
             <p className="mb-3 text-sm font-semibold">{ui("Meios de pagamento")}</p>
             {s.methods.length ? <Split parts={s.methods.map(([k, g]) => ({ label: ui(METHOD_LABEL[k] ?? k), value: g.total }))} total={s.curr.received} /> : <p className="text-sm text-muted-foreground">{ui("Sem vendas no período.")}</p>}
          </div>
        </div>
      </Panel>

      {/* 9-10 */}
      <div className="grid gap-6 lg:grid-cols-2">
         <Panel title={ui("Próximos recebimentos")} action={<Link to="/cobrancas" search={{}} className="text-xs font-semibold text-primary hover:underline">{ui("Ver todos")}</Link>}>
          {loading ? <Skeleton h="h-40" /> : s.upcoming.length ? (
            <>
            <ul className="divide-y divide-border">
              {upcomingRows.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                     <p className="truncate font-medium">{(p.customer_id && s.custName.get(p.customer_id)) || p.description || ui("Cobrança")}</p>
                     <p className="text-xs text-muted-foreground">{ui("Vence {{date}}", { date: formatDate(p.due_on) })} · {ui(METHOD_LABEL[p.method ?? ""] ?? "A definir")}</p>
                  </div>
                  <span className="numeric-tabular font-semibold">{mask(cents(toCents(p.gross_amount)))}</span>
                </li>
              ))}
            </ul>
            <DataPagination page={upcomingPage} pageSize={4} total={s.upcoming.length} onPageChange={setUpcomingPage} />
            </>
           ) : <Empty text={ui("Nenhuma cobrança a vencer.")} to="/cobrancas" cta={ui("Criar cobrança")} />}
        </Panel>
         <Panel title={ui("Atividade recente")} action={<Link to="/financeiro" className="text-xs font-semibold text-primary hover:underline">{ui("Ver extrato")}</Link>}>
          {extras.isPending ? <Skeleton h="h-40" /> : extras.data?.transactions.length ? (
            <ul className="divide-y divide-border">
              {extras.data.transactions.slice(0, 5).map((t) => {
                const v = toCents(t.amount);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.description ?? t.kind}</p>
                       <p className="text-xs text-muted-foreground">{new Date(t.occurred_at).toLocaleString(i18n.resolvedLanguage, { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                    <span className={`numeric-tabular font-semibold ${v >= 0 ? "text-primary" : "text-foreground"}`}>{mask(`${v >= 0 ? "+" : "−"} ${cents(Math.abs(v))}`)}</span>
                  </li>
                );
              })}
            </ul>
           ) : <Empty text={ui("Nenhuma movimentação ainda.")} to="/cobrancas" cta={ui("Criar primeira cobrança")} />}
        </Panel>
      </div>
       <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><FilePlus2 className="h-3 w-3" /> {ui(mockup ? "Dados fictícios para demonstração. Nenhum saldo ou cobrança real foi alterado." : "Todos os valores vêm das cobranças e movimentações reais da sua conta.")}</p>
      {/* Notas fiscais — indicador compacto */}
      {extras.data ? (
        <Link to="/notas-fiscais" className="surface-panel flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:border-primary/40">
           <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><span className="font-medium">{ui("Notas fiscais")}</span>
             <span className="text-muted-foreground">· {ui("{{count}} emitidas", { count: extras.data.invoicesIssued })}{extras.data.invoicesPending ? ` · ${ui("{{count}} aguardando processamento", { count: extras.data.invoicesPending })}` : ""}{extras.data.invoicesError ? ` · ${ui("{{count}} com erro", { count: extras.data.invoicesError })}` : ""}</span></span>
           <span className="text-xs font-medium text-primary">{ui("Ver notas")}</span>
        </Link>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint, change, loading, icon: Icon }: { icon: LucideIcon; label: string; value: string; hint?: string; change?: number | null; loading?: boolean }) {
  const { t: ui } = useTranslation("ui");
  return (
    <div className="summary-strip-item min-w-0 p-5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" />{label}</p>
      {loading ? <Skeleton h="mt-2 h-8" /> : <p className={`numeric-tabular mt-1.5 max-w-full overflow-hidden font-display font-bold ${valueTextSize(value)}`}><MoneyValue value={value} /></p>}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        {change !== undefined ? <><Change value={change} /> <span>{ui("no período")}</span></> : hint}
      </div>
    </div>
  );
}

function valueTextSize(value: string, featured = false) {
  const length = value.length;
  if (length > 20) return featured ? "text-xl sm:text-2xl" : "text-base sm:text-lg";
  if (length > 16) return featured ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl";
  if (length > 13) return featured ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl";
  return featured ? "text-4xl sm:text-5xl" : "text-2xl sm:text-[1.7rem]";
}

function Mini({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return (
    <div className="summary-strip-item min-w-0 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="numeric-tabular mt-1 font-display text-lg font-semibold"><MoneyValue value={value} /></p>
      {change !== undefined && <Change value={change} />}
    </div>
  );
}

function Split({ parts, total }: { parts: { label: string; value: number }[]; total: number }) {
  const opac = [1, 0.6, 0.35, 0.2];
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {parts.map((p, i) => <div key={p.label} className="h-full bg-primary" style={{ width: `${total ? (p.value / total) * 100 : 0}%`, opacity: opac[i] ?? 0.2 }} />)}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" style={{ opacity: opac[i] ?? 0.2 }} />{p.label}</span>
            <span className="numeric-tabular text-muted-foreground">{cents(p.value)} · {total ? Math.round((p.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashTooltip({ active, payload, metric = "Total vendido" }: { active?: boolean; payload?: { payload: { label: string; sold: number } }[]; metric?: string }) {
  const { t: ui } = useTranslation("ui");
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold">{p.label}</p>
      <div className="flex justify-between gap-6">
         <span className="text-muted-foreground">{ui(metric)}</span>
        <span className="numeric-tabular font-medium">{formatBRL(p.sold)}</span>
      </div>
    </div>
  );
}

function CustomRange({ active, onApply, onClear }: { active: boolean; onApply: (de: string, ate: string) => void; onClear: () => void }) {
  const { t: ui } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<DateRange | undefined>();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          <CalendarDays className="h-3.5 w-3.5" />  {ui("Personalizado")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <Calendar mode="range" selected={sel} onSelect={setSel} numberOfMonths={1} disabled={{ after: new Date() }} />
        <div className="mt-2 flex justify-end gap-2">
           <Button variant="ghost" size="sm" onClick={() => { setSel(undefined); onClear(); setOpen(false); }}>{ui("Limpar")}</Button>
           <Button size="sm" disabled={!sel?.from} onClick={() => { if (sel?.from) { onApply(fmtDay(sel.from), fmtDay(sel.to ?? sel.from)); setOpen(false); } }}>{ui("Aplicar")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CompactStat({ label, value, loading, help, icon: Icon }: { label: string; value: string; loading?: boolean; help?: string; icon: LucideIcon }) {
  const { t: ui } = useTranslation("ui");
  return <div className="compact-strip-item min-w-0 px-3 py-3 sm:px-4">
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{label}</span>
      {help && <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={ui("Como funciona o MRR")}><CircleHelp className="h-3.5 w-3.5" /></Button></PopoverTrigger><PopoverContent align="start" className="max-w-[calc(100vw-2rem)] text-xs leading-relaxed"><p className="mb-1 font-semibold">{ui("Como funciona o MRR")}</p><p className="text-muted-foreground">{help}</p></PopoverContent></Popover>}
    </div>
    {loading ? <Skeleton h="mt-1 h-6" /> : <p className="numeric-tabular mt-1 overflow-hidden font-display text-lg font-semibold"><MoneyValue value={value} /></p>}
  </div>;
}
