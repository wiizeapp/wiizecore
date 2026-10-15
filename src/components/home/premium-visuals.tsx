import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, BarChart3, BatteryFull, Bell, Briefcase, CalendarDays, Check, CheckCircle2, Clock3, CreditCard, Download, FileCheck2, FileText, Filter, Landmark, Lock, Mail, Palette, Phone, Plus, QrCode, Receipt, RefreshCw, Search, Send, ShieldCheck, Signal, Sparkles, Users, TrendingUp, Upload, Wallet, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";

type Icon = typeof Wallet;

function useTr() {
  return useTranslation("ui").t as (v: string) => string;
}

function Window({ title, status, children }: { title: string; status: string; children: ReactNode }) {
  const t = useTr();
  return (
    <div className="feature-demo-window flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-float">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <span className="size-2 rounded-full bg-destructive/70" /><span className="size-2 rounded-full bg-warning/80" /><span className="size-2 rounded-full bg-primary/70" />
        <span className="ml-1 min-w-0 flex-1 truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{t(title)}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[9px] font-bold uppercase text-primary"><span className="size-1.5 animate-pulse rounded-full bg-primary" />{t(status)}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">{children}</div>
    </div>
  );
}

function Summary({ items }: { items: Array<[Icon, string]> }) {
  const t = useTr();
  return <div className="mt-auto grid grid-cols-3 gap-1.5">{items.map(([I, label]) => <div key={label} className="flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-card/80 px-2 text-center text-[9px] font-medium text-muted-foreground sm:text-[10px]"><I className="size-3.5 shrink-0 text-primary" /><span>{t(label)}</span></div>)}</div>;
}

type Tone = "paid" | "pending" | "overdue" | "info";
const toneCls: Record<Tone, string> = { paid: "bg-primary/15 text-primary", pending: "bg-warning/15 text-warning", overdue: "bg-destructive/15 text-destructive", info: "bg-muted text-muted-foreground" };
function Pill({ tone, label }: { tone: Tone; label: string }) {
  const t = useTr();
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${toneCls[tone]}`}><span className="size-1 rounded-full bg-current" />{t(label)}</span>;
}

function Kpi({ label, value, hint, icon: I = Wallet, tone = "text-foreground", featured = false, trend }: { label: string; value: string; hint?: string; icon?: Icon; tone?: string; featured?: boolean; trend?: number[] }) {
  const t = useTr();
  const pts = trend ?? [30, 42, 38, 55, 50, 66, 72];
  const max = Math.max(...pts);
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <div className={`relative min-w-0 overflow-hidden rounded-xl border p-3 ${featured ? "balance-hero border-primary/30" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`truncate text-[9px] font-medium uppercase tracking-wide ${featured ? "opacity-80" : "text-muted-foreground"}`}>{t(label)}</p>
        <span className={`grid size-6 shrink-0 place-items-center rounded-md ${featured ? "bg-primary-foreground/15" : "bg-accent text-primary"}`}><I className="size-3" /></span>
      </div>
      <p className={`numeric-tabular mt-1.5 truncate text-base font-semibold sm:text-lg ${featured ? "" : tone}`}>{value}</p>
      {hint ? <p className={`mt-0.5 flex items-center gap-1 truncate text-[9px] font-medium ${featured ? "opacity-85" : "text-muted-foreground"}`}>{featured ? <TrendingUp className="size-2.5" /> : null}{t(hint)}</p> : null}
      {featured ? <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-6 w-full opacity-90" aria-hidden="true"><polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" className="feature-demo-progress" /></svg> : null}
    </div>
  );
}

