import { getSecurityStatus } from "@/lib/security.functions";
import { ActivationProductionIndicator } from "@/components/activation-production-indicator";
import { Plug, Percent, Palette, FolderOpen, TicketPercent, Handshake, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMyAccess, trackActivity } from "@/lib/team.functions";
import { PAGE_PERMISSION } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  PiggyBank,
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  FileSignature,
  Gauge,
  Receipt,
  LayoutDashboard,
  LogOut,
  TriangleAlert,
  Menu,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
  FileText,
  ListChecks,
  UsersRound,
  MessagesSquare,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { registerSession } from "@/lib/workspace.functions";
import { syncBalances } from "@/lib/finance.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationsBell } from "@/components/notifications-bell";
import { PrivacyToggle, usePrivacyKey } from "@/components/privacy-toggle";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { EnvironmentSwitch } from "@/components/environment-switch";
import { AdminNav } from "@/components/admin/admin-nav";
import { useLanguageBootstrap } from "@/components/language-switcher";

type AppPath = "/painel" | "/clientes" | "/servicos" | "/contratos" | "/cobrancas" | "/contestacoes" | "/lembrete-de-cobranca" | "/notas-fiscais" | "/financas" | "/financeiro" | "/extrato" | "/recebiveis" | "/limites" | "/antecipacao" | "/multas-e-encargos" | "/configuracoes" | "/checkout-personalizado" | "/ativacao" | "/seguranca" | "/equipe" | "/integracoes" | "/integracao-externa" | "/documentos" | "/cupons" | "/coproducoes" | "/ajuda";

const operationItems = [
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/servicos", label: "Serviços", icon: Package },
  { to: "/contratos", label: "Contratos", icon: FileSignature },
  { to: "/documentos", label: "Arquivos e documentos", icon: FolderOpen },
] satisfies Array<{ to: AppPath; label: string; icon: typeof Users }>;

const managementItems = [
  { to: "/financas", label: "Gestão financeira", icon: PiggyBank },
  { to: "/notas-fiscais", label: "Notas Fiscais", icon: FileText },
] satisfies Array<{ to: AppPath; label: string; icon: typeof Users }>;

const chargesGroup = { id: "cobrancas", label: "Cobranças", icon: Receipt, children: [
  { to: "/cobrancas", label: "Central de Cobranças", icon: Receipt },
  { to: "/contestacoes", label: "Central de Contestações", icon: ShieldCheck },
  { to: "/lembrete-de-cobranca", label: "Lembrete inteligente", icon: MessagesSquare },
  { to: "/cupons", label: "Cupons & Incentivos", icon: TicketPercent },
  { to: "/coproducoes", label: "Coproduções", icon: Handshake },
] } satisfies { id: string; label: string; icon: typeof Users; children: Array<{ to: AppPath; label: string; icon: typeof Users }> };

const groupedItems = [
  { id: "financeiro", label: "Financeiro", icon: CircleDollarSign, children: [
    { to: "/financeiro", label: "Visão financeira", icon: Wallet },
    { to: "/extrato", label: "Extrato completo", icon: ListChecks },
    { to: "/recebiveis", label: "Recebíveis", icon: ListChecks },
    { to: "/limites", label: "Limites de saque", icon: Gauge },
    { to: "/antecipacao", label: "Receba mais rápido", icon: Zap },
    { to: "/multas-e-encargos", label: "Multas e encargos", icon: Percent },
  ] },
  { id: "configuracoes", label: "Configurações", icon: Settings, children: [
    { to: "/configuracoes", label: "Dados e conta", icon: Settings },
    { to: "/checkout-personalizado", label: "Aparência do checkout", icon: Palette },
    { to: "/ativacao", label: "Ativar pagamentos", icon: BadgeCheck },
    { to: "/seguranca", label: "Segurança", icon: ShieldCheck },
    { to: "/equipe", label: "Equipe e permissões", icon: UsersRound },
  ] },
  { id: "integracoes", label: "Integrações", icon: Plug, children: [
    { to: "/integracoes", label: "Integrações gerais", icon: Plug },
    { to: "/integracao-externa", label: "API e desenvolvedores", icon: KeyRound },
  ] },
] satisfies Array<{ id: string; label: string; icon: typeof Wallet; children: Array<{ to: AppPath; label: string; icon: typeof Wallet }> }>;

