import { BRAND_CONFIG, LEGAL_PUBLISHED_AT, LEGAL_UPDATED_AT, LEGAL_VERSION, supportMailto } from "@/lib/brand-config";
import { PublicPage } from "@/components/public-site";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Building2,
  Clock3,
  Cookie,
  Database,
  FileCheck2,
  Fingerprint,
  Gavel,
  Landmark,
  LifeBuoy,
  Link2,
  LockKeyhole,
  Mail,
  RefreshCcw,
  Scale,
  ShieldCheck,
  UserCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const legalIcons = {
  acceptance: FileCheck2,
  account: UserCheck,
  business: Building2,
  cookies: Cookie,
  data: Database,
  disputes: Gavel,
  eligibility: BadgeCheck,
  intellectual: BookOpenText,
  lawful: Scale,
  payments: WalletCards,
  privacy: Fingerprint,
  retention: Clock3,
  security: LockKeyhole,
  sharing: Users,
  support: LifeBuoy,
  transfers: Landmark,
  updates: RefreshCcw,
} satisfies Record<string, LucideIcon>;

export type LegalIconName = keyof typeof legalIcons;
export type LegalSection = {
  title: string;
  paragraphs: string[];
  icon?: LegalIconName;
  bullets?: string[];
  note?: string;
};
export type LegalHighlight = { title: string; description: string; icon: LegalIconName };

function sectionId(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[0-9]+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function LegalPage({ eyebrow, title, description, sections, highlights = [] }: { eyebrow: string; title: string; description: string; sections: LegalSection[]; highlights?: LegalHighlight[] }) {
  const { t: ui, i18n } = useTranslation("ui");
  const translated = i18n.language !== "pt-BR";
  eyebrow = ui(eyebrow);
  title = ui(title);
  description = ui(description);
  highlights = highlights.map((item) => ({ ...item, title: ui(item.title), description: ui(item.description) }));
  sections = sections.map((section) => ({
    ...section,
    title: ui(section.title),
    paragraphs: section.paragraphs.map((paragraph) => ui(paragraph)),
    ...(section.bullets ? { bullets: section.bullets.map((bullet) => ui(bullet)) } : {}),
    ...(section.note ? { note: ui(section.note) } : {}),
  }));
  return (
    <PublicPage>
      <main className="bg-surface/45">
        <section className="border-b border-border bg-background">
          <div className="section-shell py-12 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-accent px-3 py-1.5 text-xs font-bold uppercase text-accent-foreground">
                  <ShieldCheck className="h-4 w-4" />{eyebrow}
                </div>
                <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">{title}</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{description}</p>
              </div>
              <div className="grid min-w-64 gap-2 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground shadow-card">
                 <span className="flex justify-between gap-8"><strong className="text-foreground">{ui("Versão")}</strong>{LEGAL_VERSION}</span>
                 <span className="flex justify-between gap-8"><strong className="text-foreground">{ui("Publicação")}</strong>{LEGAL_PUBLISHED_AT}</span>
                 <span className="flex justify-between gap-8"><strong className="text-foreground">{ui("Atualização")}</strong>{LEGAL_UPDATED_AT}</span>
              </div>
            </div>
            {highlights.length > 0 && <div className="mt-10 grid gap-3 md:grid-cols-3">{highlights.map((item) => { const Icon = legalIcons[item.icon]; return <article key={item.title} className="group min-h-44 rounded-lg border border-border bg-card p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></div><h2 className="mt-5 font-semibold">{item.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p></article>; })}</div>}
          </div>
        </section>

        <div className="section-shell grid gap-8 py-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:py-14">
          <aside className="hidden lg:block">
            <nav aria-label="Índice" className="sticky top-24 rounded-lg border border-border bg-card p-4 shadow-card">
               <p className="px-3 text-xs font-bold uppercase text-muted-foreground">{ui("Neste documento")}</p>
              <div className="mt-3 grid gap-1">{sections.map((section) => <a key={section.title} href={`#${sectionId(section.title)}`} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">{section.title}</a>)}</div>
            </nav>
          </aside>

          <article className="min-w-0 space-y-5">
             {translated ? <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-accent p-5 text-sm leading-6 text-accent-foreground"><Scale className="mt-0.5 h-5 w-5 shrink-0" /><p>{ui("Esta tradução é apenas uma referência. Em caso de divergência, prevalece a versão em português brasileiro, que deve ser revisada por profissional habilitado.")}</p></div> : <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-accent p-5 text-sm leading-6 text-accent-foreground"><Scale className="mt-0.5 h-5 w-5 shrink-0" /><p>{ui("Este documento foi estruturado para transparência e prevenção de conflitos. Ele não substitui orientação jurídica e deve ser revisado por profissional habilitado antes da publicação definitiva.")}</p></div>}
            {sections.map((section) => { const Icon = legalIcons[section.icon ?? "lawful"]; return <section id={sectionId(section.title)} key={section.title} className="scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-card sm:p-7"><div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><Icon className="h-5 w-5" /></div><div className="min-w-0"><h2 className="text-xl font-semibold leading-7">{section.title}</h2><div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul className="grid gap-2 pt-1">{section.bullets.map((bullet) => <li key={bullet} className="grid grid-cols-[auto_1fr] gap-3"><ArrowRight className="mt-1.5 h-3.5 w-3.5 text-primary" /><span>{bullet}</span></li>)}</ul>}{section.note && <div className="mt-4 rounded-md border-l-4 border-primary bg-surface p-4 font-medium text-foreground">{section.note}</div>}</div></div></div></section>; })}
             <section id="contato" className="rounded-lg bg-secondary p-6 sm:p-8"><div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-2 text-primary"><Mail className="h-5 w-5"/><span className="text-xs font-bold uppercase">{ui("Canal oficial")}</span></div><h2 className="mt-3 text-2xl font-semibold">{ui("Precisa falar sobre este documento?")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{ui("Dúvidas e solicitações podem ser enviadas exclusivamente para")} <a className="font-medium text-primary hover:underline" href={supportMailto(title)}>{BRAND_CONFIG.contactEmail}</a>.</p></div><Button asChild><a href={supportMailto(title)}>{ui("Falar com o suporte")} <ArrowRight className="h-4 w-4" /></a></Button></div></section>
             <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" />{ui("Links internos levam diretamente ao capítulo selecionado.")}</div>
          </article>
        </div>
      </main>
    </PublicPage>
  );
}