/** Moldura igual ao app interno: barra lateral com menu + cabeçalho da página. */
function AppShell({ active, title, subtitle, action, children }: { active: string; title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  const t = useTr();
  const nav: Array<[Icon, string]> = [[BarChart3, "Painel"], [Users, "Clientes"], [Briefcase, "Serviços"], [Receipt, "Cobranças"], [ArrowDownLeft, "Recebimentos"], [Wallet, "Financeiro"]];
  return (
    <div className="feature-demo-window grid h-full w-full grid-cols-1 overflow-hidden rounded-xl border border-border bg-background text-left shadow-float sm:grid-cols-[8rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col gap-1 border-r border-border bg-card p-2.5 sm:flex">
        <div className="mb-2 flex items-center gap-1.5 px-1"><span className="grid size-5 place-items-center rounded-md bg-primary text-[9px] font-bold text-primary-foreground">W</span><span className="text-[10px] font-bold">Wiize Core</span></div>
        {nav.map(([I, l]) => <div key={l} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[9px] font-medium ${l === active ? "bg-accent text-primary" : "text-muted-foreground"}`}><I className="size-3 shrink-0" /><span className="truncate">{t(l)}</span></div>)}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-card/60 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{t(title)}</p><p className="truncate text-[9px] text-muted-foreground">{t(subtitle)}</p></div>
          <span className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-[9px] text-muted-foreground sm:flex"><CalendarDays className="size-3" />{t("Outubro 2026")}</span>
          {action}
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3 sm:p-3.5">{children}</div>
      </div>
    </div>
  );
}

function NewBtn({ label }: { label: string }) {
  const t = useTr();
  return <span className="feature-demo-action flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[9px] font-semibold text-primary-foreground"><Plus className="size-3" />{t(label)}</span>;
}

function Panel({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  const t = useTr();
  return <div className={`min-w-0 rounded-xl border border-border bg-card p-3 ${className}`}><div className="mb-2 flex items-center justify-between gap-2"><p className="truncate text-[10px] font-semibold">{t(title)}</p>{right}</div>{children}</div>;
}

function Row({ i, children }: { i: number; children: ReactNode }) {
  return <div className="feature-demo-row flex items-center gap-2 rounded-md border border-border bg-card p-2" style={{ animationDelay: `${i * 160}ms` }}>{children}</div>;
}

function IconBox({ icon: I, tone = "bg-accent text-primary" }: { icon: Icon; tone?: string }) {
  return <span className={`grid size-7 shrink-0 place-items-center rounded-md ${tone}`}><I className="size-3.5" /></span>;
}

/* ---------- Cobranças ---------- */
export function ChargesPremium() {
  const t = useTr();
  const rows: Array<[string, string, string, string, Tone, string, Icon]> = [
    ["Empresa Horizonte", "Consultoria mensal", "05/10", "R$ 2.500,00", "paid", "Pago", QrCode],
    ["Atlas Consultoria", "Implantação • 2/6", "08/10", "R$ 1.850,00", "pending", "Pendente", CreditCard],
    ["Nexo Digital", "Suporte técnico", "28/09", "R$ 920,00", "overdue", "Vencido", Landmark],
    ["Studio Prisma", "Gestão de redes", "02/10", "R$ 1.400,00", "paid", "Pago", RefreshCw],
    ["Lumen Arquitetura", "Projeto executivo", "12/10", "R$ 3.200,00", "pending", "Pendente", QrCode],
  ];
  return (
    <AppShell active="Cobranças" title="Cobranças" subtitle="Acompanhe cada vencimento" action={<NewBtn label="Nova cobrança" />}>
      <div className="grid grid-cols-3 gap-2"><Kpi label="Recebido" value="R$ 24.320" hint="+18% no mês" featured icon={CheckCircle2} /><Kpi label="Pendente" value="R$ 5.050" tone="text-warning" hint="2 cobranças" icon={Clock3} /><Kpi label="Vencido" value="R$ 920" tone="text-destructive" hint="1 cobrança" icon={CalendarDays} /></div>
      <Panel title="Todas as cobranças" right={<div className="flex gap-1">{["Todas", "Pagas", "Pendentes"].map((x, i) => <span key={x} className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${i === 0 ? "bg-foreground text-background" : "text-muted-foreground"}`}>{t(x)}</span>)}</div>}>
        <div className="mb-2 flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[9px] text-muted-foreground"><Search className="size-3" />{t("Buscar cliente, número ou documento")}<Filter className="ml-auto size-3" /></div>
        <div className="grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_4rem] gap-2 border-b border-border pb-1 text-[8px] font-semibold uppercase text-muted-foreground"><span>{t("Cliente")}</span><span>{t("Venc.")}</span><span className="text-right">{t("Valor")}</span><span className="text-right">{t("Status")}</span></div>
        {rows.map(([c, sv, d, v, tone, l, I], i) => <div key={c} className="feature-demo-row grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_4rem] items-center gap-2 border-b border-border/60 py-1.5 last:border-0" style={{ animationDelay: `${i * 140}ms` }}><div className="flex min-w-0 items-center gap-2"><IconBox icon={I} /><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{c}</p><p className="truncate text-[8px] text-muted-foreground">{t(sv)}</p></div></div><span className="text-[9px] text-muted-foreground">{d}</span><span className="numeric-tabular text-right text-[10px] font-semibold">{v}</span><span className="justify-self-end"><Pill tone={tone} label={l} /></span></div>)}
      </Panel>
    </AppShell>
  );
}

