import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Palette, UserRoundCheck, BarChart3, BellRing, ChevronDown, FileSignature, Headphones, Link2, Menu, MessageCircle, RefreshCw, Users, Workflow } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher, useLanguageBootstrap } from "@/components/language-switcher";

const SUPPORT_URL = "https://www.wiize.com.br/contato";

export const resourceLinks = [
  { to: "/cobrancas-e-pagamentos", key: "charges", label: "Cobranças e pagamentos", description: "Links, Pix, boleto e cartão", icon: Link2 },
  { to: "/pix-automatico", key: "pixAuto", label: "Pix Automático", description: "Recorrência autorizada pelo banco", icon: RefreshCw },
  { to: "/contratos-digitais", key: "contracts", label: "Contratos digitais", description: "Assinatura conectada à cobrança", icon: FileSignature },
  { to: "/gestao-financeira", key: "finance", label: "Gestão financeira", description: "Entradas, saídas e contas", icon: BarChart3 },
  { to: "/checkout-com-sua-marca", key: "checkout", label: "Checkout personalizado", description: "Sua marca na página de pagamento", icon: Palette },
  { to: "/portal-do-cliente", key: "portal", label: "Portal do cliente", description: "Recibos, contratos e documentos", icon: UserRoundCheck },
  { to: "/gestao-de-clientes", key: "customers", label: "Gestão de clientes", description: "Dados e histórico organizados", icon: Users },
  { to: "/integracao-crm-wiize", key: "crm", label: "Integração CRM Wiize", description: "Negociação e pagamento conectados", icon: Workflow },
  { to: "/lembretes-de-cobranca", key: "reminders", label: "Lembretes de cobrança", description: "Vencimentos sempre no radar", icon: BellRing },
] as const;

const publicLinks = [
  { to: "/taxas", key: "fees", label: "Taxas" },
  { to: "/prazos", key: "terms", label: "Prazos" },
  { to: "/seguranca-e-confianca", key: "security", label: "Segurança" },
] as const;

/** Menu Recursos: abre ao passar o mouse, fica aberto ao entrar no painel e só fecha após um pequeno atraso. */
function useNavLabels() {
  const { t } = useTranslation("navigation");
  const res = (k: string) => t(`items.${k}`, { returnObjects: true }) as unknown as [string, string];
  return { t, res };
}

