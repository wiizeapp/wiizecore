import { useTranslation } from "react-i18next";
import { csvCell } from "@/lib/csv-safe";
import { listRefunds } from "@/lib/refunds.functions";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronUp, Download, Eye, EyeOff, FilePlus2, FileSignature,
  LineChart as LineChartIcon, Plus, RefreshCw, UserPlus, Wallet,
  FileText, CircleDollarSign, CircleHelp, Clock3, ListChecks, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatBRL, formatDate } from "@/lib/format";
import { buckets, pctChange, PERIOD_OPTIONS, resolveRange, toCents, type PeriodKey } from "@/lib/dashboard-period";
import { Change, Empty, Panel, RankList, Skeleton, type AppPath } from "@/components/dashboard/parts";
import moneyAsset from "@/assets/dashboard-money-neon.asset.json";
import calendarAsset from "@/assets/dashboard-calendar-neon.asset.json";
import { countFirstChargeCustomers, forecastNext30Days, monthlyIssuedNetHistory, isOpen, isOverdue, summarize, type SummaryRow } from "@/lib/financial-summary";
import { DashboardAmount } from "@/components/dashboard/amount";
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

const mrrChartConfig = { net: { label: "MRR líquido emitido", color: "var(--primary)" } } satisfies ChartConfig;
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
  const [hidden, setHidden] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(true);
  const [revenueChart, setRevenueChart] = useState<"columns" | "line">("columns");
  const [mrrChart, setMrrChart] = useState<"columns" | "line">("columns");

  const wallet = useTenantQuery("wallet", tenantId, async (t) => {
    const { data, error } = await supabase.from("wallets").select("available_balance, pending_balance").eq("tenant_id", t).maybeSingle();
    if (error) throw error;
    return data;
  });
  const payments = useTenantQuery("payments", tenantId, async (t) => {
    const fetchPage = async (offset: number) => {
      const { data, error } = await supabase.from("payments")
        .select("id, description, gross_amount, net_amount, platform_fee_amount, refunded_amount, status, method, created_at, paid_at, due_on, customer_id, service_id, subscription_id, installment_count")
        .eq("tenant_id", t).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
      if (error) throw error;
      return data ?? [];
    };
    const rows = await fetchPage(0);
    let page = rows;
    while (page.length === 1000) { page = await fetchPage(rows.length); rows.push(...page); }
    return rows;
  });
  const customers = useTenantQuery("customers", tenantId, async (t) => {
    const fetchPage = async (offset: number) => {
      const { data, error } = await supabase.from("customers").select("id, name, created_at").eq("tenant_id", t).order("id").range(offset, offset + 999);
      if (error) throw error;
      return data ?? [];
    };
    const rows = await fetchPage(0);
    let page = rows;
    while (page.length === 1000) { page = await fetchPage(rows.length); rows.push(...page); }
    return rows;
  });
  const services = useTenantQuery("services", tenantId, async (t) => {
    const { data, error } = await supabase.from("services").select("id, name").eq("tenant_id", t);
    if (error) throw error;
    return data ?? [];
  });
  const extras = useTenantQuery("extras", tenantId, async (t) => {
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

  const loading = payments.isPending || customers.isPending || payments.isError || customers.isError;
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

    const group = <K extends string>(list: typeof rows, key: (r: (typeof rows)[number]) => K | null) => {
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
    const newCustomers = countFirstChargeCustomers(rows, range.start, range.end);
    const previousNewCustomers = countFirstChargeCustomers(rows, range.prevStart, range.prevEnd);
    const forecast = forecastNext30Days(rows);
    const mrrSeries = monthlyIssuedNetHistory(rows).map((point) => ({ ...point, label: new Date(`${point.month}-01T12:00:00Z`).toLocaleDateString(i18n.resolvedLanguage ?? "pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }) }));
    const activeCount = curr.sales.filter((r) => isOpen(r.status) || isOverdue(r)).length;

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
      curr, prev, series, svcTop, ltv, recurring, newCustomers, previousNewCustomers, forecast, mrrSeries, activeCount, origin, methods, upcoming, overdue,
      openCount: open.length, custName, svcName, totalCustomers: customers.data?.length ?? 0,
      hasPaid: rows.some((r) => r.status === "paid"), hasCharge: rows.length > 0, periodRows: curr.sales,
    };
  }, [payments.data, customers.data, services.data, range, i18n.resolvedLanguage]);

  const setPeriod = (p: Search) => navigate({ search: p, replace: true });
  const refresh = () => { for (const q of [wallet, payments, customers, services, extras]) void q.refetch(); };
  const updatedAt = Math.max(wallet.dataUpdatedAt, payments.dataUpdatedAt);
  const mins = updatedAt ? Math.floor((Date.now() - updatedAt) / 60000) : null;
  const mask = (v: string) => (hidden ? "R$ ••••••" : v);

  const exportCsv = () => {
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
  const showJourney = !extras.isPending && !services.isPending && next;

  const [svcTab, setSvcTab] = useState<"faturados" | "vendidos" | "ticket">("faturados");
  const [upcomingPage, setUpcomingPage] = useState(0);
  const svcRaw = s.svcTop[svcTab];
  const svcItems = svcRaw.slice(0, 5).map(([id, g]) => ({
    label: s.svcName.get(id) ?? ui("Serviço"),
    value: svcTab === "vendidos" ? g.count : svcTab === "ticket" ? g.total / g.count : g.total,
    hint: svcTab === "vendidos" ? undefined : ui(g.count === 1 ? "{{count}} venda" : "{{count}} vendas", { count: g.count }),
  }));
  const upcomingRows = paginate(s.upcoming, upcomingPage, 4);

  const alerts: { text: string; to: AppPath }[] = [];
  if (extras.data && !activated) alerts.push({ text: ui("Ative sua conta para começar a receber pagamentos."), to: "/ativacao" });
  else if (extras.data && activated && workspace && !workspace.hasFinancialPassword)
    alerts.push({ text: ui("Crie sua senha financeira para proteger saques e operações sensíveis."), to: "/seguranca" });
  if (s.overdue.length) alerts.push({ text: ui(s.overdue.length === 1 ? "{{count}} cobrança vencida aguardando pagamento." : "{{count}} cobranças vencidas aguardando pagamento.", { count: s.overdue.length }), to: "/cobrancas" });

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{ui("Dashboard")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
             {workspace?.tenantName ?? ui("Sua empresa")} · {mins === null ? ui("Carregando…") : mins < 1 ? ui("Atualizado agora") : ui("Atualizado há {{minutes}} min", { minutes: mins })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
            {PERIOD_OPTIONS.map((o) => (
              <button key={o.key} type="button" onClick={() => setPeriod({ periodo: o.key })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${periodo === o.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                 {ui(o.label)}
              </button>
            ))}
            <CustomRange active={periodo === "custom"} onApply={(de, ate) => setPeriod({ periodo: "custom", de, ate })} onClear={() => setPeriod({ periodo: "hoje" })} />
          </div>
           <Button variant="outline" size="icon" onClick={refresh} aria-label={ui("Atualizar")}>
            <RefreshCw className={`h-4 w-4 ${payments.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!s.periodRows.length}>
            <Download className="mr-1.5 h-4 w-4" />  {ui("Exportar")}
          </Button>
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

      {/* Saldo e previsão da empresa — independentes do filtro histórico. */}
      <section aria-label={ui("Resumo financeiro")} className="grid gap-3 sm:grid-cols-2 sm:gap-6">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_80px] items-center gap-3 border-b border-border/60 pb-6 pt-3 sm:grid-cols-[minmax(0,1fr)_112px] sm:border-b-0 sm:border-r sm:py-3 sm:pr-6 xl:grid-cols-[minmax(0,1fr)_128px]">
          <div className="grid min-w-0 grid-rows-[28px_40px_16px] gap-y-2">
            <div className="flex h-7 min-w-0 items-center gap-2 text-sm text-muted-foreground">
              {ui("Saldo disponível")}
              <MetricHelp title={ui("Saldo disponível")} description={ui("Valor já liberado na sua carteira para solicitar saque. Valores a liberar ainda aguardam liquidação. Este saldo não muda com o filtro de período.")} />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setHidden((h) => !h)} aria-label={ui(hidden ? "Mostrar valores" : "Ocultar valores")}>
                {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {wallet.isPending || wallet.isError ? <Skeleton h="h-8 self-center" /> : <p className={`numeric-tabular self-center break-words font-display font-bold text-foreground ${valueTextSize(mask(cents(available)), true)}`}><DashboardAmount value={mask(cents(available))} /></p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">{wallet.isPending || wallet.isError ? ui("Carregando…") : ui("A liberar {{value}}", { value: mask(cents(toReceive)) })}</span>
              <Link to="/financeiro" className="font-semibold text-primary hover:underline">{ui("Sacar")} <ArrowRight className="inline h-3 w-3" /></Link>
            </div>
          </div>
          <img src={moneyAsset.url} alt="" className="h-20 w-20 shrink-0 object-contain sm:h-28 sm:w-28 xl:h-32 xl:w-32" />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_80px] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_112px] xl:grid-cols-[minmax(0,1fr)_128px]">
          <div className="grid min-w-0 grid-rows-[28px_40px_16px] gap-y-2">
            <div className="flex h-7 min-w-0 items-center gap-2 text-sm text-muted-foreground"><span className="min-w-0">{ui("MRR líquido previsto")}</span><MetricHelp title={ui("MRR líquido previsto")} description={ui("Previsão líquida da sua empresa: soma das parcelas e recorrências já emitidas, em aberto e com vencimento nos próximos 30 dias, descontadas as taxas registradas. Não inclui pagamentos concluídos, cancelados ou estornados, nem ciclos futuros ainda não emitidos. Não é saldo disponível e independe do filtro de período.")} /></div>
            {loading ? <Skeleton h="h-8 self-center" /> : <p className={`numeric-tabular self-center break-words font-display font-bold text-foreground ${valueTextSize(mask(formatBRL(s.forecast.net)), true)}`}><DashboardAmount value={mask(formatBRL(s.forecast.net))} /></p>}
          </div>
          <img src={calendarAsset.url} alt="" className="h-20 w-20 shrink-0 scale-[0.78] object-contain sm:h-28 sm:w-28 xl:h-32 xl:w-32" />
        </div>
      </section>
      <section aria-label={ui("Indicadores do período")} className="surface-panel grid grid-cols-2 overflow-hidden lg:grid-cols-5">
        <Stat className="col-span-2 border-r-0 lg:col-span-1 lg:border-r" icon={CircleDollarSign} label={ui("Faturado")} value={mask(cents(s.curr.sold))} change={pctChange(s.curr.sold, s.prev.sold)} loading={loading} />
        <Stat className="border-r" icon={Clock3} label={ui("A receber")} value={mask(cents(s.curr.pending))} hint={ui(s.curr.pendingCount === 1 ? "{{count}} cobrança aguardando" : "{{count}} cobranças aguardando", { count: s.curr.pendingCount })} loading={loading} />
        <Stat icon={AlertTriangle} label={ui("Vencidos")} value={mask(cents(s.curr.overdue))} hint={ui(s.curr.overdueCount === 1 ? "{{count}} cobrança vencida" : "{{count}} cobranças vencidas", { count: s.curr.overdueCount })} loading={loading} />
        <Stat className="border-r border-b-0" icon={ListChecks} label={ui("Cobranças ativas")} value={String(s.activeCount)} hint={ui("Em aberto no período")} loading={loading} />
        <Stat icon={UserPlus} label={ui("Novos clientes")} value={String(s.newCustomers)} change={pctChange(s.newCustomers, s.previousNewCustomers)} loading={loading} />
      </section>

      {/* Ações rápidas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["/cobrancas", ui("Criar cobrança"), Plus],
           ["/clientes", ui("Novo cliente"), UserPlus],
           ["/contratos", ui("Novo contrato"), FileSignature],
           ["/financeiro", ui("Sacar"), Wallet],
        ] as const).map(([to, label, Icon]) => (
          <Link key={label} to={to} {...(to === "/cobrancas" ? { search: { nova: true } } : {})}
            className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-primary/40">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-4 w-4" />
            </span>
            {label}
          </Link>
        ))}
      </div>

      {/* 4. Faturamento */}
       <Panel title={ui("Faturamento")} subtitle={ui("Valor total vendido · {{granularity}}", { granularity: ui(range.granularity === "hour" ? "por hora" : "por dia") })}
         action={<div className="flex shrink-0 items-center gap-3"><ChartMode value={revenueChart} onChange={setRevenueChart} /><div className="text-right"><Change value={pctChange(s.curr.sold, s.prev.sold)} /><p className="text-[11px] text-muted-foreground">{ui("vs. período anterior")}</p></div></div>}>
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

      <Panel title={ui("Evolução do MRR")} subtitle={ui("MRR líquido emitido · últimos 12 meses")}
        action={<div className="flex shrink-0 items-center gap-3"><ChartMode value={mrrChart} onChange={setMrrChart} /><MetricHelp title={ui("Evolução do MRR")} description={ui("Líquido das parcelas e recorrências já emitidas, agrupado pelo mês de vencimento, com taxas registradas e reembolsos descontados. Inclui cobranças pagas, em aberto e vencidas; exclui avulsas, canceladas e falhas. É a evolução da base emitida, não MRR contratual normalizado nem receita recebida. Não reconstrói alterações antigas nem projeta ciclos futuros. O mês atual está em andamento e este gráfico não depende do filtro de período.")} /></div>}>
        {loading ? <Skeleton h="h-[280px]" /> : s.mrrSeries.some((point) => point.count > 0) ? (
          <>
            <ChartContainer config={mrrChartConfig} className="aspect-auto h-[280px] w-full">
              {mrrChart === "columns" ? <BarChart data={s.mrrSeries} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `R$ ${Number(v).toLocaleString(i18n.resolvedLanguage, { notation: "compact" })}`} />
                <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<MrrTooltip />} />
                <Bar dataKey="net" fill="var(--primary)" radius={[5, 5, 0, 0]} maxBarSize={48} />
              </BarChart> : <LineChart data={s.mrrSeries} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `R$ ${Number(v).toLocaleString(i18n.resolvedLanguage, { notation: "compact" })}`} />
                <ChartTooltip cursor={{ strokeDasharray: "4 4" }} content={<MrrTooltip />} />
                <Line type="monotone" dataKey="net" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>}
            </ChartContainer>
            <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4 border-t border-border/60 pt-4 sm:grid-cols-6 lg:grid-cols-12">
              {s.mrrSeries.map((point) => <div key={point.month} className="min-w-0"><p className="text-[11px] text-muted-foreground">{point.label}</p><p className="mt-1 text-sm font-semibold"><DashboardAmount value={mask(formatBRL(point.net))} /></p></div>)}
            </div>
          </>
        ) : <Empty text={ui("Ainda não há parcelas ou recorrências emitidas para mostrar a evolução do MRR.")} />}
      </Panel>

      {showJourney && (
         <Panel title={ui("Sua jornada no WiizePay")} subtitle={ui("Complete as etapas para aproveitar todo o potencial da WiizePay.")}
           action={<div className="flex shrink-0 items-center gap-2"><span className="numeric-tabular text-xs font-semibold text-primary">{ui("{{done}} de {{total}} etapas", { done: doneCount, total: journey.length })}</span><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setJourneyOpen((open) => !open)} aria-expanded={journeyOpen} aria-label={ui(journeyOpen ? "Fechar jornada" : "Abrir jornada")}>{journeyOpen ? <ChevronUp /> : <ChevronDown />}</Button></div>}>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(doneCount / journey.length) * 100}%` }} /></div>
          {journeyOpen && <ol className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{journey.map((j) => { const isNext = j === next; return <li key={j.label}><Link to={j.to} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${isNext ? "bg-primary/10 font-semibold" : "hover:bg-muted"} ${j.done ? "text-muted-foreground" : ""}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${j.done ? "border-primary bg-primary text-primary-foreground" : isNext ? "border-primary" : "border-border"}`}>{j.done && <Check className="h-3 w-3" />}</span><span className={j.done ? "line-through decoration-muted-foreground/40" : ""}>{j.label}</span>{isNext && <ArrowRight className="ml-auto h-3.5 w-3.5 text-primary" />}</Link></li>; })}</ol>}
        </Panel>
      )}

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
              <p className={`numeric-tabular max-w-full overflow-hidden font-display font-bold text-foreground ${valueTextSize(cents(s.curr.ticket))}`}><DashboardAmount value={cents(s.curr.ticket)} /></p>
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
        <RefundMetric />
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
                  <span className="numeric-tabular font-semibold"><DashboardAmount value={mask(cents(toCents(p.gross_amount)))} /></span>
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
                    <span className={`numeric-tabular font-semibold ${v >= 0 ? "text-primary" : "text-foreground"}`}><DashboardAmount value={mask(`${v >= 0 ? "+" : "−"} ${cents(Math.abs(v))}`)} /></span>
                  </li>
                );
              })}
            </ul>
           ) : <Empty text={ui("Nenhuma movimentação ainda.")} to="/cobrancas" cta={ui("Criar primeira cobrança")} />}
        </Panel>
      </div>
       <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><FilePlus2 className="h-3 w-3" /> {ui("Todos os valores vêm das cobranças e movimentações reais da sua conta.")}</p>
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

function ChartMode({ value, onChange }: { value: "columns" | "line"; onChange: (value: "columns" | "line") => void }) {
  const { t: ui } = useTranslation("ui");
  return <div className="flex rounded-lg border border-border p-0.5" aria-label={ui("Formato do gráfico")}>
    <Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${value === "columns" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => onChange("columns")} aria-pressed={value === "columns"} aria-label={ui("Gráfico de colunas")}><BarChart3 /></Button>
    <Button type="button" variant="ghost" size="icon" className={`h-7 w-7 ${value === "line" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => onChange("line")} aria-pressed={value === "line"} aria-label={ui("Gráfico de linha")}><LineChartIcon /></Button>
  </div>;
}

function MetricHelp({ title, description }: { title: string; description: string }) {
  const { t: ui } = useTranslation("ui");
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" aria-label={ui("Como funciona: {{indicador}}", { indicador: title })}><CircleHelp className="h-4 w-4" /></Button></PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)] text-sm" align="start"><p className="mb-2 font-semibold">{title}</p><p className="leading-relaxed text-muted-foreground">{description}</p></PopoverContent>
    </Popover>
  );
}

function Stat({ label, value, hint, change, loading, icon: Icon, className = "" }: { label: string; value: string; hint?: string; change?: number | null; loading?: boolean; icon?: LucideIcon; className?: string }) {
  const { t: ui } = useTranslation("ui");
  return (
    <div className={`min-w-0 border-b border-border p-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${className}`}>
      <p className="flex min-h-8 items-center gap-2 text-xs font-medium text-muted-foreground">{Icon && <Icon size={16} strokeWidth={1.75} className="h-4 w-4 shrink-0 text-primary" />}<span className="min-w-0">{label}</span></p>
      {loading ? <Skeleton h="mt-2 h-8" /> : <p className={`numeric-tabular mt-1.5 max-w-full break-words font-display font-bold ${valueTextSize(value)}`}><DashboardAmount value={value} /></p>}
      <div className="mt-2 flex min-h-8 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed text-muted-foreground">
        {!loading && (change !== undefined ? (change === 0 || change === null ? ui("Sem métricas para analisar no período") : <><Change value={change} /> <span>{ui("no período")}</span></>) : hint)}
      </div>
    </div>
  );
}

function valueTextSize(value: string, featured = false) {
  const length = value.length;
  if (length > 20) return "text-base sm:text-lg";
  if (length > 16) return "text-lg sm:text-xl";
  if (length > 13) return "text-xl sm:text-2xl";
  return featured ? "text-2xl sm:text-3xl" : "text-2xl sm:text-[1.7rem]";
}

function Mini({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return (
    <div className="summary-strip-item min-w-0 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="numeric-tabular mt-1 font-display text-lg font-semibold"><DashboardAmount value={value} /></p>
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
            <span className="numeric-tabular text-muted-foreground"><DashboardAmount value={cents(p.value)} /> · {total ? Math.round((p.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; sold: number } }[] }) {
  const { t: ui } = useTranslation("ui");
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold">{p.label}</p>
      <div className="flex justify-between gap-6">
         <span className="text-muted-foreground">{ui("Total vendido")}</span>
        <span className="numeric-tabular font-medium"><DashboardAmount value={formatBRL(p.sold)} /></span>
      </div>
    </div>
  );
}

function MrrTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; net: number } }[] }) {
  const { t: ui } = useTranslation("ui");
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-xl"><p className="mb-1.5 font-semibold">{point.label}</p><div className="flex justify-between gap-6"><span className="text-muted-foreground">{ui("MRR líquido emitido")}</span><span className="text-base font-semibold"><DashboardAmount value={formatBRL(point.net)} /></span></div></div>;
}

function CustomRange({ active, onApply, onClear }: { active: boolean; onApply: (de: string, ate: string) => void; onClear: () => void }) {
  const { t: ui } = useTranslation("ui");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<DateRange | undefined>();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
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

function RefundMetric() {
  const { t: ui } = useTranslation("ui");
  const fn = useServerFn(listRefunds);
  const { data } = useQuery({ queryKey: ["refunds"], queryFn: () => fn() });
  const since = Date.now() - 30 * 86400e3;
  const done = ((data ?? []) as { status: string; refund_amount: number | string; created_at: string }[]).filter((r) => r.status === "completed" && new Date(r.created_at).getTime() >= since);
  if (!done.length) return null;
  const total = done.reduce((a, r) => a + Number(r.refund_amount), 0);
  return (
    <Link to="/cobrancas" className="mt-5 flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted">
       <span className="text-muted-foreground">{ui("Reembolsos nos últimos 30 dias")}</span>
      <span className="numeric-tabular font-semibold"><DashboardAmount value={formatBRL(total)} /> · {done.length}</span>
    </Link>
  );
}