/* ---------- Recebimentos ---------- */
export function ReceivablesPremium() {
  const t = useTr();
  const days = [{ d: "Hoje", h: 55 }, { d: "11/10", h: 35 }, { d: "15/10", h: 72 }, { d: "20/10", h: 44 }, { d: "25/10", h: 60 }, { d: "30/10", h: 90 }];
  return (
    <AppShell active="Recebimentos" title="Recebimentos" subtitle="O que entrou e o que ainda vai entrar">
      <div className="grid grid-cols-3 gap-2"><Kpi label="Disponível" value="R$ 24.320" hint="Pronto para saque" featured icon={Wallet} trend={[20, 28, 26, 40, 46, 58, 70]} /><Kpi label="A receber" value="R$ 7.800" hint="Próximos 30 dias" icon={CalendarDays} /><Kpi label="Em atraso" value="R$ 920" tone="text-destructive" hint="1 cliente" icon={Clock3} /></div>
      <div className="grid gap-2.5 sm:grid-cols-[1.25fr_1fr]">
        <Panel title="Previsão de liberação" right={<span className="text-[9px] font-semibold text-primary">R$ 12.950</span>}>
          <div className="flex h-24 items-end gap-1.5">{days.map((x, i) => <div key={x.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><div className="feature-demo-row w-full rounded-md bg-gradient-to-t from-primary/30 to-primary" style={{ height: `${x.h}%`, animationDelay: `${i * 120}ms` }} /><span className="text-[7px] text-muted-foreground">{t(x.d)}</span></div>)}</div>
        </Panel>
        <Panel title="Por forma de pagamento">
          <div className="space-y-2">{([[QrCode, "Pix", 62], [CreditCard, "Cartão", 26], [Landmark, "Boleto", 12]] as Array<[Icon, string, number]>).map(([I, l, p]) => <div key={l}><div className="flex items-center justify-between text-[9px]"><span className="flex items-center gap-1.5"><I className="size-3 text-primary" />{t(l)}</span><span className="numeric-tabular font-semibold">{p}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${p}%` }}><div className="feature-demo-progress h-full rounded-full bg-primary" /></div></div></div>)}</div>
        </Panel>
      </div>
      <Panel title="Últimos recebimentos">
        {([[QrCode, "Empresa Horizonte", "Pix • agora", "+ R$ 2.500,00"], [Landmark, "Studio Prisma", "Boleto • ontem", "+ R$ 1.400,00"]] as Array<[Icon, string, string, string]>).map(([I, c, w, v], i) => <div key={c} className="feature-demo-row flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0" style={{ animationDelay: `${i * 160}ms` }}><IconBox icon={I} /><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{c}</p><p className="text-[8px] text-muted-foreground">{t(w)}</p></div><span className="numeric-tabular text-[10px] font-semibold text-primary">{v}</span><CheckCircle2 className="size-3 text-primary" /></div>)}
      </Panel>
    </AppShell>
  );
}

/* ---------- Financeiro ---------- */
export function FinancePremium() {
  const t = useTr();
  const bars = [[42, 18], [58, 22], [50, 30], [66, 20], [61, 26], [78, 24], [72, 28], [88, 21]];
  return (
    <AppShell active="Financeiro" title="Gestão financeira" subtitle="Entradas, saídas e saldo" action={<NewBtn label="Lançamento" />}>
      <div className="grid grid-cols-3 gap-2"><Kpi label="Saldo" value="R$ 18.640" hint="+R$ 2.500 hoje" featured icon={Wallet} /><Kpi label="Entradas" value="R$ 24.320" tone="text-primary" hint="32 lançamentos" icon={ArrowDownLeft} /><Kpi label="Saídas" value="R$ 5.680" hint="11 lançamentos" icon={ArrowUpRight} /></div>
      <div className="grid gap-2.5 sm:grid-cols-[1.4fr_1fr]">
        <Panel title="Fluxo de caixa" right={<span className="flex gap-2 text-[8px] text-muted-foreground"><span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" />{t("Entradas")}</span><span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-muted-foreground/50" />{t("Saídas")}</span></span>}>
          <div className="flex h-24 items-end gap-1.5 border-b border-border">{bars.map(([a, b], i) => <div key={i} className="flex h-full flex-1 items-end gap-0.5"><span className="feature-demo-row flex-1 rounded-t-sm bg-gradient-to-t from-primary/50 to-primary" style={{ height: `${a}%`, animationDelay: `${i * 90}ms` }} /><span className="feature-demo-row flex-1 rounded-t-sm bg-muted-foreground/35" style={{ height: `${b}%`, animationDelay: `${i * 90 + 40}ms` }} /></div>)}</div>
        </Panel>
        <Panel title="Por categoria">
          <div className="flex items-center gap-3"><div className="relative size-16 shrink-0 rounded-full" style={{ background: "conic-gradient(var(--primary) 0 68%, color-mix(in oklab, var(--primary) 45%, transparent) 68% 90%, var(--muted) 90% 100%)" }}><div className="absolute inset-2.5 grid place-items-center rounded-full bg-card text-[9px] font-bold">68%</div></div><div className="space-y-1.5 text-[9px]">{[["Serviços", "68%"], ["Recorrências", "22%"], ["Outros", "10%"]].map(([c, p]) => <div key={c} className="flex gap-2"><span className="text-muted-foreground">{t(c as string)}</span><span className="ml-auto font-semibold">{p}</span></div>)}</div></div>
        </Panel>
      </div>
      <Panel title="Últimas movimentações">
        {([[ArrowDownLeft, "Recebimento • Empresa Horizonte", "Serviços", "+ R$ 2.500,00", true], [ArrowUpRight, "Software e ferramentas", "Despesas fixas", "− R$ 320,00", false]] as Array<[Icon, string, string, string, boolean]>).map(([I, l, c, v, inflow], i) => <div key={l} className="feature-demo-row flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0" style={{ animationDelay: `${i * 160}ms` }}><IconBox icon={I} tone={inflow ? "bg-accent text-primary" : "bg-muted text-muted-foreground"} /><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{t(l)}</p><p className="text-[8px] text-muted-foreground">{t(c)}</p></div><span className={`numeric-tabular text-[10px] font-semibold ${inflow ? "text-primary" : ""}`}>{v}</span></div>)}
      </Panel>
    </AppShell>
  );
}

/* ---------- Clientes ---------- */
export function ClientsPremium() {
  const t = useTr();
  return (
    <AppShell active="Clientes" title="Empresa Horizonte Ltda." subtitle="Cliente desde março de 2024">
      <div className="balance-hero flex items-center gap-3 rounded-xl border border-primary/30 p-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-sm font-bold">EH</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Empresa Horizonte Ltda.</p><div className="mt-0.5 flex flex-wrap gap-x-3 text-[9px] opacity-80"><span className="flex items-center gap-1"><Mail className="size-3" />financeiro@horizonte.com.br</span><span className="flex items-center gap-1"><Phone className="size-3" />(11) 98765-4321</span></div></div><span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[9px] font-semibold">{t("Em dia")}</span></div>
      <div className="grid grid-cols-3 gap-2"><Kpi label="Total pago" value="R$ 15.000" icon={CheckCircle2} tone="text-primary" hint="7 cobranças" /><Kpi label="Em aberto" value="R$ 2.500" tone="text-warning" hint="Vence 15/10" icon={Clock3} /><Kpi label="Contratos" value="1 ativo" hint="Assinado" icon={FileCheck2} /></div>
      <Panel title="Linha do tempo" right={<div className="flex gap-1">{["Tudo", "Cobranças", "Contratos"].map((x, i) => <span key={x} className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${i === 0 ? "bg-foreground text-background" : "text-muted-foreground"}`}>{t(x)}</span>)}</div>}>
        <div className="relative space-y-2 pl-4 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-border">
          {([[CheckCircle2, "Cobrança de setembro paga via Pix", "Hoje, 10:18", "+ R$ 2.500,00"], [FileCheck2, "Contrato de prestação assinado", "02/10, 16:40", ""], [FileText, "Nota fiscal emitida", "02/10, 16:42", ""], [Send, "Lembrete enviado por e-mail", "01/10, 09:00", ""]] as Array<[Icon, string, string, string]>).map(([I, l, w, v], i) => <div key={l} className="feature-demo-row relative flex items-center gap-2" style={{ animationDelay: `${i * 160}ms` }}><span className="absolute -left-4 top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" /><IconBox icon={I} /><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{t(l)}</p><p className="text-[8px] text-muted-foreground">{w}</p></div>{v ? <span className="numeric-tabular text-[10px] font-semibold text-primary">{v}</span> : null}</div>)}
        </div>
      </Panel>
    </AppShell>
  );
}

