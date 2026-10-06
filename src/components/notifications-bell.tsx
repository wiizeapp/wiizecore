import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bell, BellOff, Check, CheckCheck, ChevronRight, CircleDollarSign, FileText, Landmark,
  ShieldCheck, TrendingUp, Wallet, AlertTriangle, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActivationNotice } from "@/components/activation-notice";

type Item = { id: string; kind?: string | null; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; admin?: boolean };

// Destino e visual por tipo; o link salvo na notificação continua valendo como alternativa.
function meta(kind: string | null | undefined): { icon: LucideIcon; tone: string; to?: string; label: string } {
  const k = kind ?? "";
  if (k.startsWith("payment.")) return { icon: CircleDollarSign, tone: "bg-primary/10 text-primary", to: "/cobrancas", label: "Ver cobranças" };
  if (k.startsWith("balance.")) return { icon: Wallet, tone: "bg-primary/10 text-primary", to: "/financeiro", label: "Ver saldo e saque" };
  if (k.startsWith("withdrawal.")) return { icon: Landmark, tone: "bg-destructive/10 text-destructive", to: "/financeiro", label: "Ver saques" };
  if (k.startsWith("anticipation.")) return { icon: TrendingUp, tone: "bg-accent text-accent-foreground", to: "/antecipacao", label: "Ver antecipação" };
  if (k.startsWith("invoice.")) return { icon: FileText, tone: "bg-accent text-accent-foreground", label: "Ver nota fiscal" };
  if (k.startsWith("limit.")) return { icon: AlertTriangle, tone: "bg-accent text-accent-foreground", to: "/limites", label: "Ver limites" };
  if (k.startsWith("security") || k.startsWith("mfa")) return { icon: ShieldCheck, tone: "bg-destructive/10 text-destructive", to: "/seguranca", label: "Ver segurança" };
  return { icon: Bell, tone: "bg-muted text-muted-foreground", label: "Abrir" };
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function NotificationsBell({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const { data } = useQuery({
    queryKey: ["notifications", tenantId],
    refetchInterval: 60_000,
    queryFn: async () =>
      ((await supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(30)).data ?? []) as Item[],
  });
  const { data: adminData } = useQuery({
    queryKey: ["platform-notifications"],
    refetchInterval: 60_000,
    queryFn: async () =>
      ((await supabase.from("platform_notifications").select("id, kind, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false }).limit(20)).data ?? []) as Item[],
  });

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${tenantId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["notifications", tenantId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tenantId, qc]);

  const all: Item[] = [...(data ?? []), ...(adminData ?? []).map((n) => ({ ...n, admin: true }))]
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  const unread = all.filter((n) => !n.read_at).length;
  const list = tab === "unread" ? all.filter((n) => !n.read_at) : all;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["notifications", tenantId] });
    void qc.invalidateQueries({ queryKey: ["platform-notifications"] });
  }
  function optimistic(ids: string[] | null) {
    const now = new Date().toISOString();
    const upd = (rows?: Item[]) => rows?.map((r) => (!ids || ids.includes(r.id)) && !r.read_at ? { ...r, read_at: now } : r);
    qc.setQueryData<Item[]>(["notifications", tenantId], upd);
    qc.setQueryData<Item[]>(["platform-notifications"], upd);
  }
  async function markRead(n: Item) {
    if (n.read_at) return;
    optimistic([n.id]);
    if (n.admin) await supabase.from("platform_notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    else await supabase.rpc("mark_notifications_read", { _tenant_id: tenantId, _ids: [n.id] });
    refresh();
  }
  async function markAll() {
    optimistic(null);
    await supabase.rpc("mark_notifications_read", { _tenant_id: tenantId });
    if (adminData?.some((n) => !n.read_at)) await supabase.from("platform_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    refresh();
  }
  function openItem(n: Item) {
    void markRead(n);
    const to = n.link || meta(n.kind).to;
    if (!to) return;
    setOpen(false);
    void navigate({ to });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] overflow-hidden rounded-xl p-0 shadow-xl">
        <div className="border-b border-border px-4 pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Notificações</p>
              <p className="text-xs text-muted-foreground">{unread ? `${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Tudo em dia"}</p>
            </div>
            {unread > 0 ? (
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={markAll}>
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex gap-1">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                {t === "all" ? "Todas" : `Não lidas${unread ? ` (${unread})` : ""}`}
              </button>
            ))}
          </div>
        </div>
        <div className="border-b border-border p-3 empty:hidden"><ActivationNotice tenantId={tenantId} compact /></div>
        <ul className="max-h-[420px] overflow-y-auto">
          {list.map((n) => {
            const m = meta(n.kind);
            const Icon = m.icon;
            const to = n.link || m.to;
            return (
              <li key={n.id} className="group relative border-b border-border last:border-0">
                <button type="button" onClick={() => openItem(n)}
                  className={`flex w-full gap-3 px-4 py-3 pr-12 text-left transition-colors hover:bg-muted/60 ${n.read_at ? "" : "bg-primary/[0.04]"}`}>
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m.tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-sm ${n.read_at ? "font-medium text-muted-foreground" : "font-semibold"}`}>{n.title}</span>
                      {n.admin ? <span className="rounded bg-primary/10 px-1 text-[9px] font-semibold uppercase text-primary">Admin</span> : null}
                    </span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {timeAgo(n.created_at)}
                      {to ? <span className="inline-flex items-center font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">{m.label}<ChevronRight className="h-3 w-3" /></span> : null}
                    </span>
                  </span>
                </button>
                {!n.read_at ? (
                  <>
                    <span className="pointer-events-none absolute right-5 top-4 h-2 w-2 rounded-full bg-primary group-hover:opacity-0" />
                    <button type="button" aria-label="Marcar como lida" title="Marcar como lida" onClick={() => void markRead(n)}
                      className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition hover:bg-background hover:text-primary group-hover:opacity-100 focus:opacity-100">
                      <Check className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
          {!list.length ? (
            <li className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"><BellOff className="h-5 w-5 text-muted-foreground" /></span>
              <p className="text-sm font-medium">{tab === "unread" ? "Nenhuma não lida" : "Nenhuma notificação"}</p>
              <p className="text-xs text-muted-foreground">Avisos de pagamentos, saldo e saques aparecem aqui.</p>
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
