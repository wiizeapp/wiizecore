import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Download, RefreshCw, Search } from "lucide-react";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ds";
import { DataPagination } from "@/components/ds/data-pagination";
import { ChartSkeleton, EmptyState, ErrorState, Shimmer, TableStateRow } from "@/components/states";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { getAdminFinance } from "@/lib/admin-finance.functions";

/* ---------------- Período ---------------- */

export type AdminPeriod = "hoje" | "ontem" | "trimestre" | "7d" | "30d" | "90d" | "mes" | "mes_anterior" | "ano" | "custom";
const PERIODS: { key: Exclude<AdminPeriod, "custom">; label: string }[] = [
  { key: "hoje", label: "Hoje" }, { key: "ontem", label: "Ontem" }, { key: "7d", label: "7 dias" }, { key: "30d", label: "30 dias" }, { key: "90d", label: "90 dias" },
  { key: "mes", label: "Este mês" }, { key: "mes_anterior", label: "Mês anterior" }, { key: "trimestre", label: "Trimestre" }, { key: "ano", label: "Este ano" },
];
const DAY = 86_400_000;
const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function resolveAdminRange(key: AdminPeriod, from?: string, to?: string) {
  const today = sod(new Date());
  const tomorrow = new Date(today.getTime() + DAY);
  let start = today, end = tomorrow, prevStart: Date;
  if (key === "custom" && from && to) { start = sod(new Date(`${from}T00:00:00`)); end = new Date(sod(new Date(`${to}T00:00:00`)).getTime() + DAY); }
  else if (key === "7d" || key === "30d" || key === "90d") start = new Date(tomorrow.getTime() - Number.parseInt(key, 10) * DAY);
  else if (key === "mes") start = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (key === "mes_anterior") { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 1); }
  else if (key === "ano") start = new Date(today.getFullYear(), 0, 1);
  else if (key === "ontem") { start = new Date(today.getTime() - DAY); end = today; }
  else if (key === "trimestre") start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  if (key === "mes" || key === "mes_anterior") prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  else if (key === "ano") prevStart = new Date(start.getFullYear() - 1, 0, 1);
  else prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const len = end.getTime() - start.getTime();
  return { start, end, prevStart, granularity: (len <= DAY ? "hour" : "day") as "hour" | "day" };
}

const compareLabel: Record<AdminPeriod, string> = {
  hoje: "vs. ontem", ontem: "vs. anteontem", trimestre: "vs. trimestre anterior", "7d": "vs. 7 dias anteriores", "30d": "vs. 30 dias anteriores", "90d": "vs. 90 dias anteriores",
  mes: "vs. mês anterior", mes_anterior: "vs. mês retrasado", ano: "vs. ano anterior", custom: "vs. período anterior",
};

export function useAdminFinance() {
  const [period, setPeriod] = useState<AdminPeriod>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = useMemo(() => resolveAdminRange(period, from, to), [period, from, to]);
  const fn = useServerFn(getAdminFinance);
  const query = useQuery({
    queryKey: ["admin-finance", range.start.toISOString(), range.end.toISOString()],
    queryFn: () => fn({ data: { start: range.start.toISOString(), end: range.end.toISOString(), prevStart: range.prevStart.toISOString(), granularity: range.granularity } }),
    staleTime: 60_000,
  });
  return { period, setPeriod, from, setFrom, to, setTo, range, ...query };
}
export type AdminFinanceState = ReturnType<typeof useAdminFinance>;
type FinanceData = NonNullable<AdminFinanceState["data"]>;
type Tx = FinanceData["transactions"][number] & Record<string, any>;