/* ---------- Serviços ---------- */
export function ServicesPremium() {
  const t = useTr();
  const items: Array<[string, string, string, number, number]> = [
    ["Consultoria mensal", "Valor fixo", "R$ 2.500,00", 18, 86],
    ["Implantação de sistema", "Valor fixo", "R$ 5.400,00", 6, 58],
    ["Projeto sob medida", "Personalizado", "~ R$ 3.180,00", 9, 70],
    ["Suporte técnico", "Valor fixo", "R$ 920,00", 24, 64],
  ];
  return (
    <AppShell active="Serviços" title="Serviços" subtitle="O que sua empresa vende" action={<NewBtn label="Novo serviço" />}>
      <div className="flex items-center gap-1.5">
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[9px] text-muted-foreground"><Search className="size-3" />{t("Buscar serviço")}</div>
        {[["Ativos", "4", true], ["Personalizados", "1", false], ["Arquivados", "2", false]].map(([l, n, on]) => <span key={l as string} className={`flex h-7 items-center gap-1 rounded-md px-2 text-[9px] font-medium ${on ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground"}`}>{t(l as string)}<span className="numeric-tabular opacity-70">{n}</span></span>)}
      </div>
      <div className="feature-demo-row rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-[10px] font-semibold"><Sparkles className="size-3.5 text-primary" />{t("Projeto sob medida")}</p><span className="rounded-full bg-success/15 px-2 py-0.5 text-[8px] font-semibold text-success">{t("Ativo")}</span></div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">{([["Tipo de valor", "Personalizado"], ["Valor", "Definido na cobrança"], ["Ticket médio", "~ R$ 3.180"]] as Array<[string, string]>).map(([l, v]) => <div key={l} className="rounded-md border border-border bg-card px-2 py-1.5"><p className="text-[8px] text-muted-foreground">{t(l)}</p><p className="truncate text-[9px] font-semibold">{t(v)}</p></div>)}</div>
        <div className="mt-2 flex gap-1.5 text-[8px] font-medium">{[["Editar", FileText], ["Desativar", Lock], ["Arquivar", Download]].map(([l, I]) => { const Icon = I as typeof FileText; return <span key={l as string} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-muted-foreground"><Icon className="size-2.5" />{t(l as string)}</span>; })}</div>
      </div>
      <Panel title="Seus serviços" right={<span className="text-[9px] text-muted-foreground">{t("4 ativos")}</span>}>
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] gap-2 border-b border-border pb-1 text-[8px] font-semibold uppercase text-muted-foreground"><span>{t("Serviço")}</span><span className="text-right">{t("Valor")}</span><span className="text-right">{t("Vendas")}</span></div>
        {items.map(([n, type, price, sales, p], i) => <div key={n} className="feature-demo-row border-b border-border/60 py-1.5 last:border-0" style={{ animationDelay: `${i * 150}ms` }}><div className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] items-center gap-2"><div className="flex min-w-0 items-center gap-2"><IconBox icon={type === "Personalizado" ? Sparkles : Briefcase} /><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{t(n)}</p><span className={`text-[8px] font-semibold ${type === "Personalizado" ? "text-warning" : "text-primary"}`}>{t(type)}</span></div></div><span className="numeric-tabular text-right text-[10px] font-semibold">{price}</span><span className="numeric-tabular text-right text-[10px] text-muted-foreground">{sales}</span></div><div className="ml-9 mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${p}%` }}><div className="feature-demo-progress h-full rounded-full bg-primary" /></div></div></div>)}
      </Panel>
    </AppShell>
  );
}

/* ---------- Checkout ---------- */
export function CheckoutPremium() {
  const t = useTr();
  const swatches = ["bg-primary", "bg-foreground", "bg-warning", "bg-destructive"];
  return (
    <Window title="Checkout personalizado" status="Publicado">
      <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold"><Palette className="size-3.5 text-primary" />{t("Aparência")}</p>
          <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-card p-2"><span className="grid size-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">H</span><div className="min-w-0"><p className="truncate text-[10px] font-semibold">logo-horizonte.png</p><p className="flex items-center gap-1 text-[8px] text-muted-foreground"><Upload className="size-2.5" />{t("Logo enviada")}</p></div></div>
          <p className="text-[9px] text-muted-foreground">{t("Cor principal")}</p>
          <div className="flex gap-1.5">{swatches.map((s, i) => <span key={s} className={`size-6 rounded-md ${s} ${i === 0 ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`} />)}</div>
          <p className="text-[9px] text-muted-foreground">{t("Formas aceitas")}</p>
          <div className="space-y-1">{["Pix", "Boleto", "Cartão de crédito"].map((m) => <div key={m} className="flex items-center justify-between rounded border border-border bg-card px-2 py-1 text-[9px]"><span>{t(m)}</span><span className="grid size-3.5 place-items-center rounded-sm bg-primary text-primary-foreground"><Check className="size-2.5" /></span></div>)}</div>
        </div>
        <div className="feature-demo-row overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex items-center gap-2 bg-primary px-3 py-2.5 text-primary-foreground"><span className="grid size-6 place-items-center rounded bg-primary-foreground/20 text-[10px] font-bold">H</span><span className="text-[11px] font-semibold">Horizonte Consultoria</span><Lock className="ml-auto size-3 opacity-80" /></div>
          <div className="space-y-2.5 p-3">
            <div><p className="text-[9px] text-muted-foreground">{t("Consultoria mensal • Outubro")}</p><p className="numeric-tabular text-xl font-semibold">R$ 2.500,00</p><p className="flex items-center gap-1 text-[9px] text-muted-foreground"><CalendarDays className="size-3" />{t("Vence em 15/10")}</p></div>
            <div className="grid grid-cols-3 gap-1.5">{([[QrCode, "Pix"], [Landmark, "Boleto"], [CreditCard, "Cartão"]] as Array<[Icon, string]>).map(([I, l], i) => <div key={l} className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[9px] font-medium ${i === 0 ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}><I className="size-4" />{t(l)}</div>)}</div>
            <div className="feature-demo-action flex items-center justify-center gap-2 rounded-md bg-primary py-2 text-[11px] font-semibold text-primary-foreground"><QrCode className="size-3.5" />{t("Gerar Pix")}</div>
            <p className="flex items-center justify-center gap-1 text-[8px] text-muted-foreground"><ShieldCheck className="size-3 text-primary" />{t("Pagamento protegido")}</p>
          </div>
        </div>
      </div>
      <Summary items={[[Palette, "Sua marca"], [Send, "Um link por cobrança"], [ShieldCheck, "Ambiente seguro"]]} />
    </Window>
  );
}

/* ---------- Nota fiscal ---------- */
export function InvoicesPremium() {
  const t = useTr();
  const rows: Array<[string, string, string, Tone, string]> = [
    ["NFS-e 0412", "Empresa Horizonte", "R$ 2.500,00", "paid", "Emitida"],
    ["NFS-e 0411", "Studio Prisma", "R$ 1.400,00", "paid", "Emitida"],
    ["NFS-e 0410", "Atlas Consultoria", "R$ 1.850,00", "pending", "Processando"],
  ];
  return (
    <Window title="Notas fiscais" status="Sincronizado">
      <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
        <div className="feature-demo-row rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between border-b border-border pb-2"><div className="flex items-center gap-2"><IconBox icon={FileText} /><div><p className="text-xs font-semibold">NFS-e nº 0412</p><p className="text-[9px] text-muted-foreground">{t("Gerada da cobrança #0248")}</p></div></div><Pill tone="paid" label="Emitida" /></div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px]">{([["Tomador", "Empresa Horizonte"], ["Serviço", "Consultoria mensal"], ["Valor", "R$ 2.500,00"], ["Emissão", "02/10/2026"]] as Array<[string, string]>).map(([l, v]) => <div key={l} className="rounded border border-border bg-card px-2 py-1"><p className="text-muted-foreground">{t(l)}</p><p className="truncate font-semibold">{t(v)}</p></div>)}</div>
          <div className="mt-2 flex gap-1.5"><span className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card py-1.5 text-[9px] font-medium"><Download className="size-3" />PDF</span><span className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card py-1.5 text-[9px] font-medium"><Download className="size-3" />XML</span><span className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[9px] font-semibold text-primary-foreground"><Send className="size-3" />{t("Enviar")}</span></div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3"><p className="text-[9px] font-semibold uppercase text-muted-foreground">{t("Andamento")}</p><div className="mt-2 space-y-2">{["Cobrança paga", "Nota gerada", "Lançada no financeiro"].map((s, i) => <div key={s} className="feature-demo-row flex items-center gap-2 text-[10px]" style={{ animationDelay: `${i * 220}ms` }}><span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>{t(s)}</div>)}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="feature-demo-progress h-full rounded-full bg-primary" /></div></div>
      </div>
      <div className="grid gap-1.5">{rows.map(([n, c, v, tone, l], i) => <Row key={n} i={i}><IconBox icon={FileText} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{n}</p><p className="truncate text-[10px] text-muted-foreground">{c}</p></div><span className="numeric-tabular text-xs font-semibold">{v}</span><Pill tone={tone} label={l} /></Row>)}</div>
      <Summary items={[[Receipt, "Da cobrança"], [FileCheck2, "Status de cada nota"], [Wallet, "Ligada ao financeiro"]]} />
    </Window>
  );
}

/* ---------- Portal do cliente ---------- */
export function PortalPremium({ scene = 1 }: { scene?: 1 | 2 | 3 | 4 }) {
  const t = useTr();
  const tabs: Array<[Icon, string]> = [[Wallet, "Cobranças"], [Receipt, "Recibos"], [FileCheck2, "Contratos"], [FileText, "Documentos"]];
  const active = scene === 1 ? 0 : scene - 1;
  const titles = ["Portal do cliente", "Recibos do cliente", "Contratos assinados", "Documentos do cliente"];
  return (
    <Window title={titles[scene - 1] ?? "Portal do cliente"} status="Acesso seguro">
      <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[0.75fr_1.25fr]">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">MS</span><div className="min-w-0"><p className="truncate text-[11px] font-semibold">Maria Souza</p><p className="truncate text-[9px] text-muted-foreground">{t("Cliente desde 2025")}</p></div></div>
          <div className="rounded-md border border-border bg-card p-2"><p className="text-[9px] text-muted-foreground">{t("Total pago")}</p><p className="numeric-tabular text-base font-semibold text-primary">R$ 7.500,00</p></div>
          <div className="space-y-1">{tabs.map(([I, l], i) => <div key={l} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-medium ${i === active ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><I className="size-3.5" />{t(l)}</div>)}</div>
          <p className="mt-auto flex items-center gap-1 text-[8px] text-muted-foreground"><Lock className="size-3 text-primary" />{t("Entrou com e-mail e CPF")}</p>
        </div>
        <div className="feature-demo-row flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-background p-3">
          {scene === 1 ? <>
            <div className="rounded-md border border-primary/40 bg-accent p-3"><p className="text-[9px] font-semibold uppercase text-primary">{t("Próxima cobrança")}</p><div className="mt-1 flex items-end justify-between gap-2"><div><p className="numeric-tabular text-lg font-semibold">R$ 2.500,00</p><p className="flex items-center gap-1 text-[9px] text-muted-foreground"><CalendarDays className="size-3" />{t("Vence em 15/10")}</p></div><span className="feature-demo-action flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground"><QrCode className="size-3" />{t("Pagar")}</span></div></div>
            {([["Consultoria • Setembro", "R$ 2.500,00"], ["Consultoria • Agosto", "R$ 2.500,00"]] as const).map(([d, v]) => <div key={d} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2"><div className="min-w-0"><p className="truncate text-[10px] font-medium">{t(d)}</p><p className="numeric-tabular text-[9px] text-muted-foreground">{v}</p></div><Pill tone="paid" label="Pago" /></div>)}
            <div className="grid grid-cols-2 gap-1.5"><div className="flex items-center gap-1.5 rounded-md border border-border bg-card p-2 text-[9px]"><Receipt className="size-3.5 text-primary" />{t("3 recibos")}</div><div className="flex items-center gap-1.5 rounded-md border border-border bg-card p-2 text-[9px]"><FileCheck2 className="size-3.5 text-primary" />{t("1 contrato")}</div></div>
          </> : null}
          {scene === 2 ? <>
            {([["Recibo nº 7E5C", "02/10", "R$ 2.500,00"], ["Recibo nº 6A1B", "02/09", "R$ 2.500,00"], ["Recibo nº 59F0", "02/08", "R$ 2.500,00"]] as const).map(([n, d, v], i) => <div key={n} className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${i === 0 ? "border-primary/40 bg-accent" : "border-border bg-card"}`}><span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-primary"><Receipt className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{t(n)}</p><p className="text-[9px] text-muted-foreground">{t("Pago em")} {d} • <span className="numeric-tabular">{v}</span></p></div><span className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[9px] font-medium"><Download className="size-3 text-primary" />PDF</span></div>)}
            <div className="mt-auto rounded-md border border-dashed border-border bg-card p-2 text-[9px] text-muted-foreground"><p className="font-semibold text-foreground">{t("Recebemos de Maria Souza")}</p><p>CPF 123.***.***-00 • {t("Consultoria")}</p></div>
          </> : null}
          {scene === 3 ? <>
            <div className="rounded-md border border-border bg-card p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold">{t("Contrato de consultoria")}</p><Pill tone="paid" label="Assinado" /></div><div className="mt-2 space-y-1">{[90, 75, 82, 60].map((w) => <span key={w} className="block h-1.5 rounded-full bg-muted" style={{ width: `${w}%` }} />)}</div><div className="mt-3 flex items-center gap-2 border-t border-border pt-2"><FileCheck2 className="size-3.5 text-primary" /><p className="text-[9px] text-muted-foreground">{t("Assinado em 12/08, 10:18")}</p></div></div>
            {([["Versão 2", "Atual"], ["Versão 1", "Anterior"]] as const).map(([v, s], i) => <div key={v} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2"><div className="flex items-center gap-2"><FileText className="size-3.5 text-primary" /><p className="text-[10px] font-medium">{t(v)} <span className="text-muted-foreground">• {t(s)}</span></p></div><span className={`flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "border border-border"}`}><Download className="size-3" />{t("Baixar")}</span></div>)}
          </> : null}
          {scene === 4 ? <>
            <p className="text-[10px] font-semibold">{t("Arquivos enviados pela empresa")}</p>
            {([["Manual de boas-vindas", "Abrir manual"], ["Relatório trimestral", "Baixar relatório"], ["Nota técnica", "Ver documento"]] as const).map(([d, b], i) => <div key={d} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-primary"><FileText className="size-3.5" /></span><p className="min-w-0 flex-1 truncate text-[10px] font-medium">{t(d)}</p><span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}>{t(b)}</span></div>)}
            <p className="mt-auto flex items-center gap-1 text-[8px] text-muted-foreground"><ShieldCheck className="size-3 text-primary" />{t("Guardados no Google Drive da empresa")}</p>
          </> : null}
        </div>
      </div>
      <Summary items={[[Receipt, "Recibos na hora"], [FileCheck2, "Contratos e versões"], [Phone, "Feito para celular"]]} />
    </Window>
  );
}

/* Portal no celular: cliente resolvendo sozinho (pagar, baixar, abrir). */
export function PortalPhonePremium() {
  const t = useTr();
  const activity: Array<[Icon, string, string, boolean]> = [
    [CheckCircle2, "Pagou a próxima cobrança", "Hoje, 09:12", true],
    [Download, "Baixou o recibo em PDF", "Hoje, 09:13", false],
    [FileText, "Abriu a nota fiscal", "Hoje, 09:14", false],
  ];
  const tiles: Array<[Icon, string, string]> = [
    [Receipt, "Recibos", "3"], [FileText, "Notas", "3"],
    [FileCheck2, "Contratos", "1"], [Upload, "Documentos", "2"],
  ];
  return (
    <div className="flex h-full w-full items-stretch justify-center gap-6 sm:gap-10">
      <div className="hidden w-56 shrink-0 self-center sm:block">
        <div className="rounded-2xl border border-border bg-card/85 p-4 shadow-float backdrop-blur-xl">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Sparkles className="size-3 text-primary" />{t("Atividade do cliente")}</p>
          <div className="relative mt-4 space-y-4">
            <span className="absolute bottom-2 left-[0.72rem] top-2 w-px bg-border" aria-hidden="true" />
            {activity.map(([I, l, h, done]) => (
              <div key={l} className="relative flex items-start gap-2.5">
                <span className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full ${done ? "bg-primary text-primary-foreground" : "border border-border bg-card text-primary"}`}><I className="size-3" /></span>
                <div className="min-w-0 pt-0.5">
                  <p className="truncate text-[11px] font-semibold leading-tight">{t(l)}</p>
                  <p className="text-[9px] text-muted-foreground">{t(h)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-background p-2 text-[9px] text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0 text-primary" />{t("Tudo registrado com segurança")}</div>
        </div>
      </div>
      <div className="relative w-60 shrink-0 sm:w-64">
        <div className="absolute -inset-x-8 -inset-y-4 rounded-[3rem] bg-primary/15 blur-2xl" aria-hidden="true" />
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2.25rem] border-[6px] border-border bg-background text-left shadow-float">
          <div className="flex items-center justify-between px-5 pt-2 text-[9px] font-semibold text-muted-foreground"><span>9:41</span><span className="flex items-center gap-1"><Signal className="size-2.5" /><Wifi className="size-2.5" /><BatteryFull className="size-3.5" /></span></div>
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-primary-foreground">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-foreground/20 text-[10px] font-bold">SE</span>
            <div className="min-w-0"><p className="truncate text-[11px] font-semibold">{t("Sua Empresa")}</p><p className="flex items-center gap-1 text-[8px] opacity-80"><Lock className="size-2.5" />{t("Acesso seguro")}</p></div>
            <Bell className="ml-auto size-3.5 opacity-80" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">{t("Olá, Maria")}</p>
            <div className="rounded-xl border border-primary/40 bg-accent p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-primary">{t("Próxima cobrança")}</p>
              <div className="mt-0.5 flex items-end justify-between gap-2">
                <div><p className="numeric-tabular text-xl font-semibold leading-tight">R$ 890,00</p><p className="text-[9px] text-muted-foreground">{t("Vence em 12/10")}</p></div>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><QrCode className="size-4" /></span>
              </div>
              <div className="feature-demo-action mt-2.5 flex items-center justify-center gap-1 rounded-lg bg-primary py-2 text-[10px] font-semibold text-primary-foreground"><QrCode className="size-3" />{t("Pagar com Pix")}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tiles.map(([I, l, n]) => <div key={l} className="rounded-xl border border-border bg-card p-2.5"><span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary"><I className="size-3" /></span><p className="mt-1.5 text-[10px] font-semibold">{t(l)}</p><p className="text-[8px] text-muted-foreground">{n} {t(n === "1" ? "item" : "itens")}</p></div>)}
            </div>
            <p className="mt-auto flex items-center justify-center gap-1 text-[8px] text-muted-foreground"><ShieldCheck className="size-3 text-primary" />{t("Sessão protegida • expira em 30 min")}</p>
          </div>
          <div className="mx-auto mb-1.5 h-1 w-20 shrink-0 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