export function AppShell({ children }: { children: ReactNode }) {
  const { t: ui } = useTranslation("ui");
  useLanguageBootstrap();
  const privacyKey = usePrivacyKey();
  const { data: workspace } = useWorkspace();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    if (["/financeiro", "/extrato", "/limites", "/antecipacao", "/multas-e-encargos"].some((path) => pathname.startsWith(path))) return ["financeiro"];
    if (["/cobrancas", "/contestacoes", "/lembrete-de-cobranca", "/cupons", "/coproducoes"].some((path) => pathname.startsWith(path))) return ["cobrancas"];
    if (["/configuracoes", "/checkout-personalizado", "/ativacao", "/seguranca", "/equipe"].some((path) => pathname.startsWith(path))) return ["configuracoes"];
    if (["/integracoes", "/integracao-externa"].some((path) => pathname.startsWith(path))) return ["integracoes"];
    return [];
  });
  const register = useServerFn(registerSession);
  const sync = useServerFn(syncBalances);
  const sidebarExpanded = open || sidebarHovered;
  useEffect(() => {
    if (!sidebarExpanded) setExpandedGroups([]);
  }, [sidebarExpanded]);
  const profileImage = typeof user?.user_metadata?.["avatar_url"] === "string"
    ? user.user_metadata["avatar_url"]
    : typeof user?.user_metadata?.["picture"] === "string"
      ? user.user_metadata["picture"]
      : undefined;
  const fullName = typeof user?.user_metadata?.["full_name"] === "string" ? user.user_metadata["full_name"] : undefined;
  const profileName = fullName || workspace?.tenantName || user?.email?.split("@")[0] || "Conta WiizePay";
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "WP";

  useEffect(() => {
    void register({});
  }, [register]);

  useEffect(() => {
    document.documentElement.classList.add("internal-app-active");
    return () => document.documentElement.classList.remove("internal-app-active");
  }, []);

  const fetchSecurity = useServerFn(getSecurityStatus);
  const { data: security } = useQuery({
    queryKey: ["security-lock"],
    queryFn: () => fetchSecurity(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const lockedUntil = security?.financialPasswordLockedUntil ?? null;
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);
  const lockRemainingMs = lockedUntil ? new Date(lockedUntil).getTime() - nowTick : 0;

  const fetchAccess = useServerFn(getMyAccess);
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => fetchAccess(), staleTime: 60_000 });
  const allowed = (item: { to: string }) => {
    const need = PAGE_PERMISSION[item.to];
    return !need || !access || access.permissions.includes(need);
  };
  const track = useServerFn(trackActivity);
  const lastPing = useRef(Date.now());
  useEffect(() => {
    const ping = () => {
      const now = Date.now();
      const seconds = document.visibilityState === "visible" ? Math.round((now - lastPing.current) / 1000) : 0;
      lastPing.current = now;
      void track({ data: { path: window.location.pathname, seconds } }).catch(() => undefined);
    };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [track, pathname]);

  useEffect(() => {
    if (workspace?.tenantId) void sync({}).catch(() => undefined);
  }, [workspace?.tenantId, sync]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => () => {
    if (sidebarCloseTimer.current) clearTimeout(sidebarCloseTimer.current);
    if (groupScrollTimer.current) clearTimeout(groupScrollTimer.current);
  }, []);

  const navLinkClass = (active: boolean, nested = false) =>
    `sidebar-nav-item group ${nested ? "sidebar-nav-item-nested" : ""} ${active ? "is-active" : ""}`;

  const expandSidebar = () => {
    if (sidebarCloseTimer.current) clearTimeout(sidebarCloseTimer.current);
    setSidebarHovered(true);
  };

  const collapseSidebar = () => {
    if (sidebarCloseTimer.current) clearTimeout(sidebarCloseTimer.current);
    sidebarCloseTimer.current = setTimeout(() => setSidebarHovered(false), 110);
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups((groups) => (groups.includes(id) ? groups.filter((group) => group !== id) : [...groups, id]));
  };

  const renderGroup = (group: { id: string; label: string; icon: typeof Users; children: Array<{ to: AppPath; label: string; icon: typeof Users }> }) => {
    const children = group.children.filter(allowed);
    if (!children.length) return null;

            const childActive = group.children.some((item) => pathname.startsWith(item.to));
            const expanded = sidebarExpanded && expandedGroups.includes(group.id);
            const active = childActive && !expanded;
            return <div key={group.id} data-sidebar-group>
              <Button variant="ghost" type="button" className={`${navLinkClass(active)} font-normal`} onClick={() => toggleGroup(group.id)} title={!sidebarExpanded ? ui(group.label) : undefined} aria-expanded={expanded}>
                <span className="sidebar-icon-slot"><group.icon className="sidebar-animated-icon" strokeWidth={1.8} /></span>
                <span className="sidebar-item-label flex-1 text-left">{ui(group.label)}</span>
                <ChevronRight className={`sidebar-group-chevron ${expanded ? "rotate-90" : ""}`} />
              </Button>
              <div className={`sidebar-submenu ${expanded ? "is-open" : ""}`}><div><div className="sidebar-submenu-inner">
                {children.map((item) => <Link key={item.to} to={item.to} className={navLinkClass(pathname.startsWith(item.to), true)}><span className="sidebar-icon-slot"><item.icon className="sidebar-animated-icon" strokeWidth={1.8} /></span><span className="sidebar-item-label">{ui(item.label)}</span></Link>)}
              </div></div></div>
            </div>;
  };

  if (lockedUntil && lockRemainingMs > 0) {
    const mins = Math.floor(lockRemainingMs / 60000);
    const secs = Math.floor((lockRemainingMs % 60000) / 1000);
    return (
      <div className="internal-app flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-2xl text-destructive">!</div>
          <h1 className="text-xl font-semibold text-foreground">{ui("Sistema bloqueado por segurança")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {ui("A senha financeira foi digitada errado 3 vezes seguidas nesta empresa. Para proteger o dinheiro, o acesso de todos os usuários ficou bloqueado temporariamente.")}
          </p>
          <p className="mt-6 font-mono text-3xl font-semibold tabular-nums text-foreground">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{ui("Se não foi você, troque sua senha de acesso assim que o bloqueio terminar.")}</p>
          <button type="button" onClick={() => void signOut()} className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline">
            {ui("Sair da conta")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="internal-app flex min-h-screen bg-background">
      {open ? <button type="button" aria-label={ui("Fechar menu")} className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside
        data-expanded={sidebarExpanded}
         className={`app-sidebar fixed inset-y-0 left-0 z-40 h-dvh w-[260px] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex lg:translate-x-0 ${sidebarExpanded ? "lg:w-[260px]" : "lg:w-[65px]"} ${
          open ? "flex translate-x-0" : "hidden -translate-x-full"
        }`}
        onMouseEnter={expandSidebar}
        onMouseLeave={collapseSidebar}
      >
        <div className="app-sidebar-brand">
          <Link to="/painel" className="grid w-full place-items-start overflow-hidden" title="WiizePay"><Brand compact={!sidebarExpanded} beta /></Link>
        </div>
        <div className="sidebar-brand-divider" aria-hidden="true" />
        <nav className="app-sidebar-nav" onClickCapture={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const trigger = target.closest('button[aria-expanded="false"]');
          const group = trigger?.closest<HTMLElement>("[data-sidebar-group]");
          if (!group) return;
          const nav = event.currentTarget;
          if (groupScrollTimer.current) clearTimeout(groupScrollTimer.current);
          groupScrollTimer.current = setTimeout(() => {
            if (!group.isConnected || nav.scrollHeight <= nav.clientHeight) return;
            const bounds = nav.getBoundingClientRect();
            const content = group.getBoundingClientRect();
            const delta = content.height > bounds.height - 16 || content.top < bounds.top + 8
              ? content.top - bounds.top - 8
              : content.bottom > bounds.bottom - 8 ? content.bottom - bounds.bottom + 8 : 0;
            if (Math.abs(delta) > 1) nav.scrollBy({ top: delta, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          }, 240);
        }}>
          {pathname.startsWith("/nimda") ? <AdminNav expanded={sidebarExpanded} linkClass={navLinkClass} /> : <>
          <Link to="/painel" className={navLinkClass(pathname.startsWith("/painel"))} title={!sidebarExpanded ? "Dashboard" : undefined}>
            <span className="sidebar-icon-slot"><LayoutDashboard className="sidebar-animated-icon" strokeWidth={1.8} /></span>
            <span className="sidebar-item-label">{ui("Dashboard")}</span>
          </Link>

          <div className="sidebar-section-divider" aria-hidden="true">
            <span>{ui("Operação")}</span>
          </div>
          {operationItems.filter(allowed).map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={navLinkClass(active)}
                title={!sidebarExpanded ? ui(item.label) : undefined}
              >
                <span className="sidebar-icon-slot"><item.icon className="sidebar-animated-icon" strokeWidth={1.8} /></span>
                <span className="sidebar-item-label">{ui(item.label)}</span>
              </Link>
            );
          })}
          {renderGroup(chargesGroup)}

          <div className="sidebar-section-divider" aria-hidden="true">
            <span>{ui("Gestão")}</span>
          </div>
          {managementItems.filter(allowed).map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={navLinkClass(active)}
                title={!sidebarExpanded ? ui(item.label) : undefined}
              >
                <span className="sidebar-icon-slot"><item.icon className="sidebar-animated-icon" strokeWidth={1.8} /></span>
                <span className="sidebar-item-label">{ui(item.label)}</span>
              </Link>
            );
          })}
          {groupedItems.map(renderGroup)}
          </>}
        </nav>

        <div className="app-sidebar-footer">
          <Link to="/perfil" preload="intent" title={ui("Meu perfil")} className="sidebar-profile rounded-lg transition-colors hover:bg-sidebar-accent/60">
            <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary font-display text-xs font-bold text-primary-foreground">
              {profileImage ? <img src={profileImage} alt={`Foto de ${profileName}`} className="size-full object-cover" /> : <span aria-hidden="true">{profileInitials}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-sidebar-foreground">{profileName}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{user?.email ?? ""}</p>
            </div>
          </Link>
          <div className="sidebar-theme flex flex-nowrap items-center gap-1.5"><ThemeToggle /><EnvironmentSwitch /></div>
          <Link to="/ajuda" className={`${navLinkClass(pathname.startsWith("/ajuda"))} sidebar-help`} title={!sidebarExpanded ? ui("Central de Ajuda") : undefined}>
            <span className="sidebar-icon-slot"><BookOpen className="sidebar-animated-icon" strokeWidth={1.8} /></span>
            <span className="sidebar-item-label">{ui("Central de Ajuda")}</span>
          </Link>
          <button
            type="button"
            className="sidebar-nav-item sidebar-logout group"
            title={ui("Sair")}
            aria-label={ui("Sair")}
            onClick={async () => {
              await signOut();
              void navigate({ to: "/auth" });
            }}
          >
            <span className="sidebar-icon-slot"><LogOut className="sidebar-animated-icon" strokeWidth={1.8} /></span>
            <span className="sidebar-item-label">{ui("Sair")}</span>
          </button>
        </div>
      </aside>

       <div className="flex min-w-0 flex-1 flex-col lg:ml-[65px]">
         <header className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 py-2 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label={ui("Abrir menu")}>
              <Menu className="h-5 w-5" />
            </Button>
            {workspace ? (
              workspace.providerStatus === "connected" ? (
                <Badge className="max-w-full truncate" variant="default">
                  {ui(workspace.providerEnvironment === "production" ? "Pagamentos ativos" : "Pagamentos em teste")}
                </Badge>
              ) : (
                <Link to="/ativacao" className="flex min-w-0 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-primary/15" title={ui("Ative sua conta para começar a receber pagamentos.")}>
                  <TriangleAlert className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate">{ui("Pagamentos não conectados")}</span>
                  <span className="hidden shrink-0 font-semibold text-primary sm:inline">· {ui("Ativar conta")} →</span>
                </Link>
              )
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3">
            {workspace && !workspace.hasFinancialPassword ? (
              <Badge variant="outline" className="hidden sm:inline-flex">{ui("Senha financeira pendente")}</Badge>
            ) : null}
            <PrivacyToggle />
            {workspace?.tenantId ? <><ActivationProductionIndicator /><NotificationsBell tenantId={workspace.tenantId} /></> : null}
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/cobrancas" search={{ nova: true }}><Plus className="size-4" />{ui("Criar cobrança")}</Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 py-6 lg:py-8"><div key={privacyKey} className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 xl:px-8">{children}</div></main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 title={title} className="line-clamp-2 break-words font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