function ResourcesMenu() {
  const { t, res } = useNavLabels();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const show = () => { cancelClose(); setOpen(true); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 220); };
  useEffect(() => cancelClose, []);
  return (
    <div
      className="relative"
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-medium" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t("resources")} <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} /></Button>
      {/* Ponte invisível entre o botão e o painel para o mouse não "cair" no vão. */}
      {open ? <div className="absolute left-0 top-full h-12 w-full" aria-hidden="true" /> : null}
      <div className={`fixed left-1/2 top-[84px] w-[min(72rem,calc(100vw-1.5rem))] -translate-x-1/2 pt-3 transition-opacity duration-200 sm:top-[88px] sm:w-[min(72rem,calc(100vw-2.5rem))] lg:top-[100px] ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} onMouseEnter={show}>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-float">
          {resourceLinks.map((item) => <Link key={item.to} to={item.to} preload="intent" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} className="group/item flex min-w-0 gap-3 rounded-md p-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-primary transition-colors group-hover/item:bg-primary group-hover/item:text-primary-foreground"><item.icon className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{res(item.key)[0]}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{res(item.key)[1]}</span></span></Link>)}
        </div>
      </div>
    </div>
  );
}

export function PublicHeader() {
  const { t, res } = useNavLabels();
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-6xl items-center justify-between gap-2 rounded-[var(--radius-xl)] border border-border/70 bg-background/85 px-3 shadow-float backdrop-blur-xl sm:gap-3 sm:px-4 lg:h-[5.25rem] lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-6">
        <div className="hidden min-w-0 justify-self-start lg:block">
          <nav className="flex items-center gap-1" aria-label={t("mainNav")}>
            <ResourcesMenu />
            {publicLinks.map((item) => <Button key={item.to} asChild variant="ghost" size="sm" className="text-sm"><Link to={item.to} preload="intent">{t(item.key)}</Link></Button>)}
          </nav>
        </div>
        <Link to="/" aria-label={t("home")} className="scale-105 lg:justify-self-center"><Brand /></Link>
        <div className="flex items-center gap-2 sm:gap-3 lg:justify-self-end">
          <LanguageSwitcher />
          <Button asChild className="hidden sm:inline-flex"><Link to="/auth" preload="intent">{t("access")} <ArrowRight /></Link></Button>
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")}><Menu /></Button></SheetTrigger>
            <SheetContent className="dark w-[min(22rem,88vw)] border-border bg-background text-foreground">
              <SheetHeader className="text-left"><SheetTitle>{t("menuTitle")}</SheetTitle></SheetHeader>
              <nav className="mt-8 grid gap-2" aria-label={t("mobileNav")}>
                <p className="px-3 pt-2 text-xs font-bold uppercase text-muted-foreground">{t("resources")}</p>
                {resourceLinks.map((item) => <SheetClose key={item.to} asChild><Button asChild variant="ghost" className="h-auto justify-start py-2.5"><Link to={item.to} preload="intent"><item.icon className="size-4 text-primary" />{res(item.key)[0]}</Link></Button></SheetClose>)}
                <div className="my-2 border-t border-border" />
                {publicLinks.map((item) => <SheetClose key={item.to} asChild><Button asChild variant="ghost" className="justify-start"><Link to={item.to} preload="intent">{t(item.key)}</Link></Button></SheetClose>)}
                <SheetClose asChild><Button asChild className="mt-3"><Link to="/auth" preload="intent">{t("access")} <ArrowRight /></Link></Button></SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useTranslation("footer");
  const { t: tn } = useTranslation("navigation");
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 py-12 sm:grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
        <div>
          <Brand compact />
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t("tagline")}</p>
          <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href={SUPPORT_URL} target="_blank" rel="noreferrer"><Headphones className="h-4 w-4" />{t("support")}</a>
        </div>
        <div>
          <p className="text-sm font-semibold">{t("product")}</p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <Link to="/taxas" className="hover:text-foreground">{tn("fees")}</Link><Link to="/prazos" className="hover:text-foreground">{tn("terms")}</Link><Link to="/seguranca-e-confianca" className="hover:text-foreground">{tn("security")}</Link><a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">{t("supportShort")}</a>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">{t("legal")}</p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <Link to="/termos-de-uso" className="hover:text-foreground">{t("termsOfUse")}</Link><Link to="/politica-de-privacidade" className="hover:text-foreground">{t("privacy")}</Link><Link to="/politica-de-pagamentos" className="hover:text-foreground">{t("payments")}</Link><Link to="/politica-de-cancelamento-e-reembolso" className="hover:text-foreground">{t("refund")}</Link><Link to="/politica-de-cookies" className="hover:text-foreground">{t("cookies")}</Link>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 border-t border-border px-5 py-5 text-center text-xs text-muted-foreground sm:flex-row sm:gap-4"><span>{t("rights")}</span><LanguageSwitcher align="start" /></div>
    </footer>
  );
}

export function PublicPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useLanguageBootstrap();
  useRevealOnScroll();
  const { t } = useTranslation("footer");
  return <div className={`${loading || !user ? "dark" : ""} min-h-screen bg-background text-foreground`}><PublicHeader />{children}<PublicFooter /><Button asChild size="icon" className="fixed bottom-5 right-5 z-40 size-12 rounded-full shadow-float sm:bottom-7 sm:right-7" aria-label={t("support")}><a href={SUPPORT_URL} target="_blank" rel="noreferrer"><MessageCircle className="size-5" /></a></Button></div>;
}
/** Revela seções e cartões após o hero, sem animar o conteúdo interno. */
function useRevealOnScroll() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section:not(:first-child)"));
    const items: HTMLElement[] = [];
    sections.forEach((section) => {
      if (section.matches("[data-reveal='none'], #depoimentos, .premium-cta")) return;
      const isFeaturesSection = section.dataset["reveal"] === "features";
      if (!isFeaturesSection) {
        section.classList.add("reveal-item", "reveal-section");
        section.style.setProperty("--reveal-delay", "0ms");
        items.push(section);
      }
      const cardCandidates = Array.from(section.querySelectorAll<HTMLElement>("article, [class*='shadow-card'], [class*='shadow-float']"))
        .filter((el) => !el.closest("[data-reveal='none'], [aria-hidden='true']"));
      const cards = cardCandidates.filter((card) => !cardCandidates.some((parent) => parent !== card && parent.contains(card)));
      cards.slice(0, 32).forEach((card, index) => {
        card.classList.add("reveal-item", "reveal-card");
        card.classList.add(isFeaturesSection ? (index % 2 === 0 ? "reveal-card-right" : "reveal-card-left") : "reveal-card-up");
        card.style.setProperty("--reveal-delay", `${80 + Math.min(index % 4, 3) * 70}ms`);
        items.push(card);
      });
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.04 });
    items.forEach((el) => io.observe(el));
    document.documentElement.classList.add("reveal-on");
    return () => { io.disconnect(); document.documentElement.classList.remove("reveal-on"); items.forEach((el) => el.classList.add("is-visible")); };
  }, []);
}
