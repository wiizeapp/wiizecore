import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Download, FlaskConical, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartSkeleton, EmptyState, ErrorState, Shimmer } from "@/components/states";
import { formatBRL, formatDateTime } from "@/lib/format";
import { getFeeConfiguration, getUnitEconomics, saveRate } from "@/lib/unit-economics.functions";
import { MIX_LABELS, MIX_TIER, findRate, type MixKey } from "@/lib/fee-math";
import { simulate } from "@/lib/unit-economics";
import { exportRows, type AdminFinanceState } from "./admin-finance";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function useUE(f: AdminFinanceState) {
  const fn = useServerFn(getUnitEconomics);
  return useQuery({
    queryKey: ["unit-economics", f.range.start.toISOString(), f.range.end.toISOString()],
    queryFn: () => fn({ data: { start: f.range.start.toISOString(), end: f.range.end.toISOString() } }),
    staleTime: 60_000,
  });
}

function RealBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"><CheckCircle2 className="h-3 w-3" />Dados reais</span>;
}

function Kpis({ items }: { items: { label: string; value: string; hint?: string | undefined }[] }) {
  return (
    <div className="surface-panel grid grid-cols-2 divide-border overflow-hidden sm:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border">
      {items.map((k) => (
        <div key={k.label} className="min-w-0 p-4">
          <p className="truncate text-xs text-muted-foreground">{k.label}</p>
          <p className="numeric-tabular mt-1.5 truncate font-display text-xl font-semibold">{k.value}</p>
          {k.hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{k.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

/** Seção "Performance Financeira" do Dashboard Admin. */
export function AdminPerformance({ f }: { f: AdminFinanceState }) {
  const q = useUE(f);
  if (q.isLoading) return <Shimmer className="h-40" />;
  if (q.error || !q.data) return <ErrorState text="Não foi possível carregar a performance financeira." onRetry={() => void q.refetch()} />;
  const s = q.data.summary;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Performance Financeira</h2><RealBadge /></div>
      <Kpis items={[
        { label: "TPV", value: formatBRL(s.tpv) },
        { label: "Receita", value: formatBRL(s.revenue) },
        { label: "Custos", value: formatBRL(s.cost), hint: s.uncosted ? `${s.uncosted} sem custo configurado` : undefined },
        { label: "Margem", value: formatBRL(s.margin) },
        { label: "Margem %", value: pct(s.marginPct) },
        { label: "Transações", value: num(s.count) },
        { label: "Ticket médio", value: formatBRL(s.ticket) },
        { label: "Margem por R$ 1.000", value: formatBRL(s.marginPer1000) },
      ]} />
    </section>
  );
}

type SortKey = "tpv" | "revenue" | "margin" | "count" | "ticket";

export function AdminUnitEconomics({ f }: { f: AdminFinanceState }) {
  const q = useUE(f);
  const [sort, setSort] = useState<SortKey>("tpv");
  const clients = useMemo(() => [...(q.data?.clients ?? [])].sort((a, b) => b[sort] - a[sort]).slice(0, 20), [q.data, sort]);
  if (q.isLoading) return <div className="space-y-4"><Shimmer className="h-40" /><ChartSkeleton /></div>;
  if (q.error || !q.data) return <ErrorState text="Não foi possível carregar o Unit Economics." onRetry={() => void q.refetch()} />;
  const { summary: s, methods, alerts } = q.data;
  const mix = methods.filter((m) => m.tpv > 0);
  const chartConfig: ChartConfig = { tpv: { label: "TPV", color: "var(--color-primary)" } };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RealBadge />
        <Button size="sm" variant="outline" disabled={!q.data.rows.length} onClick={() => void exportRows(q.data!.rows.map((r) => ({ Data: formatDateTime(r.data), Cliente: r.cliente, Método: r.metodo, Status: r.status, "Valor (TPV)": r.valor, "Taxa Wiize Recebe": r.taxa, "Custo provedor": r.custo ?? "não configurado", Margem: r.margem ?? "" })), "unit-economics", "xlsx")}><Download className="h-3.5 w-3.5" /> Exportar Excel</Button>
      </div>
      <Kpis items={[
        { label: "TPV", value: formatBRL(s.tpv) },
        { label: "Receita bruta Wiize Recebe", value: formatBRL(s.revenue) },
        { label: "Custo de processamento", value: formatBRL(s.cost), hint: s.uncosted ? `${s.uncosted} transações sem custo configurado` : undefined },
        { label: "Margem bruta", value: formatBRL(s.margin) },
        { label: "Margem sobre TPV", value: pct(s.marginPct) },
        { label: "Margem por R$ 1.000", value: formatBRL(s.marginPer1000) },
        { label: "Transações", value: num(s.count) },
        { label: "Ticket médio", value: formatBRL(s.ticket) },
        { label: "Clientes ativos", value: num(s.activeClients) },
        { label: "Receita média por cliente", value: formatBRL(s.revenuePerClient) },
        { label: "TPV médio por cliente", value: formatBRL(s.tpvPerClient) },
        { label: "Margem média por cliente", value: formatBRL(s.marginPerClient) },
      ]} />

      {alerts.length ? (
        <section className="surface-panel p-4">
          <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-warning" />Auditoria financeira</h3>
          <p className="mt-1 text-xs text-muted-foreground">Somente alertas. Nenhum valor é alterado automaticamente.</p>
          <ul className="mt-3 divide-y divide-border">
            {alerts.map((a) => <li key={a.kind} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{a.label}</span><span className="numeric-tabular rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{a.count}</span></li>)}
          </ul>
        </section>
      ) : <div className="surface-panel flex items-center gap-2 p-4 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" />Auditoria financeira sem inconsistências no período.</div>}

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Análise por método de pagamento</h3></div>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Método</TableHead><TableHead className="text-right">TPV</TableHead><TableHead className="text-right">Transações</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem</TableHead><TableHead className="text-right">Margem %</TableHead><TableHead className="text-right">Ticket</TableHead><TableHead className="text-right">% TPV</TableHead></TableRow></TableHeader>
          <TableBody>{methods.map((m) => (
            <TableRow key={m.key} className={m.count ? "" : "text-muted-foreground"}>
              <TableCell className="font-medium">{m.label}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(m.tpv)}</TableCell>
              <TableCell className="numeric-tabular text-right">{num(m.count)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(m.revenue)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(m.cost)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(m.margin)}</TableCell>
              <TableCell className="numeric-tabular text-right">{pct(m.marginPct)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(m.ticket)}</TableCell>
              <TableCell className="numeric-tabular text-right">{pct(m.shareOfTpv)}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table></div>
      </section>

      <section className="surface-panel p-4">
        <h3 className="font-semibold">Mix de TPV</h3>
        {mix.length ? (
          <ChartContainer config={chartConfig} className="mt-4 h-[240px] w-full">
            <BarChart data={mix} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} fontSize={12} />
              <ChartTooltip content={({ payload }) => { const d = payload?.[0]?.payload as (typeof mix)[number] | undefined; return d ? <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md"><p className="font-semibold">{d.label}</p><p>{formatBRL(d.tpv)} · {pct(d.shareOfTpv)}</p><p>{num(d.count)} transações</p></div> : null; }} />
              <Bar dataKey="tpv" fill="var(--color-tpv)" radius={4} />
            </BarChart>
          </ChartContainer>
        ) : <EmptyState title="Sem TPV no período" text="Quando houver pagamentos confirmados, a distribuição aparece aqui." />}
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div><h3 className="font-semibold">Rentabilidade dos clientes</h3><p className="text-xs text-muted-foreground">Valor do cliente para a Wiize: Wiize Recebe + notas fiscais.</p></div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1 text-xs">
            {([["tpv", "TPV"], ["revenue", "Receita"], ["margin", "Margem"], ["count", "Transações"], ["ticket", "Ticket"]] as [SortKey, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSort(k)} className={`rounded-md px-2 py-1 ${sort === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">TPV</TableHead><TableHead className="text-right">Transações</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem</TableHead><TableHead className="text-right">Margem %</TableHead><TableHead className="text-right">Ticket</TableHead><TableHead className="text-right">NF</TableHead><TableHead className="text-right">Receita NF</TableHead><TableHead className="text-right">Receita total</TableHead></TableRow></TableHeader>
          <TableBody>{clients.length ? clients.map((c) => (
            <TableRow key={c.tenantId}>
              <TableCell className="max-w-[180px] truncate font-medium">{c.name}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(c.tpv)}</TableCell>
              <TableCell className="numeric-tabular text-right">{num(c.count)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(c.revenue)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(c.cost)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(c.margin)}</TableCell>
              <TableCell className="numeric-tabular text-right">{pct(c.marginPct)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(c.ticket)}</TableCell>
              <TableCell className="numeric-tabular text-right">{num(c.invoices)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(c.invoiceRevenue)}</TableCell>
              <TableCell className="numeric-tabular text-right font-semibold">{formatBRL(c.ecosystemRevenue)}</TableCell>
            </TableRow>)) : <TableRow><TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente com movimentação no período.</TableCell></TableRow>}
          </TableBody>
        </Table></div>
      </section>
    </div>
  );
}

/* ---------------- Simulador (nunca usa dados reais) ---------------- */

const PRESETS = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000];
const KEYS = Object.keys(MIX_LABELS) as MixKey[];
const DEFAULT_MIX: Record<MixKey, number> = { pix: 40, pix_recurring: 10, boleto: 10, debit_card: 5, credit_1: 15, credit_2_6: 10, credit_7_12: 7, credit_13_21: 3 };

export function AdminTpvSimulator() {
  const cfgFn = useServerFn(getFeeConfiguration);
  const cfg = useQuery({ queryKey: ["fee-config"], queryFn: () => cfgFn() });
  const [tpv, setTpv] = useState(1_000_000);
  const [ticket, setTicket] = useState(500);
  const [mix, setMix] = useState(DEFAULT_MIX);
  const sum = KEYS.reduce((a, k) => a + (mix[k] || 0), 0);
  const valid = Math.abs(sum - 100) < 0.001;
  const res = useMemo(() => {
    if (!cfg.data || !valid) return null;
    const rates = Object.fromEntries(KEYS.map((k) => {
      const t = MIX_TIER[k];
      return [k, { fee: findRate(cfg.data.fees, t.method, t.installments), cost: findRate(cfg.data.costs, t.method, t.installments) }];
    })) as Parameters<typeof simulate>[2];
    return simulate(tpv, mix, rates, ticket);
  }, [cfg.data, valid, tpv, mix, ticket]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"><span className="inline-flex items-center gap-1.5 font-semibold"><FlaskConical className="h-4 w-4" />SIMULAÇÃO</span> — números hipotéticos, calculados com as taxas e custos configurados. Não fazem parte dos dados reais.</div>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="surface-panel space-y-4 p-4">
          <div className="space-y-2"><Label>TPV mensal</Label>
            <div className="flex flex-wrap gap-1.5">{PRESETS.map((v) => <button key={v} type="button" onClick={() => setTpv(v)} className={`rounded-md border px-2 py-1 text-xs ${tpv === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{v >= 1e6 ? `R$ ${v / 1e6} mi` : `R$ ${v / 1e3} mil`}</button>)}</div>
            <Input type="number" min={0} value={tpv} onChange={(e) => setTpv(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-2"><Label>Ticket médio estimado</Label><Input type="number" min={1} value={ticket} onChange={(e) => setTicket(Math.max(1, Number(e.target.value) || 1))} /></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label>Mix por método (%)</Label><span className={`text-xs font-semibold ${valid ? "text-primary" : "text-destructive"}`}>Soma: {pct(sum)}</span></div>
            {KEYS.map((k) => <div key={k} className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{MIX_LABELS[k]}</span><Input type="number" min={0} max={100} className="h-8 w-20 text-right" value={mix[k]} onChange={(e) => setMix({ ...mix, [k]: Math.max(0, Number(e.target.value) || 0) })} /></div>)}
            {!valid ? <p className="text-xs text-destructive">A soma precisa ser exatamente 100%.</p> : null}
          </div>
        </section>
        <section className="space-y-4">
          {!res ? <EmptyState title={valid ? "Carregando taxas…" : "Ajuste o mix para 100%"} text="O resultado aparece assim que o mix estiver válido." /> : (
            <>
              <Kpis items={[
                { label: "Receita mensal", value: formatBRL(res.revenue) },
                { label: "Custo estimado", value: res.costKnown ? formatBRL(res.cost) : "Custo não configurado" },
                { label: "Margem bruta", value: res.costKnown ? formatBRL(res.margin) : "—" },
                { label: "Margem %", value: res.costKnown ? pct(res.marginPct) : "—" },
                { label: "Transações estimadas", value: num(res.transactions) },
                { label: "Receita anual", value: formatBRL(res.annualRevenue) },
                { label: "Margem anual", value: res.costKnown ? formatBRL(res.annualMargin) : "—" },
                { label: "Margem por R$ 1.000", value: res.costKnown && tpv ? formatBRL((res.margin / tpv) * 1000) : "—" },
              ]} />
              <div className="surface-panel overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Método</TableHead><TableHead className="text-right">TPV</TableHead><TableHead className="text-right">Transações</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem</TableHead></TableRow></TableHeader>
                <TableBody>{res.lines.map((l) => <TableRow key={l.key}><TableCell>{l.label}</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(l.volume)}</TableCell><TableCell className="numeric-tabular text-right">{num(l.tx)}</TableCell><TableCell className="numeric-tabular text-right">{formatBRL(l.revenue)}</TableCell><TableCell className="numeric-tabular text-right">{l.cost == null ? "—" : formatBRL(l.cost)}</TableCell><TableCell className="numeric-tabular text-right">{l.margin == null ? "—" : formatBRL(l.margin)}</TableCell></TableRow>)}</TableBody>
              </Table></div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------------- Taxas comerciais e custos do provedor ---------------- */

const METHOD_LABEL: Record<string, string> = { pix: "Pix à vista", pix_recurring: "Pix Automático", boleto: "Boleto", debit_card: "Débito", credit_card: "Crédito" };
const TIERS: { method: string; min: number; max: number }[] = [
  { method: "pix", min: 1, max: 1 }, { method: "pix_recurring", min: 1, max: 1 }, { method: "boleto", min: 1, max: 1 }, { method: "boleto", min: 2, max: 21 }, { method: "debit_card", min: 1, max: 1 },
  { method: "credit_card", min: 1, max: 1 }, { method: "credit_card", min: 2, max: 6 }, { method: "credit_card", min: 7, max: 12 }, { method: "credit_card", min: 13, max: 21 },
];
type Edit = { kind: "commercial_fee" | "provider_cost"; method: string; min: number; max: number; fixed: number; percent: number } | null;

export function AdminFeeSettings() {
  const cfgFn = useServerFn(getFeeConfiguration);
  const save = useServerFn(saveRate);
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["fee-config"], queryFn: () => cfgFn() });
  const [edit, setEdit] = useState<Edit>(null);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => save({ data: { kind: edit!.kind, paymentMethod: edit!.method as "pix", installmentMin: edit!.min, installmentMax: edit!.max, fixed: edit!.fixed, percent: edit!.percent, reason } }),
    onSuccess: () => { toast.success("Nova versão salva. Vale apenas para novas cobranças."); setEdit(null); setReason(""); void qc.invalidateQueries({ queryKey: ["fee-config"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (cfg.isLoading) return <Shimmer className="h-60" />;
  if (cfg.error || !cfg.data) return <ErrorState text="Não foi possível carregar as taxas." onRetry={() => void cfg.refetch()} />;
  const find = (rows: { payment_method: string; installment_min: number; installment_max: number; fixed: number; percent: number }[], t: (typeof TIERS)[number]) => rows.find((r) => r.payment_method === t.method && r.installment_min === t.min && r.installment_max === t.max);
  const fmt = (r?: { fixed: number; percent: number }) => r ? `${formatBRL(r.fixed)} + ${pct(r.percent)}` : "Não configurado";

  return (
    <div className="space-y-6">
      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Taxas comerciais × custo do provedor</h3><p className="text-xs text-muted-foreground">Cada alteração cria uma nova versão com histórico. Transações já criadas mantêm a taxa e o custo da época.</p>{TIERS.some((t) => !find(cfg.data.costs, t)) ? <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">Custos do provedor ainda não informados em {TIERS.filter((t) => !find(cfg.data.costs, t)).length} faixa(s). Clique em "Não configurado" e preencha com os valores do seu contrato. Até lá, a margem usa a tarifa real enviada pelo provedor em cada pagamento, quando disponível.</p> : null}</div>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Método</TableHead><TableHead>Taxa cobrada (Wiize Recebe)</TableHead><TableHead>Custo do provedor</TableHead><TableHead className="text-right">Margem em R$ 1.000</TableHead></TableRow></TableHeader>
          <TableBody>{TIERS.map((t) => {
            const fee = find(cfg.data.fees, t), cost = find(cfg.data.costs, t);
            const label = `${METHOD_LABEL[t.method]}${t.method === "credit_card" || t.method === "boleto" ? ` ${t.min === t.max ? `${t.min}x` : `${t.min}–${t.max}x`}` : ""}`;
            const margin = fee && cost ? (1000 * fee.percent) / 100 + fee.fixed - ((1000 * cost.percent) / 100 + cost.fixed) : null;
            return (
              <TableRow key={`${t.method}-${t.min}`}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell><button type="button" className="inline-flex items-center gap-1.5 hover:text-primary" onClick={() => setEdit({ kind: "commercial_fee", method: t.method, min: t.min, max: t.max, fixed: fee?.fixed ?? 0, percent: fee?.percent ?? 0 })}>{fmt(fee)}<Pencil className="h-3 w-3" /></button></TableCell>
                <TableCell><button type="button" className={`inline-flex items-center gap-1.5 hover:text-primary ${cost ? "" : "text-warning"}`} onClick={() => setEdit({ kind: "provider_cost", method: t.method, min: t.min, max: t.max, fixed: cost?.fixed ?? 0, percent: cost?.percent ?? 0 })}>{fmt(cost)}<Pencil className="h-3 w-3" /></button></TableCell>
                <TableCell className="numeric-tabular text-right">{margin == null ? "—" : formatBRL(margin)}</TableCell>
              </TableRow>
            );
          })}</TableBody>
        </Table></div>
      </section>
      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Histórico de alterações</h3></div>
        <ul className="divide-y divide-border text-sm">
          {cfg.data.log.length ? cfg.data.log.slice(0, 15).map((l) => {
            const prev = l.previous as { fixed?: number; percent?: number } | null, next = l.next as { fixed?: number; percent?: number; key?: string; value?: number };
            return <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"><span>{l.kind === "provider_cost" ? "Custo" : l.kind === "platform_setting" ? "Configuração" : "Taxa"} · {l.payment_method ? METHOD_LABEL[l.payment_method] : next.key ?? "tabela oficial"}{l.installment_min && l.payment_method === "credit_card" ? ` ${l.installment_min}–${l.installment_max}x` : ""}{next.percent != null ? ` · ${prev ? `${pct(prev.percent ?? 0)} + ${formatBRL(prev.fixed ?? 0)} → ` : ""}${pct(next.percent)} + ${formatBRL(next.fixed ?? 0)}` : ""}{l.reason ? <span className="text-muted-foreground"> — {l.reason}</span> : null}</span><span className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span></li>;
          }) : <li className="px-4 py-6 text-center text-muted-foreground">Sem alterações registradas.</li>}
        </ul>
      </section>
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.kind === "provider_cost" ? "Custo do provedor" : "Taxa comercial"} · {edit ? METHOD_LABEL[edit.method] : ""}</DialogTitle></DialogHeader>
          {edit ? <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Percentual (%)</Label><Input type="number" step="0.01" min={0} max={100} value={edit.percent} onChange={(e) => setEdit({ ...edit, percent: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-1.5"><Label>Valor fixo (R$)</Label><Input type="number" step="0.01" min={0} value={edit.fixed} onChange={(e) => setEdit({ ...edit, fixed: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Motivo</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: novo contrato com o provedor" /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Vale somente para novas cobranças. Exige verificação em duas etapas ativa.</p>
          </div> : null}
          <DialogFooter><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={reason.trim().length < 3 || m.isPending} onClick={() => m.mutate()}>Salvar nova versão</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
