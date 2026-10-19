import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Palette, UserRoundCheck, BarChart3, BellRing, ChevronDown, FileSignature, Headphones, Link2, Menu, MessageCircle, RefreshCw, Users, Workflow } from "lucide-react";
import { Brand } from "@/components/brand";
import { AsaasSeal } from "@/components/financial-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  { to: "/sobre", key: "about", label: "Sobre nós" },
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
      <Button variant="ghost" size="sm" className="gap-2 text-sm font-bold" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t("resources")} <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} /></Button>
      {/* Ponte invisível entre o botão e o painel para o mouse não "cair" no vão. */}
      {open ? <div className="absolute left-0 top-full h-12 w-full" aria-hidden="true" /> : null}
      <div className={`fixed left-1/2 top-[62px] w-[calc(min(80rem,100vw)_-_2.5rem)] -translate-x-1/2 pt-3 transition-opacity duration-200 sm:top-[64px] lg:top-[72px] lg:w-[calc(min(80rem,100vw)_-_4rem)] ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} onMouseEnter={show}>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-float">
          {resourceLinks.map((item) => <Link key={item.to} to={item.to} preload="intent" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} className="group/item flex min-w-0 gap-3 rounded-md p-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-primary transition-colors group-hover/item:bg-primary group-hover/item:text-primary-foreground"><item.icon className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{res(item.key)[0]}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{res(item.key)[1]}</span></span></Link>)}
        </div>
      </div>
    </div>
  );
}

function MobileMenu() {
  const { t, res } = useNavLabels();
  const [open, setOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(value) => { setOpen(value); if (!value) setResourcesOpen(false); }}>
      <SheetTrigger asChild><Button variant="ghost" size="icon" className="xl:hidden" aria-label={t("openMenu")}><Menu /></Button></SheetTrigger>
      <SheetContent side="right" className="dark inset-0 h-[100dvh] w-full max-w-none overflow-y-auto border-0 bg-background text-foreground sm:max-w-none">
        <SheetHeader className="text-left">
          <SheetTitle className="sr-only">{t("menuTitle")}</SheetTitle>
          <SheetClose asChild><Link to="/" aria-label={t("home")} className="inline-flex w-fit"><Brand size="lg" /></Link></SheetClose>
        </SheetHeader>
        <nav className="mt-8 grid gap-2" aria-label={t("mobileNav")}>
          <Button variant="ghost" className="justify-between" aria-expanded={resourcesOpen} onClick={() => setResourcesOpen((v) => !v)}>
            {t("resources")} <ChevronDown className={`transition-transform ${resourcesOpen ? "rotate-180" : ""}`} />
          </Button>
          {resourcesOpen ? <div className="grid gap-1 pl-2">
            {resourceLinks.map((item) => <SheetClose key={item.to} asChild><Button asChild variant="ghost" className="h-auto justify-start py-2.5"><Link to={item.to} preload="intent"><item.icon className="size-4 text-primary" />{res(item.key)[0]}</Link></Button></SheetClose>)}
          </div> : null}
          {publicLinks.map((item) => <SheetClose key={item.to} asChild><Button asChild variant="ghost" className="justify-start"><Link to={item.to} preload="intent" activeProps={{ className: "bg-accent text-accent-foreground", "aria-current": "page" }}>{t(item.key)}</Link></Button></SheetClose>)}
          <SheetClose asChild><Button asChild className="mt-3 font-bold"><Link to="/auth" preload="intent" data-analytics-event="cta_clicked" data-analytics-name="access" data-analytics-location="mobile_menu"><strong className="font-bold">{t("access")}</strong> <ArrowRight /></Link></Button></SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function PublicHeader() {
  const { t } = useNavLabels();
  return (
    <header className="relative z-40 mx-auto w-full max-w-[80rem] px-5 pt-2.5 sm:pt-3 lg:px-8">
      <div className="flex h-[3.25rem] w-full items-center justify-between gap-2 rounded-[var(--radius-xl)] border border-border/70 bg-background/85 px-2 shadow-float backdrop-blur-xl sm:gap-3 sm:px-3 lg:h-[3.75rem] lg:px-4">
        <Link to="/" aria-label={t("home")} className="flex shrink-0 items-center justify-self-start"><Brand size="lg" className="max-[380px]:gap-1.5 max-[380px]:[&_img]:size-7 max-[380px]:[&>span]:text-lg" /></Link>
        <nav className="hidden min-w-0 items-center justify-center gap-2 xl:flex 2xl:gap-3 [&>a]:px-3 [&>div>button]:px-3" aria-label={t("mainNav")}>
          <ResourcesMenu />
          {publicLinks.map((item) => <Button key={item.to} asChild variant="ghost" size="sm" className="text-sm"><Link to={item.to} preload="intent" activeProps={{ className: "bg-accent text-accent-foreground", "aria-current": "page" }}>{t(item.key)}</Link></Button>)}
        </nav>
        <div className="flex items-center justify-self-end gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Button asChild className="hidden font-bold sm:inline-flex"><Link to="/auth" preload="intent" data-analytics-event="cta_clicked" data-analytics-name="access" data-analytics-location="navbar"><strong className="font-bold">{t("access")}</strong> <ArrowRight /></Link></Button>
          <MobileMenu />

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
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-8 gap-y-8 px-5 py-10 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="col-span-2 md:col-span-1">
          <Brand />
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t("tagline")}</p>
          <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href={SUPPORT_URL} target="_blank" rel="noreferrer"><Headphones className="h-4 w-4" />{t("support")}</a>
        </div>
        <div>
          <p className="text-sm font-semibold">{t("product")}</p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <Link to="/sobre" className="hover:text-foreground">{t("about")}</Link><Link to="/taxas" className="hover:text-foreground" data-analytics-event="navigation_clicked" data-analytics-name="pricing" data-analytics-location="footer">{tn("fees")}</Link><Link to="/prazos" className="hover:text-foreground">{tn("terms")}</Link><Link to="/seguranca-e-confianca" className="hover:text-foreground">{tn("security")}</Link><Link to="/ajuda" className="hover:text-foreground">Central de Ajuda</Link>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">{t("legal")}</p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <Link to="/termos-de-uso" className="hover:text-foreground">{t("termsOfUse")}</Link><Link to="/politica-de-privacidade" className="hover:text-foreground">{t("privacy")}</Link><Link to="/politica-de-pagamentos" className="hover:text-foreground">{t("payments")}</Link><Link to="/politica-de-cancelamento-e-reembolso" className="hover:text-foreground">{t("refund")}</Link><Link to="/politica-de-cookies" className="hover:text-foreground">{t("cookies")}</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-border"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left lg:px-8"><span>{t("rights")}</span><AsaasSeal /></div></div>
    </footer>
  );
}

export function PublicPage({ children, followTheme = false }: { children: React.ReactNode; followTheme?: boolean }) {
    useLanguageBootstrap();
  useRevealOnScroll();
  const dark = usePublicDarkDocument(followTheme);
  const { t } = useTranslation("footer");
  return <div className={`public-site ${dark ? "dark" : ""} min-h-screen bg-background text-foreground`}><PublicHeader />{children}<PublicFooter /><Button asChild size="icon" className="fixed bottom-5 right-5 z-40 size-12 rounded-full shadow-float sm:bottom-7 sm:right-7" aria-label={t("support")}><a href={SUPPORT_URL} target="_blank" rel="noreferrer"><MessageCircle className="size-5" /></a></Button></div>;
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

/** Public pages stay dark unless opted into the saved theme; restore the document on exit. */
function usePublicDarkDocument(followTheme: boolean) {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const choice = window.localStorage.getItem("wiize-theme");
      const isDark = !followTheme || (choice !== "light" && (choice !== "system" || media.matches));
      setDark(isDark);
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    };
    update();
    window.addEventListener("wiize-theme-change", update);
    window.addEventListener("storage", update);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("wiize-theme-change", update);
      window.removeEventListener("storage", update);
      media.removeEventListener("change", update);
      root.classList.toggle("dark", hadDark);
      root.style.colorScheme = prevScheme;
    };
  }, [followTheme]);
  return dark;
}