export function PeriodBar({ f }: { f: AdminFinanceState }) {
  const [custom, setCustom] = useState(f.period === "custom");
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" onClick={() => { setCustom(false); f.setPeriod(p.key); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${f.period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => setCustom(true)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${f.period === "custom" || custom ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Personalizado</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {custom ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); const a = String(d.get("from")), b = String(d.get("to")); if (a && b && a <= b) { f.setFrom(a); f.setTo(b); f.setPeriod("custom"); } }}>
            <Input type="date" name="from" defaultValue={f.from} className="h-9 w-[150px]" />
            <Input type="date" name="to" defaultValue={f.to} className="h-9 w-[150px]" />
            <Button size="sm" type="submit">Aplicar</Button>
          </form>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void f.refetch()} disabled={f.isFetching}><RefreshCw className={`h-3.5 w-3.5 ${f.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
      </div>
    </div>
  );
}

/* ---------------- Utilidades visuais ---------------- */

const METHOD: Record<string, string> = { pix: "Pix", pix_recurring: "Pix Automático", credit_card: "Cartão de crédito", credit_card_installment: "Cartão parcelado", debit_card: "Cartão de débito", boleto: "Boleto", outro: "Outros" };
const EXTRA: Record<string, string> = { anticipation: "Antecipações", withdrawal: "Taxas de saque", invoice: "Notas fiscais" };
const STATUS: Record<string, string> = { paid: "Pago", refunded: "Estornado", processing: "Processando", overdue: "Vencido", awaiting_payment: "Aguardando", created: "Criado", cancelled: "Cancelado", in_analysis: "Em análise", failed: "Falhou" };
const PIE: string[] = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function pct(cur: number, prev: number) { if (prev === 0) return cur === 0 ? 0 : null; return ((cur - prev) / Math.abs(prev)) * 100; }

function Delta({ cur, prev, label, invert }: { cur: number; prev: number; label: string; invert?: boolean }) {
  const p = pct(cur, prev);
  if (p === null) return <span className="text-xs text-muted-foreground">Novo {label}</span>;
  const up = p >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${p === 0 ? "text-muted-foreground" : good ? "text-primary" : "text-destructive"}`}><Icon className="h-3 w-3" />{Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function Panel({ title, description, children, action, className = "" }: { title: string; description?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`surface-panel p-5 sm:p-6 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-base font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Faixa com divisórias (mesmo padrão do Dashboard do usuário). Cada item pode ser clicado para ver a composição. */
function KpiStrip({ items, loading }: { items: { label: string; value: string; hint?: ReactNode; accent?: boolean; onClick?: () => void }[]; loading: boolean }) {
  return (
    <div className="surface-panel grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => {
        const body = (
          <>
            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            {loading ? <Shimmer className="mt-2.5 h-7 w-24" /> : <p className={`numeric-tabular mt-1.5 truncate font-display text-xl font-bold sm:text-2xl ${k.accent ? "text-primary" : ""}`}>{k.value}</p>}
            {!loading && k.hint ? <div className="mt-1.5">{k.hint}</div> : null}
          </>
        );
        return k.onClick ? (
          <button key={k.label} type="button" onClick={k.onClick} className="summary-strip-item min-w-0 p-5 text-left transition-colors hover:bg-muted/40">{body}</button>
        ) : <div key={k.label} className="summary-strip-item min-w-0 p-5">{body}</div>;
      })}
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

const SERIES = [
  { key: "volume", label: "Volume processado" },
  { key: "fees", label: "Receita bruta" },
  { key: "net", label: "Receita líquida" },
  { key: "cost", label: "Custos" },
  { key: "withdrawn", label: "Saques pagos" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

export function AdminFinanceDashboard({ f, onDrill }: { f: AdminFinanceState; onDrill: (title: string, filter: (t: Tx) => boolean) => void }) {
  const { data, isLoading, isError, refetch } = f;
  const [metric, setMetric] = useState<SeriesKey>("volume");
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  const c = data?.current, p = data?.previous, pos = data?.position;
  const cmp = compareLabel[f.period];
  const all = () => onDrill("Transações do período", () => true);

  return (
    <div className="space-y-6">
      {/* Visão executiva */}
      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="font-display text-base font-semibold">Como está a WiizePay hoje?</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Volume é dinheiro dos clientes. Receita é o que efetivamente pertence à WiizePay.</p>
        </div>
        <KpiStrip loading={isLoading} items={[
          { label: "Processamos", value: formatBRL(c?.volume), hint: c && p ? <Delta cur={c.volume} prev={p.volume} label={cmp} /> : null, onClick: all },
          { label: "Ganhamos (líquido)", value: formatBRL(c?.netRevenue), accent: true, hint: c && p ? <Delta cur={c.netRevenue} prev={p.netRevenue} label={cmp} /> : null, onClick: all },
          { label: "Margem", value: c?.margin == null ? "—" : `${c.margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, hint: <span className="text-xs text-muted-foreground">Receita líquida ÷ bruta</span> },
          { label: "A receber (clientes)", value: formatBRL(pos?.receivable), hint: <span className="text-xs text-muted-foreground">Em processamento {formatBRL(pos?.processing)}</span> },
          { label: "Vencido (clientes)", value: formatBRL(pos?.overdue), hint: <span className="text-xs text-muted-foreground">Cobranças em atraso</span> },
          { label: "A pagar (saques)", value: formatBRL(pos?.payable), hint: <span className="text-xs text-muted-foreground">{pos?.payableCount ?? 0} saques na fila</span> },
        ]} />
      </section>

      {/* Gráfico principal */}
      <Panel title="Performance financeira" description={`Período atual (linha cheia) ${cmp} (tracejado).`} action={
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
          {SERIES.map((s) => (
            <button key={s.key} type="button" onClick={() => setMetric(s.key)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${metric === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{s.label}</button>
          ))}
        </div>
      }>
        {isLoading ? <ChartSkeleton height={300} /> : <MainChart data={data!} metric={metric} granularity={f.range.granularity} />}
      </Panel>

      {/* Receita: bruta -> líquida */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="Receita da WiizePay" description="Receita bruta ≠ receita líquida. Custos são as taxas pagas ao provedor.">
          {isLoading ? <Shimmer className="h-56 w-full" /> : <RevenueWaterfall c={c!} p={p!} cmp={cmp} />}
        </Panel>
        <Panel className="xl:col-span-2" title="Taxas e custos" description="Taxas recebidas − custos de processamento = margem operacional.">
          {isLoading ? <Shimmer className="h-56 w-full" /> : (
            <div className="space-y-4">
              <Line label="Taxas cobradas dos clientes" value={c!.grossRevenue} />
              <Line label="Custos de processamento (provedor)" value={-c!.costs} />
              <div className="border-t border-border pt-4"><Line label="Margem operacional" value={c!.netRevenue} strong /></div>
              <div className="grid grid-cols-2 gap-3 pt-2 text-sm sm:grid-cols-3">
                <Mini label="Margem %" value={c!.margin == null ? "—" : `${c!.margin.toFixed(1).replace(".", ",")}%`} />
                <Mini label="Taxa média" value={c!.avgFeePct == null ? "—" : `${c!.avgFeePct.toFixed(2).replace(".", ",")}%`} />
                <Mini label="Custo médio/transação" value={formatBRL(c!.avgCostPerTx)} />
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Origem */}
      <Panel title="De onde veio o dinheiro" description="Receita por modalidade no período. Clique em uma linha para ver as transações.">
        {isLoading ? <Shimmer className="h-56 w-full" /> : <Origin data={data!} onDrill={onDrill} />}
      </Panel>

      {/* Indicadores de performance */}
      <Panel title="Indicadores de performance" description={`Comparação ${cmp}.`}>
        {isLoading ? <Shimmer className="h-24 w-full" /> : (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            {[
              ["Transações", c!.count.toLocaleString("pt-BR"), c!.count, p!.count],
              ["Ticket médio", formatBRL(c!.avgTicket), c!.avgTicket, p!.avgTicket],
              ["Empresas ativas", c!.customers.toLocaleString("pt-BR"), c!.customers, p!.customers],
              ["Receita bruta", formatBRL(c!.grossRevenue), c!.grossRevenue, p!.grossRevenue],
            ].map(([l, v, a, b]) => (
              <div key={l as string} className="bg-card p-4">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="numeric-tabular mt-1 font-display text-lg font-semibold">{v}</p>
                <Delta cur={a as number} prev={b as number} label="" />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span><span className={`numeric-tabular ${strong ? "font-display text-lg font-bold text-primary" : "font-medium"}`}>{formatBRL(value)}</span></div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="numeric-tabular mt-0.5 font-semibold">{value}</p></div>;
}

function MainChart({ data, metric, granularity }: { data: FinanceData; metric: SeriesKey; granularity: "hour" | "day" }) {
  const prevKey = `prev${metric.charAt(0).toUpperCase()}${metric.slice(1)}`;
  const rows = data.series.map((s) => {
    const d = new Date(s.t);
    return { label: granularity === "hour" ? `${String(d.getHours()).padStart(2, "0")}h` : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), atual: s[metric], anterior: (s as Record<string, number>)[prevKey] ?? 0 };
  });
  const totalCur = rows.reduce((a, r) => a + r.atual, 0), totalPrev = rows.reduce((a, r) => a + r.anterior, 0);
  if (!rows.some((r) => r.atual || r.anterior)) return <EmptyState title="Sem movimentação no período" text="Os valores aparecerão aqui quando houver transações." />;
  const config = { atual: { label: "Atual", color: "var(--chart-1)" }, anterior: { label: "Anterior", color: "var(--muted-foreground)" } } satisfies ChartConfig;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <p className="numeric-tabular font-display text-2xl font-bold">{formatBRL(totalCur)}</p>
        <Delta cur={totalCur} prev={totalPrev} label={`(anterior ${formatBRL(totalPrev)})`} />
      </div>
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
        <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
          <defs><linearGradient id="adminFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-atual)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--color-atual)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={70} tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { notation: "compact", style: "currency", currency: "BRL" })} />
          <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const a = Number(payload.find((x) => x.dataKey === "atual")?.value ?? 0), b = Number(payload.find((x) => x.dataKey === "anterior")?.value ?? 0);
            return <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-float"><p className="mb-1.5 font-semibold">{label}</p><p className="flex justify-between gap-6"><span className="text-muted-foreground">Atual</span><span className="numeric-tabular font-semibold">{formatBRL(a)}</span></p><p className="flex justify-between gap-6"><span className="text-muted-foreground">Anterior</span><span className="numeric-tabular">{formatBRL(b)}</span></p><div className="mt-1.5"><Delta cur={a} prev={b} label="" /></div></div>;
          }} />
          <Area dataKey="anterior" type="monotone" stroke="var(--color-anterior)" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
          <Area dataKey="atual" type="monotone" stroke="var(--color-atual)" fill="url(#adminFill)" strokeWidth={2} />
        </AreaChart>
      </ChartContainer>
    </>
  );
}

function RevenueWaterfall({ c, p, cmp }: { c: FinanceData["current"]; p: FinanceData["previous"]; cmp: string }) {
  const rows: [string, number, number?][] = [
    ["Taxas de cobranças", c.chargeFees, p.chargeFees],
    ["Antecipações", c.anticipationRevenue, p.anticipationRevenue],
    ["Taxas de saque", c.withdrawalRevenue, p.withdrawalRevenue],
    ["Notas fiscais", c.invoiceRevenue, p.invoiceRevenue],
  ];
  return (
    <div className="space-y-2.5 text-sm">
      {rows.map(([l, v, pv]) => <div key={l} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{l}</span><span className="flex items-center gap-3"><Delta cur={v} prev={pv ?? 0} label="" /><span className="numeric-tabular w-28 text-right font-medium">{formatBRL(v)}</span></span></div>)}
      <div className="flex justify-between border-t border-border pt-2.5 font-semibold"><span>Receita bruta</span><span className="numeric-tabular">{formatBRL(c.grossRevenue)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">(−) Custos do provedor (cobranças)</span><span className="numeric-tabular text-destructive">−{formatBRL(c.providerCost)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">(−) Custos de antecipação</span><span className="numeric-tabular text-destructive">−{formatBRL(c.anticipationCost)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">(−) Custos de notas fiscais</span><span className="numeric-tabular text-destructive">−{formatBRL(c.invoiceCost)}</span></div>
      <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2.5"><span className="font-semibold">Receita líquida</span><span className="flex items-center gap-3"><Delta cur={c.netRevenue} prev={p.netRevenue} label={cmp} /><span className="numeric-tabular font-display text-lg font-bold text-primary">{formatBRL(c.netRevenue)}</span></span></div>
      <p className="pt-1 text-xs text-muted-foreground">Estornos concluídos no período: {formatBRL(c.refunds)} (dinheiro devolvido pelos clientes; a taxa retida de {formatBRL(c.refundsRetained)} já está na receita).</p>
    </div>
  );
}

function Origin({ data, onDrill }: { data: FinanceData; onDrill: (title: string, filter: (t: Tx) => boolean) => void }) {
  const rows = [
    ...data.byMethod.map((m) => ({ key: m.method, label: METHOD[m.method] ?? m.method, volume: m.volume, count: m.count, fees: m.fees, cost: m.cost, net: m.net, drill: true })),
    ...data.extras.filter((e) => e.revenue || e.cost).map((e) => ({ key: e.key, label: EXTRA[e.key] ?? e.key, volume: 0, count: 0, fees: e.revenue, cost: e.cost, net: e.revenue - e.cost, drill: false })),
  ];
  if (!rows.length) return <EmptyState title="Sem receita no período" />;
  const pie = rows.filter((r) => r.fees > 0);
  const config = Object.fromEntries(pie.map((r, i) => [r.key, { label: r.label ?? r.key, color: PIE[i % PIE.length] ?? "var(--chart-1)" }])) as ChartConfig;
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center justify-center">
        {pie.length ? (
          <ChartContainer config={config} className="aspect-square h-[200px]">
            <PieChart><Pie data={pie} dataKey="fees" nameKey="label" innerRadius={58} outerRadius={90} strokeWidth={2}>{pie.map((r, i) => <Cell key={r.key} fill={PIE[i % PIE.length]} />)}</Pie>
              <ChartTooltip content={({ active, payload }) => active && payload?.[0] ? <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-float">{payload[0].name}: <b>{formatBRL(Number(payload[0].value))}</b></div> : null} />
            </PieChart>
          </ChartContainer>
        ) : null}
        <p className="text-xs text-muted-foreground">Distribuição da receita bruta</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Modalidade</TableHead><TableHead className="text-right">Volume</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Taxas</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key} className={r.drill ? "cursor-pointer" : ""} onClick={r.drill ? () => onDrill(r.label, (t) => t.method === r.key) : undefined}>
                <TableCell className="font-medium"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: PIE[pie.findIndex((x) => x.key === r.key) % PIE.length] ?? "var(--border)" }} />{r.label}</TableCell>
                <TableCell className="numeric-tabular text-right">{r.volume ? formatBRL(r.volume) : "—"}</TableCell>
                <TableCell className="numeric-tabular text-right">{r.count || "—"}</TableCell>
                <TableCell className="numeric-tabular text-right">{formatBRL(r.fees)}</TableCell>
                <TableCell className="numeric-tabular text-right text-muted-foreground">{formatBRL(r.cost)}</TableCell>
                <TableCell className="numeric-tabular text-right font-semibold text-primary">{formatBRL(r.net)}</TableCell>
              </TableRow>
            ))}
            <TableRow key={`total-${rows.length}`} className="font-semibold"><TableCell>Total</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(data.current.volume)}</TableCell><TableCell className="numeric-tabular text-right">{data.current.count}</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(data.current.grossRevenue)}</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(data.current.costs)}</TableCell><TableCell className="numeric-tabular text-right text-primary">{formatBRL(data.current.netRevenue)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ---------------- Exportação ---------------- */

export async function exportRows(rows: Record<string, unknown>[], name: string, kind: "csv" | "xlsx") {
  const XLSX = await import("xlsx");
  const { safeSpreadsheetRows } = await import("@/lib/spreadsheet-safety");
  const ws = XLSX.utils.json_to_sheet(safeSpreadsheetRows(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, `${name}.${kind}`, { bookType: kind });
}

function ExportButtons({ rows, name }: { rows: Record<string, unknown>[]; name: string }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => void exportRows(rows, name, "xlsx")}><Download className="h-3.5 w-3.5" /> Excel</Button>
      <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => void exportRows(rows, name, "csv")}><Download className="h-3.5 w-3.5" /> CSV</Button>
    </div>
  );
}

