import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Pencil, Plus } from "lucide-react";
import { addCardPurchase, cancelCardPurchase, getCards, payInvoice, saveCard } from "@/lib/finance-ops.functions";
import { formatBRL, formatDate } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

type Account = { id: string; name: string; archived: boolean };
type Category = { id: string; name: string; direction: "in" | "out"; archived?: boolean; parent_id: string | null };
type Invoice = { id: string; card_id: string; reference_month: string; closing_on: string; due_on: string; paid_at: string | null; total: number; status: "open" | "closed" | "overdue" | "paid"; items: { id: string; purchase_id: string; description: string; purchased_on: string; number: number; of: number; amount: number }[] };
type Card = { id: string; name: string; brand: string; last4: string; credit_limit: number; used: number; available: number; closing_day: number; due_day: number; pay_account_id: string | null; color: string; status: string; current_total: number; invoices: Invoice[] };

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", elo: "Elo", amex: "American Express", hipercard: "Hipercard", other: "Outra" };
const COLORS: Record<string, string> = { slate: "bg-muted-foreground", green: "bg-primary", blue: "bg-sky-500", violet: "bg-violet-500", amber: "bg-amber-500", rose: "bg-rose-500" };
const INV_STATUS: Record<Invoice["status"], [string, "success" | "warning" | "danger" | "neutral"]> = { open: ["Aberta", "neutral"], closed: ["Fechada", "warning"], overdue: ["Vencida", "danger"], paid: ["Paga", "success"] };
const monthLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const parseMoney = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

