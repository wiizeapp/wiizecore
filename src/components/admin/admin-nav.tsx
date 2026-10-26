import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownUp, BadgeCheck, Banknote, Building2, ChevronRight, CircleDollarSign, ClipboardCheck, FileText, Gauge, KeyRound,
  LayoutDashboard, LifeBuoy, ListChecks, Percent, Receipt, RotateCcw, ScrollText, Settings, ShieldAlert, ShieldCheck, TrendingDown,
  TrendingUp, UserCog, Users, Wallet, Inbox, Scale, CreditCard, Briefcase, PieChart, FlaskConical, Lightbulb,
} from "lucide-react";

export type AdminSection =
  | "dashboard" | "unit" | "regua" | "simulador" | "visao" | "transacoes" | "receitas" | "despesas" | "taxas" | "contas" | "receber" | "pagar" | "conciliacao"
  | "pagamentos" | "cobrancas" | "clientes" | "faturas" | "saques" | "chargebacks" | "estornos"
  | "empresas" | "publico" | "analise" | "aprovacoes" | "suporte" | "auditoria"
  | "configuracoes" | "permissoes" | "admins" | "caixa" | "sugestoes" | "pld";

type Item = { id: AdminSection; label: string; icon: typeof Users };
export const ADMIN_GROUPS: { id: string; label: string; icon: typeof Users; items: Item[] }[] = [
  { id: "financeiro", label: "Financeiro", icon: CircleDollarSign, items: [
    { id: "visao", label: "Visão financeira", icon: Wallet },
    { id: "unit", label: "Unit Economics", icon: PieChart },
    { id: "simulador", label: "Simulador de TPV", icon: FlaskConical },
    { id: "regua", label: "Lembretes de cobrança", icon: ListChecks },
    { id: "transacoes", label: "Transações", icon: ArrowDownUp },
    { id: "receitas", label: "Receitas", icon: TrendingUp },
    { id: "despesas", label: "Despesas", icon: TrendingDown },
    { id: "taxas", label: "Taxas", icon: Percent },
    { id: "contas", label: "Contas", icon: Banknote },
    { id: "receber", label: "Contas a receber", icon: ListChecks },
    { id: "pagar", label: "Contas a pagar", icon: ListChecks },
    { id: "conciliacao", label: "Conciliação", icon: Scale },
  ] },
  { id: "wiizepay", label: "WiizePay", icon: CreditCard, items: [
    { id: "pagamentos", label: "Pagamentos", icon: Receipt },
    { id: "cobrancas", label: "Cobranças", icon: FileText },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "faturas", label: "Faturas e notas", icon: ScrollText },
    { id: "saques", label: "Saques", icon: Gauge },
    { id: "chargebacks", label: "Chargebacks", icon: ShieldAlert },
    { id: "estornos", label: "Estornos", icon: RotateCcw },
  ] },
  { id: "operacao", label: "Operação", icon: Briefcase, items: [
    { id: "empresas", label: "Usuários e empresas", icon: Building2 },
    { id: "publico", label: "Perfil dos clientes", icon: PieChart },
    { id: "analise", label: "Contas em análise", icon: BadgeCheck },
    { id: "aprovacoes", label: "Aprovações", icon: ClipboardCheck },
    { id: "caixa", label: "Caixa de entrada", icon: Inbox },
    { id: "sugestoes", label: "Sugestões de usuários", icon: Lightbulb },
    { id: "suporte", label: "Suporte", icon: LifeBuoy },
    { id: "auditoria", label: "Auditoria e Segurança", icon: ShieldCheck },
    { id: "pld", label: "Prevenção à lavagem de dinheiro", icon: ShieldAlert },
  ] },
  { id: "administracao", label: "Administração", icon: Settings, items: [
    { id: "configuracoes", label: "Configurações", icon: Settings },
    { id: "permissoes", label: "Permissões", icon: KeyRound },
    { id: "admins", label: "Usuários admin", icon: UserCog },
  ] },
];

export const ADMIN_LABELS: Record<AdminSection, string> = {
  dashboard: "Dashboard",
  ...Object.fromEntries(ADMIN_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label]))),
} as Record<AdminSection, string>;

export function useAdminSection(): AdminSection {
  const s = useRouterState({ select: (st) => (st.location.search as { secao?: string }).secao });
  return (s && s in ADMIN_LABELS ? s : "dashboard") as AdminSection;
}

export function AdminNav({ expanded: sidebarExpanded, linkClass }: { expanded: boolean; linkClass: (active: boolean, nested?: boolean) => string }) {
  const current = useAdminSection();
  const [open, setOpen] = useState<string[]>(() => ADMIN_GROUPS.filter((g) => g.items.some((i) => i.id === current)).map((g) => g.id));
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <>
      <div className="sidebar-section-divider" aria-hidden="true"><span>Visão geral</span></div>
      <Link to="/nimda" search={{ secao: "dashboard" }} className={linkClass(current === "dashboard")} title={!sidebarExpanded ? "Dashboard" : undefined}>
        <span className="sidebar-icon-slot"><LayoutDashboard className="sidebar-animated-icon" strokeWidth={1.8} /></span>
        <span className="sidebar-item-label">Dashboard</span>
      </Link>
      <div className="sidebar-section-divider" aria-hidden="true"><span>Admin</span></div>
      {ADMIN_GROUPS.map((g) => {
        const active = g.items.some((i) => i.id === current);
        const isOpen = open.includes(g.id);
        return (
          <div key={g.id} data-sidebar-group>
            <button type="button" className={`${linkClass(active)} font-normal`} onClick={() => toggle(g.id)} title={!sidebarExpanded ? g.label : undefined} aria-expanded={isOpen}>
              <span className="sidebar-icon-slot"><g.icon className="sidebar-animated-icon" strokeWidth={1.8} /></span>
              <span className="sidebar-item-label flex-1 text-left">{g.label}</span>
              <ChevronRight className={`sidebar-group-chevron ${isOpen ? "rotate-90" : ""}`} />
            </button>
            <div className={`sidebar-submenu ${isOpen ? "is-open" : ""}`}><div><div className="sidebar-submenu-inner">
              {g.items.map((i) => (
                <Link key={i.id} to="/nimda" search={{ secao: i.id }} className={linkClass(current === i.id, true)}>
                  <span className="sidebar-icon-slot"><i.icon className="sidebar-animated-icon" strokeWidth={1.8} /></span>
                  <span className="sidebar-item-label">{i.label}</span>
                </Link>
              ))}
            </div></div></div>
          </div>
        );
      })}
    </>
  );
}