/* ---------------- Transações ---------------- */

export function AdminTransactions({ f, preset }: { f: AdminFinanceState; preset?: { title: string; filter: (t: Tx) => boolean } | null }) {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("all");
  const [sort, setSort] = useState<{ k: "date" | "amount" | "revenue"; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Tx | null>(null);
  const list = (f.data?.transactions ?? []) as Tx[];
  const rows = list
    .filter((t) => (preset ? preset.filter(t) : true))
    .filter((t) => method === "all" || t.method === method)
    .filter((t) => !q || `${t.tenant} ${t.id} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort.k === "date" ? String(a.date).localeCompare(String(b.date)) : Number(a[sort.k]) - Number(b[sort.k])) * sort.dir);
  const PAGE = 20;
  const methods = [...new Set(list.map((t) => String(t.method)))];
  const exp = rows.map((t) => ({ ID: t.id, Data: formatDateTime(String(t.date)), Empresa: t.tenant, Tipo: t.type, Metodo: METHOD[String(t.method)] ?? t.method, Valor: t.amount, Taxa: t.fee, Custo: t.cost, ReceitaWiize: t.revenue, Status: STATUS[String(t.status)] ?? t.status, Liquidacao: t.settlement ?? "", Conta: "Carteira da empresa" }));
  const th = (k: typeof sort.k, label: string) => <button type="button" className="font-medium hover:text-foreground" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>;
  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1 md:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar empresa, ID ou descrição" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={method} onChange={(e) => { setMethod(e.target.value); setPage(0); }}>
            <option value="all">Todos os métodos</option>
            {methods.map((m) => <option key={m} value={m}>{METHOD[m] ?? m}</option>)}
          </select>
          {preset ? <StatusBadge tone="neutral">{preset.title}</StatusBadge> : null}
        </div>
        <ExportButtons rows={exp} name="transacoes-wiizepay" />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>{th("date", "Data")}</TableHead><TableHead>Empresa</TableHead><TableHead>Método</TableHead><TableHead className="text-right">{th("amount", "Valor")}</TableHead><TableHead className="text-right">Taxa</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">{th("revenue", "Receita WiizePay")}</TableHead><TableHead>Status</TableHead><TableHead>Liquidação</TableHead></TableRow></TableHeader>
          <TableBody>
            {f.isLoading ? <TableStateRow cols={9}><Shimmer className="h-6 w-full" /></TableStateRow>
              : !rows.length ? <TableStateRow cols={9}><span className="text-sm text-muted-foreground">Nenhuma transação no período.</span></TableStateRow>
              : rows.slice(page * PAGE, page * PAGE + PAGE).map((t) => (
                <TableRow key={String(t.id)} className="cursor-pointer" onClick={() => setOpen(t)}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(String(t.date))}</TableCell>
                  <TableCell className="max-w-[180px] truncate font-medium">{t.tenant}</TableCell>
                  <TableCell className="text-xs">{METHOD[String(t.method)] ?? t.method}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(t.amount)}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(t.fee)}</TableCell>
                  <TableCell className="numeric-tabular text-right text-muted-foreground">{formatBRL(t.cost)}</TableCell>
                  <TableCell className="numeric-tabular text-right font-semibold text-primary">{formatBRL(t.revenue)}</TableCell>
                  <TableCell><StatusBadge tone={t.status === "paid" ? "success" : "neutral"}>{STATUS[String(t.status)] ?? t.status}</StatusBadge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{t.settlement ? formatDate(String(t.settlement)) : "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border p-3"><DataPagination page={page} pageSize={PAGE} total={rows.length} onPageChange={setPage} /></div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Detalhes da transação</SheetTitle></SheetHeader>
          {open ? (
            <dl className="mt-6 space-y-3 text-sm">
              {[["ID", open.id], ["Data", formatDateTime(String(open.date))], ["Empresa", open.tenant], ["Tipo", open.type], ["Método", METHOD[String(open.method)] ?? open.method], ["Descrição", open.description ?? "—"], ["Valor", formatBRL(open.amount)], ["Taxa cobrada", formatBRL(open.fee)], ["Custo do provedor", formatBRL(open.cost)], ["Receita WiizePay", formatBRL(open.revenue)], ["Status", STATUS[String(open.status)] ?? open.status], ["Liquidação prevista", open.settlement ? formatDate(String(open.settlement)) : "—"], ["Situação do saldo", open.settlementStatus ?? "—"], ["Conta relacionada", "Carteira da empresa"]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 border-b border-border pb-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-all text-right font-medium">{String(v)}</dd></div>
              ))}
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/* ---------------- Receitas / A receber / Estornos ---------------- */

export function AdminRevenue({ f }: { f: AdminFinanceState }) {
  if (f.isLoading) return <Shimmer className="h-64 w-full" />;
  if (!f.data) return <ErrorState onRetry={() => void f.refetch()} />;
  return <div className="grid gap-6 xl:grid-cols-2"><Panel title="Receita bruta → líquida"><RevenueWaterfall c={f.data.current} p={f.data.previous} cmp={compareLabel[f.period]} /></Panel><Panel title="Origem da receita"><Origin data={f.data} onDrill={() => undefined} /></Panel></div>;
}

const BUCKET: Record<"open" | "overdue" | "processing", { label: string; tone: "neutral" | "danger" | "warning" }> = { open: { label: "A receber", tone: "neutral" }, overdue: { label: "Vencido", tone: "danger" }, processing: { label: "Em processamento", tone: "warning" } };

export function AdminReceivables({ f }: { f: AdminFinanceState }) {
  const [tab, setTab] = useState<"all" | "open" | "overdue" | "processing">("all");
  const [page, setPage] = useState(0);
  const list = f.data?.receivables ?? [];
  const rows = list.filter((r) => tab === "all" || r.bucket === tab);
  const PAGE = 20;
  const pos = f.data?.position;
  const exp = rows.map((r) => ({ Empresa: r.tenant, Valor: r.amount, Vencimento: r.due, Metodo: METHOD[String(r.method)] ?? r.method, Situacao: BUCKET[r.bucket as "open"].label, Taxa: r.fee, Liquido: r.net, Dias: r.days }));
  return (
    <div className="space-y-6">
      <KpiStrip loading={f.isLoading} items={[
        { label: "A receber", value: formatBRL(pos?.receivable), onClick: () => setTab("open") },
        { label: "Vencido", value: formatBRL(pos?.overdue), onClick: () => setTab("overdue") },
        { label: "Em processamento", value: formatBRL(pos?.processing), onClick: () => setTab("processing") },
        { label: "Recebido no período", value: formatBRL(f.data?.current.volume), accent: true },
        { label: "Cobranças em aberto", value: String(list.length) },
        { label: "Receita prevista", value: formatBRL(list.filter((r) => r.bucket !== "overdue").reduce((s, r) => s + r.fee, 0)) },
      ]} />
      <section className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-wrap gap-1">{(["all", "open", "overdue", "processing"] as const).map((k) => <Button key={k} size="sm" variant={tab === k ? "default" : "ghost"} onClick={() => { setTab(k); setPage(0); }}>{k === "all" ? "Todos" : BUCKET[k].label}</Button>)}</div>
          <ExportButtons rows={exp} name="contas-a-receber-wiizepay" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Método</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Taxa</TableHead><TableHead className="text-right">Líquido</TableHead><TableHead className="text-right">Dias</TableHead></TableRow></TableHeader>
            <TableBody>
              {!rows.length ? <TableStateRow cols={8}><span className="text-sm text-muted-foreground">Nada por aqui.</span></TableStateRow> : rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.tenant}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.amount)}</TableCell>
                  <TableCell>{formatDate(r.due)}</TableCell>
                  <TableCell className="text-xs">{METHOD[String(r.method)] ?? "—"}</TableCell>
                  <TableCell><StatusBadge tone={BUCKET[r.bucket as "open"].tone}>{BUCKET[r.bucket as "open"].label}</StatusBadge></TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.fee)}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.net)}</TableCell>
                  <TableCell className={`numeric-tabular text-right ${r.days < 0 ? "text-destructive" : ""}`}>{r.days}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border p-3"><DataPagination page={page} pageSize={PAGE} total={rows.length} onPageChange={setPage} /></div>
      </section>
    </div>
  );
}

export function AdminRefunds({ f }: { f: AdminFinanceState }) {
  const rows = f.data?.refunds ?? [];
  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4"><p className="text-sm text-muted-foreground">Estornos concluídos no período. O valor devolvido é dinheiro do cliente; a taxa retida fica com a WiizePay.</p><ExportButtons rows={rows.map((r) => ({ Empresa: r.tenant, Valor: r.amount, TaxaRetida: r.retained, Data: r.date, Motivo: r.reason }))} name="estornos-wiizepay" /></div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Empresa</TableHead><TableHead>Motivo</TableHead><TableHead className="text-right">Devolvido</TableHead><TableHead className="text-right">Taxa retida</TableHead></TableRow></TableHeader>
          <TableBody>
            {!rows.length ? <TableStateRow cols={5}><span className="text-sm text-muted-foreground">Nenhum estorno no período.</span></TableStateRow> : rows.map((r) => (
              <TableRow key={String(r.id)}><TableCell className="text-xs">{formatDateTime(String(r.date))}</TableCell><TableCell>{String(r.tenant)}</TableCell><TableCell className="max-w-xs truncate text-sm">{String(r.reason)}</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(Number(r.amount))}</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(Number(r.retained))}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
