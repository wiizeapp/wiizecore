import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Archive, CalendarDays, Check, FolderTree, Landmark, Pencil, Plus, RotateCcw, Search, Settings2, Sparkles, Trash2, Wallet } from "lucide-react";
import { createAccount, createCategory, createEntry, getGestao, setEntryStatus, suggestEntry, updateAccount, updateCategory } from "@/lib/gestao.functions";
import { cancelEntry, createTransfer, getAccountStatement, moveAndDeleteCategory, seedSuggestedCategories, setAccountArchived, setCategoryFlags } from "@/lib/finance-ops.functions";
import { CardsSection } from "@/components/finance/cards-section";
import { formatBRL, formatDate } from "@/lib/format";
import { DataPagination, paginate, PageHeader, SummaryStrip, StatusBadge, EmptyState, ErrorState, TableRowsSkeleton, TableStateRow } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/financas")({
  head: () => ({
    meta: [
      { title: "Gestão financeira — Wiize Recebe" },
      { name: "description", content: "Organize entradas, saídas, contas e cartões da sua empresa de forma simples." },
      { property: "og:title", content: "Gestão financeira — Wiize Recebe" },
      { property: "og:description", content: "Entradas, saídas e contas da empresa em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GestaoPage,
});

type Dir = "in" | "out";
type Entry = { id: string; auto: boolean; direction: Dir; amount: number; description: string; category_id: string | null; account_id: string | null; due_on: string; paid_on: string | null; status: string; notes: string | null; cost_center: string | null; group_kind: string | null; group_index: number | null; group_total: number | null; transfer_id?: string | null; card_invoice_id?: string | null };
type Category = { id: string; name: string; direction: Dir; tenant_id: string | null; parent_id: string | null; archived?: boolean; is_default?: boolean; level?: number };
type Account = { id: string; name: string; kind: string; opening_balance: number; balance: number; institution_code: string; archived: boolean };
type Period = "today" | "yesterday" | "month" | "30d" | "90d" | "custom";
const ACCOUNT_KIND: Record<string, string> = { bank: "Banco", cash: "Dinheiro", wallet: "Carteira", credit_card: "Cartão de crédito" };
const STATUS_LABEL = (e: Pick<Entry, "status" | "direction" | "due_on">) => {
  if (e.status === "paid") return [e.direction === "in" ? "Recebido" : "Pago", "success"] as const;
  if (e.status === "reversed") return ["Estornado", "neutral"] as const;
  if (e.status === "cancelled") return ["Cancelado", "neutral"] as const;
  if (e.status === "scheduled") return ["Agendado", "neutral"] as const;
  if (e.due_on < todayStr()) return ["Vencido", "danger"] as const;
  return [e.direction === "in" ? "A receber" : "A pagar", "warning"] as const;
};
const todayStr = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dateStr = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function periodRange(period: Period, custom?: DateRange) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  if (period === "yesterday") return { from: dateStr(shift(-1)), to: dateStr(shift(-1)) };
  if (period === "30d") return { from: dateStr(shift(-29)), to: dateStr(today) };
  if (period === "90d") return { from: dateStr(shift(-89)), to: dateStr(today) };
  if (period === "custom" && custom?.from) return { from: dateStr(custom.from), to: dateStr(custom.to ?? custom.from) };
  if (period === "month") return { from: dateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  return { from: dateStr(today), to: dateStr(today) };
}

function GestaoPage() {
  const { t: ui } = useTranslation("ui");
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const { from, to } = useMemo(() => periodRange(period, customRange), [period, customRange]);
  const fetchFn = useServerFn(getGestao);
  const q = useQuery({ queryKey: ["gestao", from], queryFn: () => fetchFn({ data: { from, to } }) });
  const [newDir, setNewDir] = useState<Dir | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | Dir>("all");
  const [status, setStatus] = useState<"all" | "paid" | "pending" | "overdue" | "cancelled" | "reversed">("all");
  const [transferOpen, setTransferOpen] = useState(false);
  const [statement, setStatement] = useState<Account | null>(null);
  const [account, setAccount] = useState("all");
  const [page, setPage] = useState(0);

  const d = q.data;
  const categories = (d?.categories ?? []) as Category[];
  const catName = useMemo(() => {
    const all = (d?.categories ?? []) as Category[];
    const names = new Map(all.map((c) => [c.id, c.name]));
    return new Map(all.map((c) => [c.id, c.parent_id ? `${names.get(c.parent_id) ?? "Categoria"} / ${c.name}` : c.name]));
  }, [d]);
  const accName = useMemo(() => new Map<string, string>([["wiizepay", "Saldo Wiize Recebe"], ...(d?.accounts ?? []).map((a: any) => [a.id, a.name] as [string, string])]), [d]);
  const entries = (d?.entries ?? []) as Entry[];
  const filtered = entries.filter((e) =>
    (type === "all" || e.direction === type) && (status === "all" || (status === "overdue" ? e.status === "pending" && e.due_on < todayStr() : status === "pending" ? e.status === "pending" && e.due_on >= todayStr() : e.status === status)) && (account === "all" || e.account_id === account)
    && (!search || e.description.toLowerCase().includes(search.toLowerCase())));
  // Transferências só mudam saldos entre contas: não são receita nem despesa.
  const paid = entries.filter((e) => e.status === "paid" && !e.transfer_id);
  const totIn = paid.filter((e) => e.direction === "in").reduce((s, e) => s + e.amount, 0);
  const totOut = paid.filter((e) => e.direction === "out").reduce((s, e) => s + e.amount, 0);
  const firstAccess = d && d.accounts.length === 0 && entries.every((e) => e.auto);
  useEffect(() => setPage(0), [period, from, to, search, type, status, account]);

  return (
    <div>
      <PageHeader title={ui("Gestão financeira")} description="Tudo o que entra e sai da sua empresa, de forma simples."
        action={d?.canWrite ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setRegistryOpen(true)}><Settings2 className="h-4 w-4" /> Cadastros</Button><Button variant="outline" disabled={(d.accounts as Account[]).filter((a) => !a.archived).length < 2} onClick={() => setTransferOpen(true)}><ArrowLeftRight className="h-4 w-4" /> Transferir</Button><Button className="w-full sm:w-auto" disabled={!d.canCreateEntries} onClick={() => setNewDir("out")}><Plus className="h-4 w-4" /> Nova movimentação</Button></div> : undefined} />

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:flex sm:w-fit sm:flex-wrap">
        {([['today', ui("Hoje")], ['yesterday', ui("Ontem")], ['month', 'Mês'], ['30d', ui("Últimos 30 dias")], ['90d', ui("Últimos 90 dias")]] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={period === key ? "default" : "ghost"} className="min-w-0 text-xs" onClick={() => setPeriod(key)}>{label}</Button>
        ))}
        <PeriodPicker active={period === "custom"} value={customRange} onChange={(range) => { setCustomRange(range); if (range?.from) setPeriod("custom"); }} />
      </div>

      <SummaryStrip cols={5} items={[
        { label: "Entradas", value: d ? formatBRL(totIn) : null },
        { label: "Saídas", value: d ? formatBRL(totOut) : null },
        { label: "Resultado", value: d ? formatBRL(totIn - totOut) : null, accent: totIn - totOut >= 0 },
        { label: "A pagar", value: d ? formatBRL(d.pendingOut) : null },
        { label: ui("A receber"), value: d ? formatBRL(d.pendingIn) : null },
      ]} />

      {d?.canWrite && !d.canCreateEntries ? (
        <div className="surface-panel mb-6 grid gap-4 border-primary/30 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><Wallet className="h-5 w-5" /></span><div><p className="font-semibold">Prepare sua gestão financeira</p><p className="mt-1 text-sm text-muted-foreground">Cadastre contas, categorias e subcategorias agora. Entradas e saídas serão liberadas automaticamente após seu primeiro pagamento recebido pela Wiize Recebe.</p></div></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setAccountOpen(true)}><Landmark className="h-4 w-4" /> Contas</Button><Button variant="outline" onClick={() => setCategoriesOpen(true)}><FolderTree className="h-4 w-4" /> Categorias</Button></div>
        </div>
      ) : null}

      {firstAccess && d.canWrite ? (
        <div className="surface-panel mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><Sparkles className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold">Vamos organizar seu financeiro.</p>
               <p className="text-sm text-muted-foreground">Cadastre suas contas e organize categorias. As movimentações manuais serão liberadas depois do primeiro recebimento.</p>
            </div>
          </div>
          <Button onClick={() => setAccountOpen(true)}><Landmark className="h-4 w-4" /> Cadastrar conta</Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <div className="surface-panel min-w-0 overflow-hidden">
          <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
            <div className="relative min-w-0 sm:col-span-2 xl:min-w-48 xl:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ui("Buscar")} className="pl-9" />
            </div>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}><SelectTrigger className="w-full xl:w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tudo</SelectItem><SelectItem value="in">Entradas</SelectItem><SelectItem value="out">Saídas</SelectItem></SelectContent></Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}><SelectTrigger className="w-full xl:w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Qualquer status</SelectItem><SelectItem value="paid">Pago/recebido</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="overdue">Vencido</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem><SelectItem value="reversed">Estornado</SelectItem></SelectContent></Select>
            <Select value={account} onValueChange={setAccount}><SelectTrigger className="w-full xl:w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas as contas</SelectItem>{[...accName].map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent></Select>
          </div>
          <Table className="min-w-0 [&_td:not(:first-child)]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead className="hidden md:table-cell">Categoria</TableHead><TableHead className="hidden sm:table-cell">Data</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.isLoading ? <TableRowsSkeleton cols={5} /> : q.isError ? (
                <TableStateRow cols={5}><ErrorState onRetry={() => q.refetch()} /></TableStateRow>
              ) : filtered.length === 0 ? (
                <TableStateRow cols={5}><EmptyState icon={<Wallet className="h-5 w-5" />} title="Nada neste mês" text="Lance uma entrada ou saída para começar." /></TableStateRow>
              ) : paginate(filtered, page, 10).map((e) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => setDetail(e)}>
                  <TableCell className="w-full max-w-0">
                    <div className="flex min-w-0 items-center gap-2"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${e.direction === "in" ? "bg-primary/12 text-primary" : "bg-destructive/10 text-destructive"}`}>{e.direction === "in" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : e.description.toLowerCase().includes("estorno") || e.description.toLowerCase().includes("reembolso") ? <RotateCcw className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}</span><div className="min-w-0"><p className="truncate font-medium">{e.description}{e.group_total ? <span className="ml-1 text-xs text-muted-foreground">{e.group_index}/{e.group_total}</span> : null}</p><p className="truncate text-xs text-muted-foreground">{accName.get(e.account_id ?? "") ?? "Sem conta"}<span className="sm:hidden"> · {STATUS_LABEL(e)[0]}</span>{e.auto ? " · Automático" : e.transfer_id ? " · Transferência" : e.card_invoice_id ? " · Fatura de cartão" : " · Manual"}</p></div></div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{e.auto ? "Wiize Recebe" : catName.get(e.category_id ?? "") ?? "Outros"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{formatDate(e.due_on)}</TableCell>
                   <TableCell className="hidden sm:table-cell"><StatusBadge tone={STATUS_LABEL(e)[1]}>{STATUS_LABEL(e)[0]}</StatusBadge></TableCell>
                  <TableCell className={`numeric-tabular whitespace-nowrap text-right font-semibold ${e.status === "cancelled" || e.status === "reversed" ? "text-muted-foreground line-through" : e.direction === "in" ? "text-primary" : ""}`}>{e.direction === "in" ? "+" : "−"} {formatBRL(e.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataPagination page={page} pageSize={10} total={filtered.length} onPageChange={setPage} />
        </div>
        <div className="space-y-4 xl:sticky xl:top-4">
          <AccountsCard accounts={(d?.accounts ?? []) as Account[]} wiizePayBalance={d?.wiizePayBalance ?? null} loading={q.isLoading} onOpen={setStatement} />
          <CardsSection accounts={(d?.accounts ?? []) as Account[]} categories={categories} />
        </div>
      </div>

      {newDir && d ? <EntryDialog initialDir={newDir} data={d} onClose={() => setNewDir(null)} /> : null}
      {registryOpen && d ? <FinancialRegistrySheet data={d} onNewAccount={() => { setEditingAccount(null); setAccountOpen(true); }} onEditAccount={(item) => { setEditingAccount(item); setAccountOpen(true); }} onCategories={() => setCategoriesOpen(true)} onClose={() => setRegistryOpen(false)} /> : null}
      {transferOpen && d ? <TransferDialog accounts={(d.accounts as Account[]).filter((a) => !a.archived)} onClose={() => setTransferOpen(false)} /> : null}
      {statement ? <StatementSheet account={statement} onClose={() => setStatement(null)} /> : null}
      {accountOpen ? <AccountDialog account={editingAccount} onClose={() => { setAccountOpen(false); setEditingAccount(null); }} /> : null}
      {categoriesOpen && d ? <CategoryDialog categories={categories} onClose={() => setCategoriesOpen(false)} /> : null}
      <EntrySheet entry={detail} canWrite={Boolean(d?.canWrite)} catName={catName} accName={accName} onClose={() => setDetail(null)} />
    </div>
  );
}

function EntryDialog({ initialDir, data, onClose }: { initialDir: Dir; data: { categories: Category[]; accounts: any[] }; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(createEntry);
  const suggest = useServerFn(suggestEntry);
  const [dir, setDir] = useState<Dir>(initialDir);
  const cats = data.categories.filter((c) => c.direction === dir && !c.archived);
  const other = (cats.find((c) => c.is_default) ?? cats.find((c) => c.name === "Outros"))?.id ?? "";
  const [f, setF] = useState({ amount: "", description: "", category_id: other, account_id: data.accounts[0]?.id ?? "", due_on: todayStr(), paid: true, notes: "", cost_center: "", repeat: "none" as "none" | "installment" | "recurring", times: "12" });
  const [advanced, setAdvanced] = useState(false);
  const [applied, setApplied] = useState(false);
  const sq = useQuery({
    queryKey: ["gestao-suggest", dir, f.description],
    queryFn: () => suggest({ data: { q: f.description, direction: dir } }),
    enabled: f.description.trim().length >= 2 && !applied, staleTime: 30_000,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const m = useMutation({
    mutationFn: () => save({ data: {
      direction: dir, amount: Number(f.amount.replace(/\./g, "").replace(",", ".")), description: f.description,
      category_id: f.category_id || null, account_id: f.account_id || null, due_on: f.due_on, paid: f.paid,
      notes: f.notes || null, cost_center: f.cost_center || null, repeat: f.repeat, times: f.repeat === "none" ? undefined : Number(f.times),
    } }),
    onSuccess: (r) => { toast.success(r.count > 1 ? `${r.count} lançamentos criados.` : dir === "in" ? "Entrada salva." : "Saída salva."); void qc.invalidateQueries({ queryKey: ["gestao"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid = Number(f.amount.replace(/\./g, "").replace(",", ".")) > 0 && f.description.trim();
  const suggestions = (sq.data ?? []).filter((s: any) => s.description.toLowerCase() !== f.description.toLowerCase() || s.category_id !== f.category_id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
         <DialogHeader><DialogTitle>Nova movimentação</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }}>
           <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1"><Button type="button" variant={dir === "in" ? "default" : "ghost"} onClick={() => { setDir("in"); set("category_id", ""); setApplied(false); }}><ArrowDownLeft className="h-4 w-4" /> Entrada</Button><Button type="button" variant={dir === "out" ? "default" : "ghost"} onClick={() => { setDir("out"); set("category_id", ""); setApplied(false); }}><ArrowUpRight className="h-4 w-4" /> Saída</Button></div>
          <div><Label>{f.repeat === "installment" ? "Valor total (será dividido nas parcelas)" : f.repeat === "recurring" ? "Valor de cada mês" : "Valor"}</Label><Input autoFocus inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))} className="text-lg font-semibold" /></div>
          <div className="relative">
            <Label>Descrição</Label>
            <Input value={f.description} onChange={(e) => { set("description", e.target.value); setApplied(false); }} placeholder={dir === "in" ? "Ex.: Consultoria" : "Ex.: Internet"} />
            {suggestions.length > 0 ? (
              <div className="mt-1 rounded-lg border border-border bg-popover p-1 shadow-md">
                {suggestions.map((s: any) => (
                  <button key={s.description} type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => { setF((p) => ({ ...p, description: s.description, category_id: s.category_id ?? p.category_id, account_id: s.account_id ?? p.account_id, amount: p.amount || String(s.amount).replace(".", ",") })); setApplied(true); }}>
                    <span>{s.description}</span><span className="text-xs text-muted-foreground">{cats.find((c) => c.id === s.category_id)?.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Categoria</Label>
              <Select value={f.category_id} onValueChange={(v) => set("category_id", v)}><SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                 <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{"\u00a0\u00a0".repeat(((c.level ?? 1) - 1) * 2)}{c.parent_id ? `↳ ${c.name}` : c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Conta</Label>
              <Select value={f.account_id || "none"} onValueChange={(v) => set("account_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sem conta</SelectItem>{data.accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Data</Label><Input type="date" value={f.due_on} onChange={(e) => set("due_on", e.target.value)} /></div>
            <div><Label>Status</Label>
              <Select value={f.paid ? "paid" : "pending"} onValueChange={(v) => set("paid", v === "paid")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="paid">{dir === "in" ? "Recebido" : "Pago"}</SelectItem><SelectItem value="pending">Pendente</SelectItem></SelectContent></Select></div>
          </div>
          <button type="button" className="text-xs font-medium text-primary" onClick={() => setAdvanced((a) => !a)}>{advanced ? "Ocultar opções avançadas" : "Opções avançadas"}</button>
          {advanced ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Repetir</Label>
                  <Select value={f.repeat} onValueChange={(v) => set("repeat", v as typeof f.repeat)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Não repetir</SelectItem><SelectItem value="recurring">Todo mês</SelectItem><SelectItem value="installment">Dividir em parcelas</SelectItem></SelectContent></Select></div>
                {f.repeat !== "none" ? <div><Label>{f.repeat === "installment" ? "Nº de parcelas" : "Quantos meses"}</Label><Input inputMode="numeric" value={f.times} onChange={(e) => set("times", e.target.value.replace(/\D/g, "").slice(0, 2))} /><p className="mt-1 text-xs text-muted-foreground">{(() => { const total = Number(f.amount.replace(/\./g, "").replace(",", ".")) || 0; const n = Number(f.times) || 0; const each = f.repeat === "installment" && n ? total / n : total; return n ? `${n}x de ${formatBRL(each)} · só entra nas entradas cada parcela quando for recebida` : null; })()}</p></div> : null}
              </div>
              <div><Label>Centro de custo</Label><Input value={f.cost_center} onChange={(e) => set("cost_center", e.target.value)} placeholder="Opcional" /></div>
              <div><Label>Observação</Label><Input value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Opcional" /></div>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={!valid || m.isPending}>{m.isPending ? "Salvando..." : dir === "in" ? "Salvar entrada" : "Salvar saída"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeriodPicker({ active, value, onChange }: { active: boolean; value: DateRange | undefined; onChange: (value: DateRange | undefined) => void }) {
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

function CategoryDialog({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const createFn = useServerFn(createCategory);
  const updateFn = useServerFn(updateCategory);
  const flagsFn = useServerFn(setCategoryFlags);
  const moveFn = useServerFn(moveAndDeleteCategory);
  const seedFn = useServerFn(seedSuggestedCategories);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<Dir>("out");
  const [parentId, setParentId] = useState("");
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"active" | "archived">("active");
  const [removing, setRemoving] = useState<Category | null>(null);
  const [target, setTarget] = useState("none");
  const own = categories.filter((c) => Boolean(c.tenant_id));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["gestao"] });
  const descendants = (id: string): string[] => own.filter((c) => c.parent_id === id).flatMap((c) => [c.id, ...descendants(c.id)]);
  const blocked = editing ? new Set([editing.id, ...descendants(editing.id)]) : new Set<string>();
  const parents = own.filter((c) => c.direction === direction && !c.archived && (c.level ?? 1) < 3 && !blocked.has(c.id));
  const reset = () => { setEditing(null); setName(""); setParentId(""); };
  const edit = (c: Category) => { setEditing(c); setName(c.name); setDirection(c.direction); setParentId(c.parent_id ?? ""); };
  const err = (e: Error) => toast.error(e.message);
  const save = useMutation({
    mutationFn: async () => { if (editing) await updateFn({ data: { id: editing.id, name, direction, parent_id: parentId || null } }); else await createFn({ data: { name, direction, parent_id: parentId || null } }); },
    onSuccess: () => { toast.success(editing ? "Categoria atualizada." : parentId ? "Subcategoria criada." : "Categoria criada."); refresh(); reset(); },
    onError: err,
  });
  const flags = useMutation({ mutationFn: (v: { id: string; archived?: boolean; is_default?: boolean }) => flagsFn({ data: v }), onSuccess: () => { toast.success("Categoria atualizada."); refresh(); }, onError: err });
  const move = useMutation({ mutationFn: () => moveFn({ data: { id: removing!.id, target_id: target === "none" ? null : target } }), onSuccess: (r) => { toast.success(r.moved ? `Categoria excluída. ${r.moved} movimentações foram movidas.` : "Categoria excluída."); setRemoving(null); refresh(); }, onError: err });
  const seed = useMutation({ mutationFn: () => seedFn(), onSuccess: (r) => { toast.success(r.created ? `${r.created} categorias criadas.` : "A estrutura sugerida já existe."); refresh(); }, onError: err });
  const term = search.trim().toLowerCase();
  const visible = (c: Category) => (show === "archived" ? c.archived : !c.archived);
  const matches = (c: Category): boolean => (!term || c.name.toLowerCase().includes(term) || own.some((x) => x.parent_id === c.id && matches(x)));
  const tree = (parent: string | null, dir: Dir, depth: number): ReactNode[] => own
    .filter((c) => c.parent_id === parent && c.direction === dir && matches(c) && (visible(c) || own.some((x) => x.parent_id === c.id && visible(x))))
    .flatMap((c) => [
      <div key={c.id} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-4 py-2.5 transition-colors first:border-t-0 hover:bg-muted/50" style={{ paddingLeft: 16 + depth * 24 }}>
        <div className="flex min-w-0 items-center gap-2.5">
          {depth === 0 ? <span className={`h-2 w-2 shrink-0 rounded-full ${c.direction === "in" ? "bg-primary" : "bg-destructive"}`} /> : <span className="h-px w-3 shrink-0 bg-border" />}
          <p className={`truncate text-sm ${depth === 0 ? "font-semibold" : "text-foreground/85"} ${c.archived ? "text-muted-foreground line-through" : ""}`}>{c.name}</p>
          {own.some((x) => x.parent_id === c.id) ? <span className="shrink-0 text-[11px] text-muted-foreground">{own.filter((x) => x.parent_id === c.id).length}</span> : null}
          {c.is_default ? <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">Padrão</span> : null}
        </div>
        <div className="flex shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
          {!c.archived ? <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={flags.isPending || c.is_default} onClick={() => flags.mutate({ id: c.id, is_default: true })}>Padrão</Button> : null}
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${c.name}`} onClick={() => edit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={c.archived ? `Reativar ${c.name}` : `Arquivar ${c.name}`} disabled={flags.isPending} onClick={() => flags.mutate({ id: c.id, archived: !c.archived })}>{c.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Excluir ${c.name}`} onClick={() => { setRemoving(c); setTarget("none"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>,
      ...tree(c.id, dir, depth + 1),
    ]);
  const targets = removing ? categories.filter((c) => c.direction === removing.direction && c.id !== removing.id && !c.archived && !descendants(removing.id).includes(c.id)) : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><FolderTree className="h-5 w-5" /></span>
            <div><DialogTitle className="text-lg">Plano de categorias</DialogTitle><p className="mt-0.5 text-sm text-muted-foreground">Organize receitas e despesas em até 3 níveis para relatórios claros.</p></div></div>
        </DialogHeader>
        <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Estrutura recomendada para prestadores de serviço</p><p className="text-xs text-muted-foreground">Cria categorias e subcategorias prontas. Nada que você já tem é alterado.</p></div>
              <Button type="button" size="sm" disabled={seed.isPending} onClick={() => seed.mutate()}>{seed.isPending ? "Aplicando..." : "Aplicar estrutura"}</Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar categoria" className="pl-9" /></div>
              <Select value={show} onValueChange={(v) => setShow(v as typeof show)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativas</SelectItem><SelectItem value="archived">Arquivadas</SelectItem></SelectContent></Select>
            </div>
            {(["in", "out"] as const).map((dir) => { const rows = tree(null, dir, 0); return (
              <section key={dir}>
                <div className="mb-2 flex items-center gap-2">{dir === "in" ? <ArrowDownLeft className="h-4 w-4 text-primary" /> : <ArrowUpRight className="h-4 w-4 text-destructive" />}<p className="text-sm font-semibold">{dir === "in" ? "Receitas" : "Despesas"}</p><span className="text-xs text-muted-foreground">{own.filter((c) => c.direction === dir && visible(c)).length}</span></div>
                {rows.length ? <div className="overflow-hidden rounded-xl border border-border bg-card">{rows}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{term ? "Nada encontrado." : show === "archived" ? "Nenhuma categoria arquivada." : "Nenhuma categoria própria."}</p>}
              </section>); })}
            <p className="text-xs text-muted-foreground">Categorias padrão da Wiize Recebe seguem disponíveis e protegidas.</p>
          </div>
          <div className="space-y-4 self-start lg:sticky lg:top-4">
            <form className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(); }}>
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{editing ? "Editar categoria" : "Nova categoria"}</p>{editing ? <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button> : null}</div>
              <div><Label>{ui("Nome")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Google Ads" /></div>
              <div><Label>Tipo</Label><Select value={direction} onValueChange={(v) => { setDirection(v as Dir); setParentId(""); }} disabled={Boolean(editing)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in">Receita</SelectItem><SelectItem value="out">Despesa</SelectItem></SelectContent></Select></div>
              <div><Label>Dentro de</Label><Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhuma — categoria principal</SelectItem>{parents.map((c) => <SelectItem key={c.id} value={c.id}>{"\u00a0\u00a0".repeat(((c.level ?? 1) - 1) * 2)}{c.parent_id ? `↳ ${c.name}` : c.name}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Até 3 níveis: categoria, subcategoria e subcategoria adicional.</p></div>
              <Button type="submit" className="w-full" disabled={!name.trim() || save.isPending}>{save.isPending ? "Salvando..." : editing ? "Salvar alterações" : "Criar"}</Button>
            </form>
            {removing ? (
              <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
                <p className="font-semibold">Excluir “{removing.name}”</p>
                <p className="text-xs text-muted-foreground">Movimentações e compras dessa categoria serão movidas para:</p>
                <Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem categoria</SelectItem>{targets.map((c) => <SelectItem key={c.id} value={c.id}>{c.parent_id ? `↳ ${c.name}` : c.name}</SelectItem>)}</SelectContent></Select>
                <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setRemoving(null)}>Voltar</Button><Button type="button" variant="destructive" className="flex-1" disabled={move.isPending} onClick={() => move.mutate()}>Mover e excluir</Button></div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountsCard({ accounts, wiizePayBalance, loading, onOpen }: { accounts: Account[]; wiizePayBalance: number | null; loading: boolean; onOpen: (a: Account) => void }) {
  const active = accounts.filter((a) => !a.archived);
  const total = active.reduce((s, a) => s + Math.round(a.balance * 100), 0) / 100;
  return (
    <div className="surface-panel overflow-hidden">
      <div className="border-b border-border px-4 py-3"><p className="text-sm font-semibold leading-5">Contas e saldos</p><p className="text-xs leading-4 text-muted-foreground">Atualizados pelas movimentações pagas.</p></div>
      {loading ? (
        <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-10 rounded-lg" />)}</div>
      ) : (
        <div className="divide-y divide-border">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-primary/5 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">Saldo Wiize Recebe</p><p className="truncate text-xs text-muted-foreground">Disponível para saque · somente leitura</p></div><p className="numeric-tabular text-right text-sm font-semibold">{wiizePayBalance === null ? "—" : formatBRL(wiizePayBalance)}</p></div>
          {active.length ? active.map((a) => (
            <button key={a.id} type="button" onClick={() => onOpen(a)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{a.name}</p><p className="truncate text-xs text-muted-foreground">{ACCOUNT_KIND[a.kind]} · Ativa</p></div>
              <p className={`numeric-tabular text-right text-sm font-semibold ${a.balance < 0 ? "text-destructive" : ""}`}>{formatBRL(a.balance)}</p>
            </button>
          )) : <div className="p-4"><EmptyState icon={<Landmark className="h-5 w-5" />} title="Nenhuma conta" text="Use Cadastros para criar contas e ver os saldos aqui." /></div>}
          {active.length > 1 ? <div className="grid grid-cols-[minmax(0,1fr)_auto] px-4 py-3 text-sm"><p className="text-muted-foreground">Total nas contas</p><p className="numeric-tabular font-semibold">{formatBRL(total)}</p></div> : null}
        </div>
      )}
    </div>
  );
}

function AccountRegistryRow({ item, canWrite, onEdit }: { item: Account; canWrite: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(setAccountArchived);
  const m = useMutation({ mutationFn: () => fn({ data: { id: item.id, archived: !item.archived } }), onSuccess: () => { toast.success(item.archived ? "Conta reativada." : "Conta arquivada. O histórico foi mantido."); void qc.invalidateQueries({ queryKey: ["gestao"] }); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-4">
      <div className="min-w-0"><p className={`truncate text-sm font-semibold ${item.archived ? "text-muted-foreground" : ""}`}>{item.name}</p><p className="truncate text-xs text-muted-foreground">{ACCOUNT_KIND[item.kind]} · {item.archived ? "Arquivada" : "Ativa"}</p></div>
      <div className="flex items-center gap-1"><p className="numeric-tabular mr-1 text-right text-sm font-semibold">{formatBRL(item.balance)}</p>{canWrite ? <><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${item.name}`} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={item.archived ? "Reativar" : "Arquivar"} disabled={m.isPending} onClick={() => m.mutate()}>{item.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</Button></> : null}</div>
    </div>
  );
}

