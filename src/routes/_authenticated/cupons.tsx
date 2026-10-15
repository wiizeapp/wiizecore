import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Pause, Pencil, Play, Plus, Archive, TicketPercent } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, formatDate } from "@/lib/format";
import { listCoupons, saveCoupon, setCouponStatus } from "@/lib/coupons.functions";

export const Route = createFileRoute("/_authenticated/cupons")({
  head: () => ({
    meta: [
      { title: "Cupons & Incentivos — Wiize Core" },
      { name: "description", content: "Crie e acompanhe cupons de desconto usados no checkout da sua empresa." },
      { property: "og:title", content: "Cupons de desconto — Wiize Core" },
      { property: "og:description", content: "Cupons exclusivos da sua empresa no checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Coupon = Awaited<ReturnType<typeof listCoupons>>["coupons"][number];
type Form = { id?: string | undefined; code: string; description: string; type: "percent" | "fixed"; value: string; maxDiscount: string; minAmount: string; startsAt: string; expiresAt: string; usageLimit: string; perCustomerLimit: string; restoreOnRefund: boolean };
const EMPTY: Form = { code: "", description: "", type: "percent", value: "", maxDiscount: "", minAmount: "", startsAt: "", expiresAt: "", usageLimit: "", perCustomerLimit: "", restoreOnRefund: false };
const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, "").replace(",", ".")) : null);
const int = (v: string) => (v.trim() ? Math.floor(Number(v)) : null);
const toIso = (v: string) => (v ? new Date(`${v}T00:00:00-03:00`).toISOString() : null);
const toIsoEnd = (v: string) => (v ? new Date(`${v}T23:59:59-03:00`).toISOString() : null);
const toDay = (v: string | null) => (v ? new Date(new Date(v).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : "");
const STATUS: Record<string, string> = { active: "Ativo", paused: "Pausado", archived: "Arquivado" };

function Page() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const list = useServerFn(listCoupons);
  const save = useServerFn(saveCoupon);
  const setStatus = useServerFn(setCouponStatus);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["coupons"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "archived">("all");
  const [form, setForm] = useState<Form | null>(null);

  const rows = useMemo(() => (data?.coupons ?? []).filter((c) => (filter === "all" ? c.status !== "archived" : c.status === filter) && (!q || c.code.includes(q.toUpperCase()) || (c.description ?? "").toLowerCase().includes(q.toLowerCase()))), [data, q, filter]);
  const totals = useMemo(() => (data?.coupons ?? []).reduce((a, c) => ({ used: a.used + c.used, discount: a.discount + c.discount, revenue: a.revenue + c.revenue }), { used: 0, discount: 0, revenue: 0 }), [data]);

  const saveMut = useMutation({
    mutationFn: (f: Form) => save({ data: {
      ...(f.id ? { id: f.id } : {}), code: f.code, description: f.description.trim() || null, type: f.type, value: num(f.value) ?? 0,
      maxDiscount: f.type === "percent" ? num(f.maxDiscount) : null, minAmount: num(f.minAmount), startsAt: toIso(f.startsAt), expiresAt: toIsoEnd(f.expiresAt),
      usageLimit: int(f.usageLimit), perCustomerLimit: int(f.perCustomerLimit), restoreOnRefund: f.restoreOnRefund,
    } }),
    onSuccess: () => { toast.success(ui("Cupom salvo.")); setForm(null); void qc.invalidateQueries({ queryKey: ["coupons"] }); },
    onError: (e: Error) => toast.error(ui(e.message)),
  });
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "paused" | "archived" }) => setStatus({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["coupons"] }),
    onError: (e: Error) => toast.error(ui(e.message)),
  });

  const edit = (c: Coupon, duplicate = false) => setForm({
    id: duplicate ? undefined : c.id, code: duplicate ? `${c.code}2`.slice(0, 32) : c.code, description: c.description ?? "", type: c.type,
    value: String(c.value).replace(".", ","), maxDiscount: c.maxDiscount != null ? String(c.maxDiscount).replace(".", ",") : "", minAmount: c.minAmount != null ? String(c.minAmount).replace(".", ",") : "",
    startsAt: toDay(c.startsAt), expiresAt: toDay(c.expiresAt), usageLimit: c.usageLimit ? String(c.usageLimit) : "", perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : "", restoreOnRefund: c.restoreOnRefund,
  });
  const label = (c: Coupon) => (c.type === "percent" ? `${c.value.toLocaleString("pt-BR")}% ${ui("de desconto")}` : `${formatBRL(c.value)} ${ui("de desconto")}`);

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Cupons & Incentivos")} description={ui("Cupons exclusivos da sua empresa, aplicados pelo cliente no checkout.")}
        action={data?.canCreate ? <Button onClick={() => setForm({ ...EMPTY })}><Plus className="size-4" />{ui("Novo cupom")}</Button> : undefined} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[[ui("Usos confirmados"), isLoading ? null : String(totals.used)], [ui("Desconto concedido"), isLoading ? null : formatBRL(totals.discount)], [ui("Receita com cupons"), isLoading ? null : formatBRL(totals.revenue)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{k}</p><p className="numeric-tabular mt-1 text-2xl font-semibold">{v ?? <span className="inline-block h-7 w-20 animate-pulse rounded bg-muted" />}</p></div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui("Buscar cupom")} className="h-9 max-w-xs" aria-label={ui("Buscar cupom")} />
          <div className="flex flex-wrap gap-1">
            {(["all", "active", "paused", "archived"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)}>{ui(f === "all" ? "Todos" : STATUS[f]!)}</Button>
            ))}
          </div>
        </div>
        {isLoading ? <ListSkeleton /> : isError ? <ErrorState onRetry={() => void refetch()} /> : rows.length === 0 ? (
          <EmptyState icon={<TicketPercent className="size-6" />} title={ui("Nenhum cupom por aqui")} text={ui("Crie um cupom e informe o código ao seu cliente. Ele aplica no checkout.")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-semibold">{c.code}</span>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>{ui(STATUS[c.status]!)}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {label(c)}{c.maxDiscount ? ` · ${ui("máx.")} ${formatBRL(c.maxDiscount)}` : ""}{c.minAmount ? ` · ${ui("acima de")} ${formatBRL(c.minAmount)}` : ""}{c.expiresAt ? ` · ${ui("até")} ${formatDate(c.expiresAt)}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="numeric-tabular font-medium">{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ""} {ui("usos")}</p>
                  <p className="numeric-tabular text-xs text-muted-foreground">{formatBRL(c.discount)} {ui("em descontos")}{c.reserved ? ` · ${c.reserved} ${ui("em andamento")}` : ""}</p>
                </div>
                {data?.canEdit ? (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => edit(c)} aria-label={ui("Editar")}><Pencil className="size-4" /></Button>
                    {data.canCreate ? <Button size="icon" variant="ghost" onClick={() => edit(c, true)} aria-label={ui("Duplicar")}><Copy className="size-4" /></Button> : null}
                    {c.status !== "archived" ? (
                      <Button size="icon" variant="ghost" onClick={() => statusMut.mutate({ id: c.id, status: c.status === "active" ? "paused" : "active" })} aria-label={ui(c.status === "active" ? "Pausar" : "Ativar")}>{c.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
                    ) : null}
                    {data.canArchive ? <Button size="icon" variant="ghost" onClick={() => statusMut.mutate({ id: c.id, status: c.status === "archived" ? "paused" : "archived" })} aria-label={ui(c.status === "archived" ? "Restaurar" : "Arquivar")}><Archive className="size-4" /></Button> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ui(form?.id ? "Editar cupom" : "Novo cupom")}</DialogTitle>
            <DialogDescription>{ui("O código vale somente para cobranças da sua empresa.")}</DialogDescription>
          </DialogHeader>
          {form ? (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}>
              <div className="grid gap-1.5"><Label htmlFor="c-code">{ui("Código")}</Label><Input id="c-code" required maxLength={32} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="CLIENTE10" className="font-mono uppercase" /></div>
              <div className="grid gap-1.5"><Label htmlFor="c-desc">{ui("Descrição interna")}</Label><Input id="c-desc" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(["percent", "fixed"] as const).map((t) => (
                  <button type="button" key={t} onClick={() => setForm({ ...form, type: t })} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${form.type === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{ui(t === "percent" ? "Percentual" : "Valor fixo")}</button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label htmlFor="c-val">{ui(form.type === "percent" ? "Desconto (%)" : "Desconto (R$)")}</Label><Input id="c-val" required inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
                {form.type === "percent" ? <div className="grid gap-1.5"><Label htmlFor="c-max">{ui("Desconto máximo (R$)")}</Label><Input id="c-max" inputMode="decimal" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} placeholder={ui("Sem limite")} /></div> : null}
                <div className="grid gap-1.5"><Label htmlFor="c-min">{ui("Valor mínimo da cobrança (R$)")}</Label><Input id="c-min" inputMode="decimal" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} placeholder={ui("Sem mínimo")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="c-start">{ui("Válido a partir de")}</Label><Input id="c-start" type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="c-end">{ui("Válido até")}</Label><Input id="c-end" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="c-lim">{ui("Limite total de usos")}</Label><Input id="c-lim" inputMode="numeric" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value.replace(/\D/g, "") })} placeholder={ui("Ilimitado")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="c-per">{ui("Usos por cliente")}</Label><Input id="c-per" inputMode="numeric" value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value.replace(/\D/g, "") })} placeholder={ui("Ilimitado")} /></div>
              </div>
              <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3 text-sm">
                <span><span className="font-medium">{ui("Devolver o uso em caso de reembolso")}</span><span className="block text-muted-foreground">{ui("Se ativado, um pagamento reembolsado libera novamente uma utilização.")}</span></span>
                <Switch checked={form.restoreOnRefund} onCheckedChange={(v) => setForm({ ...form, restoreOnRefund: v })} />
              </label>
              <DialogFooter><Button type="button" variant="ghost" onClick={() => setForm(null)}>{ui("Cancelar")}</Button><Button type="submit" disabled={saveMut.isPending}>{saveMut.isPending ? ui("Salvando...") : ui("Salvar cupom")}</Button></DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