export function CardsSection({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const { t: ui } = useTranslation("ui");
  const fetchFn = useServerFn(getCards);
  const q = useQuery({ queryKey: ["gestao", "cards"], queryFn: () => fetchFn() });
  const [editing, setEditing] = useState<Card | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const cards = (q.data?.cards ?? []) as Card[];
  const open = cards.find((c) => c.id === openId) ?? null;
  return (
    <div className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0"><p className="text-sm font-semibold leading-5">Cartões de crédito</p><p className="text-xs leading-4 text-muted-foreground">Limite e faturas pelas compras reais.</p></div>
        {q.data?.canWrite ? <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" />  {ui("Cartão")}</Button> : null}
      </div>
      {q.isLoading ? <div className="space-y-3 p-4">{[0, 1].map((i) => <div key={i} className="skeleton-shimmer h-14 rounded-lg" />)}</div>
        : cards.length === 0 ? <div className="p-4"><EmptyState icon={<CreditCard className="h-5 w-5" />} title="Nenhum cartão" text="Cadastre um cartão para controlar limite e faturas." /></div>
        : <div className="divide-y divide-border">{cards.map((c) => {
          const pct = c.credit_limit > 0 ? Math.min(100, (c.used / c.credit_limit) * 100) : 0;
          return (
            <button key={c.id} type="button" onClick={() => setOpenId(c.id)} className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium"><span className={`h-2 w-2 shrink-0 rounded-full ${COLORS[c.color]}`} />{c.name}</p>
                <p className="numeric-tabular text-sm font-semibold">{formatBRL(c.current_total)}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{BRANDS[c.brand]} •••• {c.last4}{c.status !== "active" ? ` · ${c.status === "blocked" ? "Bloqueado" : "Arquivado"}` : ""}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-xs text-muted-foreground">Disponível {formatBRL(c.available)} de {formatBRL(c.credit_limit)}</p>
            </button>
          );
        })}</div>}
      {editing ? <CardDialog card={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} /> : null}
      {open ? <CardSheet card={open} canWrite={Boolean(q.data?.canWrite)} accounts={accounts} categories={categories} onEdit={() => setEditing(open)} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function CardDialog({ card, accounts, onClose }: { card: Card | null; accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(saveCard);
  const [f, setF] = useState({ name: card?.name ?? "", brand: card?.brand ?? "mastercard", last4: card?.last4 ?? "", limit: card ? String(card.credit_limit).replace(".", ",") : "", closing: String(card?.closing_day ?? 1), due: String(card?.due_day ?? 10), account: card?.pay_account_id ?? "", color: card?.color ?? "slate", status: card?.status ?? "active" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const m = useMutation({
    mutationFn: () => fn({ data: { id: card?.id, name: f.name, brand: f.brand as any, last4: f.last4, credit_limit: parseMoney(f.limit) || 0, closing_day: Number(f.closing), due_day: Number(f.due), pay_account_id: f.account || null, color: f.color as any, status: f.status as any } }),
    onSuccess: () => { toast.success(card ? "Cartão atualizado." : "Cartão cadastrado."); void qc.invalidateQueries({ queryKey: ["gestao"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const days = Array.from({ length: 28 }, (_, i) => String(i + 1));
  const valid = f.name.trim() && /^\d{4}$/.test(f.last4) && Number(f.closing) !== Number(f.due);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{card ? "Editar cartão" : "Novo cartão"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }}>
          <div><Label>Apelido</Label><Input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Cartão empresa" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bandeira</Label><Select value={f.brand} onValueChange={(v) => set("brand", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(BRANDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Últimos 4 dígitos</Label><Input inputMode="numeric" value={f.last4} onChange={(e) => set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" /></div>
          </div>
          <div><Label>Limite total</Label><Input inputMode="decimal" value={f.limit} onChange={(e) => set("limit", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Dia de fechamento</Label><Select value={f.closing} onValueChange={(v) => set("closing", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Dia de vencimento</Label><Select value={f.due} onValueChange={(v) => set("due", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Conta para pagamento</Label><Select value={f.account || "none"} onValueChange={(v) => set("account", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Escolher ao pagar</SelectItem>{accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cor</Label><div className="mt-2 flex gap-2">{Object.entries(COLORS).map(([k, cls]) => <button key={k} type="button" aria-label={k} onClick={() => set("color", k)} className={`h-6 w-6 rounded-full ${cls} ${f.color === k ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "opacity-60"}`} />)}</div></div>
            {card ? <div><Label>Status</Label><Select value={f.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativo</SelectItem><SelectItem value="blocked">Bloqueado</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div> : null}
          </div>
          {Number(f.closing) === Number(f.due) ? <p className="text-xs text-destructive">Fechamento e vencimento precisam ser dias diferentes.</p> : null}
          <p className="text-xs text-muted-foreground">Por segurança, guardamos apenas os 4 últimos dígitos.</p>
          <Button type="submit" className="w-full" disabled={!valid || m.isPending}>{m.isPending ? "Salvando..." : "Salvar cartão"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CardSheet({ card, canWrite, accounts, categories, onEdit, onClose }: { card: Card; canWrite: boolean; accounts: Account[]; categories: Category[]; onEdit: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const payFn = useServerFn(payInvoice);
  const cancelFn = useServerFn(cancelCardPurchase);
  const [buying, setBuying] = useState(false);
  const sorted = useMemo(() => [...card.invoices].filter((i) => i.total > 0 || i.status !== "paid").sort((a, b) => (a.reference_month < b.reference_month ? 1 : -1)), [card]);
  const [sel, setSel] = useState<string | null>(card.invoices.find((i) => i.status === "open")?.id ?? sorted[0]?.id ?? null);
  const inv = card.invoices.find((i) => i.id === sel) ?? null;
  const [payAcc, setPayAcc] = useState(card.pay_account_id ?? "");
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ["gestao"] }); };
  const pay = useMutation({ mutationFn: () => payFn({ data: { invoice_id: inv!.id, account_id: payAcc, paid_on: todayStr() } }), onSuccess: () => done("Fatura paga. A saída foi registrada na conta."), onError: (e: Error) => toast.error(e.message) });
  const cancel = useMutation({ mutationFn: (id: string) => cancelFn({ data: { purchase_id: id } }), onSuccess: () => done("Compra cancelada em todas as parcelas."), onError: (e: Error) => toast.error(e.message) });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${COLORS[card.color]}`} />{card.name}</SheetTitle></SheetHeader>
        <p className="mt-1 text-sm text-muted-foreground">{BRANDS[card.brand]} •••• {card.last4} · fecha dia {card.closing_day} · vence dia {card.due_day}</p>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-lg border border-border text-center">
          {([["Limite", card.credit_limit], ["Utilizado", card.used], ["Disponível", card.available]] as const).map(([l, v]) => <div key={l} className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="numeric-tabular mt-1 text-sm font-semibold">{formatBRL(v)}</p></div>)}
        </div>
        {canWrite ? <div className="mt-3 flex gap-2"><Button className="flex-1" disabled={card.status !== "active"} onClick={() => setBuying(true)}><Plus className="h-4 w-4" /> Nova compra</Button><Button variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" /> Editar</Button></div> : null}

        <p className="mt-6 text-xs font-semibold uppercase text-muted-foreground">Faturas</p>
        {sorted.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma fatura ainda. Elas surgem ao lançar compras.</p> : (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{sorted.map((i) => <button key={i.id} type="button" onClick={() => setSel(i.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${sel === i.id ? "border-primary bg-primary/8" : "border-border"}`}><p className="font-medium capitalize">{monthLabel(i.reference_month)}</p><p className="numeric-tabular text-muted-foreground">{formatBRL(i.total)}</p></button>)}</div>
        )}
        {inv ? (
          <div className="mt-3 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div><p className="numeric-tabular text-lg font-semibold">{formatBRL(inv.total)}</p><p className="text-xs text-muted-foreground">Fecha {formatDate(inv.closing_on)} · vence {formatDate(inv.due_on)}</p></div>
              <StatusBadge tone={INV_STATUS[inv.status][1]}>{INV_STATUS[inv.status][0]}</StatusBadge>
            </div>
            {inv.items.length ? <div className="divide-y divide-border">{inv.items.map((it) => (
              <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0"><p className="truncate">{it.description}{it.of > 1 ? <span className="ml-1 text-xs text-muted-foreground">{it.number}/{it.of}</span> : null}</p><p className="text-xs text-muted-foreground">{formatDate(it.purchased_on)}{canWrite && inv.status !== "paid" ? <> · <button type="button" className="text-destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(it.purchase_id)}>cancelar compra</button></> : null}</p></div>
                <p className="numeric-tabular font-medium">{formatBRL(it.amount)}</p>
              </div>))}</div> : <p className="p-3 text-sm text-muted-foreground">Sem compras nesta fatura.</p>}
            {canWrite && inv.status !== "paid" && inv.total > 0 ? (
              <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select value={payAcc || "none"} onValueChange={(v) => setPayAcc(v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Conta de pagamento" /></SelectTrigger><SelectContent><SelectItem value="none" disabled>Conta de pagamento</SelectItem>{accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
                <Button disabled={!payAcc || pay.isPending} onClick={() => pay.mutate()}>{pay.isPending ? "Pagando..." : "Pagar fatura"}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {buying ? <PurchaseDialog card={card} categories={categories} onClose={() => setBuying(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PurchaseDialog({ card, categories, onClose }: { card: Card; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(addCardPurchase);
  const [key] = useState(() => crypto.randomUUID());
  const cats = categories.filter((c) => c.direction === "out" && !c.archived);
  const [f, setF] = useState({ description: "", amount: "", date: todayStr(), installments: "1", category: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const amount = parseMoney(f.amount);
  const n = Math.max(1, Number(f.installments) || 1);
  const m = useMutation({
    mutationFn: () => fn({ data: { card_id: card.id, description: f.description, amount, purchased_on: f.date, installments: n, category_id: f.category || null, idempotency_key: key } }),
    onSuccess: () => { toast.success(n > 1 ? `Compra lançada em ${n} faturas.` : "Compra lançada na fatura."); void qc.invalidateQueries({ queryKey: ["gestao"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid = amount > 0 && f.description.trim() && amount <= card.available;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Compra no {card.name}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }}>
          <div><Label>Valor total</Label><Input autoFocus inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" className="text-lg font-semibold" /></div>
          <div><Label>Descrição</Label><Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Assinatura de software" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data da compra</Label><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div><Label>Parcelas</Label><Select value={f.installments} onValueChange={(v) => set("installments", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, i) => String(i + 1)).map((v) => <SelectItem key={v} value={v}>{v === "1" ? "À vista" : `${v}x`}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Categoria</Label><Select value={f.category || "none"} onValueChange={(v) => set("category", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem categoria</SelectItem>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.parent_id ? `↳ ${c.name}` : c.name}</SelectItem>)}</SelectContent></Select></div>
          {amount > 0 && n > 1 ? <p className="text-xs text-muted-foreground">{n}x de {formatBRL(Math.floor((amount * 100) / n) / 100)} nas próximas faturas.</p> : null}
          {amount > card.available ? <p className="text-xs text-destructive">Acima do limite disponível ({formatBRL(card.available)}).</p> : null}
          <Button type="submit" className="w-full" disabled={!valid || m.isPending}>{m.isPending ? "Lançando..." : "Lançar compra"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