function TransferDialog({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(createTransfer);
  const [f, setF] = useState({ from: accounts[0]?.id ?? "", to: accounts[1]?.id ?? "", amount: "", date: todayStr(), description: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const amount = Number(f.amount.replace(/\./g, "").replace(",", "."));
  const m = useMutation({ mutationFn: () => fn({ data: { from: f.from, to: f.to, amount, date: f.date, description: f.description } }), onSuccess: () => { toast.success("Transferência registrada."); void qc.invalidateQueries({ queryKey: ["gestao"] }); onClose(); }, onError: (e: Error) => toast.error(e.message) });
  const valid = amount > 0 && f.from && f.to && f.from !== f.to;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Transferir entre contas</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }}>
          <div><Label>Valor</Label><Input autoFocus inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))} className="text-lg font-semibold" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>De</Label><Select value={f.from} onValueChange={(v) => set("from", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Para</Label><Select value={f.to} onValueChange={(v) => set("to", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Data</Label><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div><Label>Descrição</Label><Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Opcional" /></div>
          </div>
          {f.from === f.to ? <p className="text-xs text-destructive">Escolha contas diferentes.</p> : null}
          <p className="text-xs text-muted-foreground">Transferências mudam o saldo das contas, mas não contam como entrada ou saída.</p>
          <Button type="submit" className="w-full" disabled={!valid || m.isPending}>{m.isPending ? "Transferindo..." : "Transferir"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatementSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const fn = useServerFn(getAccountStatement);
  const q = useQuery({ queryKey: ["gestao", "statement", account.id], queryFn: () => fn({ data: { account_id: account.id } }) });
  const [page, setPage] = useState(0);
  const rows = (q.data ?? []) as (Entry & { transfer_id: string | null })[];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{account.name}</SheetTitle></SheetHeader>
        <p className="text-sm text-muted-foreground">{ACCOUNT_KIND[account.kind]} · {account.archived ? "Arquivada" : "Ativa"}</p>
        <div className="mt-4 grid grid-cols-2 divide-x divide-border rounded-lg border border-border text-center">
          <div className="p-3"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="numeric-tabular mt-1 font-semibold">{formatBRL(Number(account.opening_balance))}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">Saldo atual</p><p className="numeric-tabular mt-1 font-semibold">{formatBRL(account.balance)}</p></div>
        </div>
        <p className="mt-6 text-xs font-semibold uppercase text-muted-foreground">Histórico</p>
        {q.isLoading ? <div className="mt-2 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-10 rounded-lg" />)}</div>
          : q.isError ? <ErrorState onRetry={() => q.refetch()} />
          : rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma movimentação nesta conta.</p>
          : <div className="mt-2 divide-y divide-border rounded-lg border border-border">{paginate(rows, page, 12).map((e) => (
            <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
              <div className="min-w-0"><p className="truncate text-sm">{e.description}</p><p className="text-xs text-muted-foreground">{formatDate(e.paid_on ?? e.due_on)} · {STATUS_LABEL(e)[0]}</p></div>
              <p className={`numeric-tabular text-sm font-semibold ${e.status !== "paid" ? "text-muted-foreground" : e.direction === "in" ? "text-primary" : ""} ${e.status === "cancelled" || e.status === "reversed" ? "line-through" : ""}`}>{e.direction === "in" ? "+" : "−"} {formatBRL(e.amount)}</p>
            </div>))}</div>}
        {rows.length > 12 ? <DataPagination page={page} pageSize={12} total={rows.length} onPageChange={setPage} /> : null}
      </SheetContent>
    </Sheet>
  );
}


function FinancialRegistrySheet({ data, onNewAccount, onEditAccount, onCategories, onClose }: { data: { accounts: Account[]; categories: Category[]; wiizePayBalance: number | null; canWrite: boolean }; onNewAccount: () => void; onEditAccount: (account: Account) => void; onCategories: () => void; onClose: () => void }) {
  const ownCategories = data.categories.filter((category) => category.tenant_id);
  return <Sheet open onOpenChange={(open) => !open && onClose()}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Cadastros financeiros</SheetTitle></SheetHeader>
    <Tabs defaultValue="accounts" className="mt-5"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="accounts">Contas</TabsTrigger><TabsTrigger value="categories">Categorias</TabsTrigger></TabsList>
      <TabsContent value="accounts" className="mt-4 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0"><p className="font-semibold">Contas e saldos</p><p className="text-xs text-muted-foreground">Saldos atualizados pelas movimentações pagas.</p></div>{data.canWrite ? <Button size="sm" onClick={onNewAccount}><Plus className="h-4 w-4" /> Nova conta</Button> : null}</div>
        <div className="rounded-lg border border-primary/25 bg-primary/8 p-4"><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Wallet className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">Saldo Wiize Recebe</p><p className="text-xs text-muted-foreground">Automático · somente leitura</p></div><p className="numeric-tabular text-right font-semibold">{data.wiizePayBalance === null ? "—" : formatBRL(data.wiizePayBalance)}</p></div></div>
        {data.accounts.length ? data.accounts.map((item) => <AccountRegistryRow key={item.id} item={item} canWrite={data.canWrite} onEdit={() => onEditAccount(item)} />) : <EmptyState icon={<Landmark className="h-5 w-5" />} title="Nenhuma conta cadastrada" text="Cadastre sua primeira conta para acompanhar o saldo." />}
      </TabsContent>
      <TabsContent value="categories" className="mt-4 space-y-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0"><p className="font-semibold">Categorias e subcategorias</p><p className="text-xs text-muted-foreground">Organize entradas e saídas no seu plano financeiro.</p></div>{data.canWrite ? <Button size="sm" onClick={onCategories}><FolderTree className="h-4 w-4" /> Gerenciar</Button> : null}</div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Entradas</p><p className="mt-1 text-2xl font-bold">{ownCategories.filter((item) => item.direction === "in").length}</p></div><div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Saídas</p><p className="mt-1 text-2xl font-bold">{ownCategories.filter((item) => item.direction === "out").length}</p></div></div><p className="text-xs text-muted-foreground">As categorias padrão continuam disponíveis e protegidas contra alterações.</p></TabsContent>
    </Tabs></SheetContent></Sheet>;
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const createFn = useServerFn(createAccount);
  const updateFn = useServerFn(updateAccount);
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<"bank" | "cash" | "wallet" | "credit_card">((account?.kind as "bank" | "cash" | "wallet" | "credit_card") ?? "bank");
  const institution = account?.institution_code ?? "other";
  const [bal, setBal] = useState(account ? String(account.opening_balance).replace(".", ",") : "");
  const m = useMutation({
    mutationFn: async () => { const data = { name, kind, opening_balance: Number(bal.replace(/\./g, "").replace(",", ".")) || 0, institution_code: institution }; if (account) await updateFn({ data: { id: account.id, ...data } }); else await createFn({ data }); },
    onSuccess: () => { toast.success(account ? "Conta atualizada." : "Conta criada."); void qc.invalidateQueries({ queryKey: ["gestao"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.mutate(); }}>
          <div><Label>{ui("Nome")}</Label><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank" /></div>
          <div><Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ACCOUNT_KIND).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Saldo inicial (opcional)</Label><Input inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value.replace(/[^\d.,-]/g, ""))} placeholder="0,00" /></div>
          <Button type="submit" className="w-full" disabled={!name.trim() || m.isPending}>{m.isPending ? "Salvando..." : account ? "Salvar alterações" : "Criar conta"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EntrySheet({ entry, canWrite, catName, accName, onClose }: { entry: Entry | null; canWrite: boolean; catName: Map<string, string>; accName: Map<string, string>; onClose: () => void }) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setEntryStatus);
  const cancelFn = useServerFn(cancelEntry);
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ["gestao"] }); onClose(); };
  const st = useMutation({ mutationFn: (paid: boolean) => setStatusFn({ data: { id: entry!.id, paid } }), onSuccess: () => done("Status atualizado."), onError: (e: Error) => toast.error(e.message) });
  const cancel = useMutation({ mutationFn: () => cancelFn({ data: { id: entry!.id } }), onSuccess: () => done(entry?.status === "paid" ? "Movimentação estornada." : "Movimentação cancelada."), onError: (e: Error) => toast.error(e.message) });
  return (
    <Sheet open={Boolean(entry)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {entry ? (
          <>
            <SheetHeader><SheetTitle>{entry.description}</SheetTitle></SheetHeader>
            <p className={`numeric-tabular mt-4 font-display text-3xl font-bold ${entry.direction === "in" ? "text-primary" : ""}`}>{entry.direction === "in" ? "+" : "−"} {formatBRL(entry.amount)}</p>
            <dl className="mt-6 space-y-3 text-sm">
              {([
                ["Tipo", entry.transfer_id ? "Transferência" : entry.card_invoice_id ? "Pagamento de fatura" : entry.direction === "in" ? "Entrada" : "Saída"],
                ["Status", STATUS_LABEL(entry)[0]],
                ["Data", formatDate(entry.due_on)],
                ["Categoria", entry.auto ? "Wiize Recebe" : catName.get(entry.category_id ?? "") ?? "Outros"],
                ["Conta", accName.get(entry.account_id ?? "") ?? "Sem conta"],
                entry.group_total ? [entry.group_kind === "installment" ? "Parcela" : "Recorrência", `${entry.group_index} de ${entry.group_total}`] : null,
                entry.cost_center ? ["Centro de custo", entry.cost_center] : null,
                entry.notes ? ["Observação", entry.notes] : null,
              ].filter(Boolean) as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            {entry.auto ? (
              <p className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Lançado automaticamente pela Wiize Recebe. Não pode ser editado aqui.</p>
            ) : canWrite ? (
              entry.status === "cancelled" || entry.status === "reversed" ? (
                <p className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Movimentação {entry.status === "reversed" ? "estornada" : "cancelada"}. Ela fica no histórico e não afeta saldos.</p>
              ) : (
              <div className="mt-6 flex flex-wrap gap-2">
                {!entry.transfer_id && !entry.card_invoice_id ? (
                  <Button className="flex-1" variant={entry.status === "paid" ? "outline" : "default"} disabled={st.isPending} onClick={() => st.mutate(entry.status !== "paid")}>
                    <Check className="h-4 w-4" /> {entry.status === "paid" ? "Marcar pendente" : entry.direction === "in" ? "Marcar recebido" : "Marcar pago"}
                  </Button>
                ) : null}
                <Button variant="outline" className="flex-1" disabled={cancel.isPending} onClick={() => cancel.mutate()}><RotateCcw className="h-4 w-4" /> {entry.status === "paid" ? (entry.transfer_id ? "Estornar transferência" : entry.card_invoice_id ? "Estornar pagamento da fatura" : "Estornar") : "Cancelar"}</Button>
              </div>
              )
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
