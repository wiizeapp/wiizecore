import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, BellRing, CalendarDays, CheckCircle2, CreditCard, Eye, FileCheck2, FileSignature, Landmark, QrCode, RefreshCw, Send, Settings2, ShieldCheck, TrendingUp, UserRound, Users, Wallet, Workflow } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { PublicPage } from "@/components/public-site";
import { FeatureDemo, FeatureVisual, type FeatureVisualKind } from "@/components/home/feature-visual";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

export type ResourcePageConfig = { eyebrow: string; title: string; highlight: string; description: string; visual: FeatureVisualKind; steps: Array<{ title: string; description: string }>; sectionTitle: string; sectionDescription: string; benefits: string[]; faqs: Array<[string, string]>; heroImage?: string; sectionImages?: string[]; heroDemo?: ReactNode; heroFloats?: HeroFloats; sectionVisuals?: ReactNode[] };
const icons = { payments: Wallet, recurring: RefreshCw, contracts: FileSignature, links: BellRing, finance: Wallet, customers: Users, crm: Workflow } satisfies Record<FeatureVisualKind, typeof Wallet>;

type HeroFloats = { orbit: [typeof Wallet, typeof Wallet]; left: { icon: typeof Wallet; label: string; value: string }; chip: { icon: typeof Wallet; label: string }; note: [string, string] };
const heroFloats: Record<FeatureVisualKind, HeroFloats> = {
  payments: { orbit: [QrCode, CreditCard], left: { icon: QrCode, label: "Pagamento recebido", value: "+ R$ 2.500,00" }, chip: { icon: ShieldCheck, label: "Operação protegida" }, note: ["Taxas transparentes", "Valor líquido calculado"] },
  recurring: { orbit: [RefreshCw, Landmark], left: { icon: CalendarDays, label: "Ciclo de outubro", value: "R$ 890,00" }, chip: { icon: ShieldCheck, label: "Autorizado pelo banco" }, note: ["Próxima cobrança", "12 de outubro"] },
  contracts: { orbit: [FileSignature, FileCheck2], left: { icon: FileSignature, label: "Assinatura registrada", value: "Hoje, 10:18" }, chip: { icon: FileCheck2, label: "Documento validado" }, note: ["Cobrança vinculada", "Contrato #0248"] },
  links: { orbit: [BellRing, Send], left: { icon: BellRing, label: "Lembrete enviado", value: "via WhatsApp" }, chip: { icon: Eye, label: "Cliente visualizou" }, note: ["Próximo aviso", "Amanhã, 09:00"] },
  finance: { orbit: [Wallet, TrendingUp], left: { icon: Wallet, label: "Disponível para saque", value: "R$ 12.500,00" }, chip: { icon: CheckCircle2, label: "Saldo conferido" }, note: ["Recebido no mês", "R$ 24.320,00"] },
  customers: { orbit: [UserRound, Users], left: { icon: UserRound, label: "Novo cliente", value: "Empresa Horizonte" }, chip: { icon: ShieldCheck, label: "Dados protegidos" }, note: ["Histórico completo", "12 atividades"] },
  crm: { orbit: [Workflow, RefreshCw], left: { icon: Workflow, label: "Negócio ganho", value: "R$ 4.200,00" }, chip: { icon: RefreshCw, label: "CRM Wiize sincronizado" }, note: ["Pagamento aprovado", "Etapa atualizada"] },
};

function ResourceHeroPreview({ kind, label, demo, floatsOverride }: { kind: FeatureVisualKind; label: string; demo?: ReactNode; floatsOverride?: HeroFloats | undefined }) {
  const { t: ui } = useTranslation("ui");
  const floats = floatsOverride ?? heroFloats[kind];
  const [OrbitLeft, OrbitRight] = floats.orbit;
  const LeftIcon = floats.left.icon;
  const ChipIcon = floats.chip.icon;
  return (
    <div className="resource-hero-stage relative mt-12 w-full max-w-6xl" role="img" aria-label={label}>
      <div className="payment-beam" aria-hidden="true" />
      <div className="payment-orbit payment-orbit-left" aria-hidden="true"><OrbitLeft className="size-4" /></div>
      <div className="payment-orbit payment-orbit-right" aria-hidden="true"><OrbitRight className="size-4" /></div>
      <div className="payment-dashboard resource-hero-window relative z-10 mx-auto w-[94%] overflow-hidden rounded-lg text-left sm:w-[72%]">
        <div className="h-[31rem]">{demo ?? <FeatureDemo kind={kind} />}</div>
        <div className="payment-dashboard-fade" aria-hidden="true" />
      </div>
      <div className="payment-float payment-float-left absolute bottom-9 left-[-4%] z-20 hidden items-center gap-3 rounded-lg border border-border bg-card/90 p-3 text-left shadow-float backdrop-blur-xl sm:flex" aria-hidden="true">
        <span className="grid size-8 place-items-center rounded-md bg-accent text-primary"><LeftIcon className="size-4" /></span><div><p className="text-[10px] text-muted-foreground">{ui(floats.left.label)}</p><p className="numeric-tabular text-sm font-semibold text-primary">{floats.left.value}</p></div>
      </div>
      <div className="payment-float payment-float-right absolute right-[-3%] top-6 z-20 hidden items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs font-medium shadow-float backdrop-blur-xl sm:flex" aria-hidden="true"><ChipIcon className="size-4 text-primary" />{ui(floats.chip.label)}</div>
      <div className="payment-float payment-float-center absolute bottom-8 right-[-4%] z-20 hidden rounded-lg border border-border bg-card/90 px-3 py-2 text-left shadow-float backdrop-blur-xl md:block" aria-hidden="true"><p className="text-[10px] text-muted-foreground">{ui(floats.note[0])}</p><p className="text-xs font-semibold">{ui(floats.note[1])}</p></div>
    </div>
  );
}

export function ResourcePage({ config }: { config: ResourcePageConfig }) {
  const { t: ui } = useTranslation("ui");
  const localized = {
    ...config,
    eyebrow: ui(config.eyebrow),
    title: ui(config.title),
    highlight: ui(config.highlight),
    description: ui(config.description),
    sectionTitle: ui(config.sectionTitle),
    sectionDescription: ui(config.sectionDescription),
    steps: config.steps.map((step) => ({ title: ui(step.title), description: ui(step.description) })),
    benefits: config.benefits.map((benefit) => ui(benefit)),
    faqs: config.faqs.map(([question, answer]) => [ui(question), ui(answer)] as [string, string]),
  };
  config = localized;
  const Icon = icons[config.visual];
  const stepIcons = [Settings2, Send, TrendingUp];
  const detailSections = [
    {
      eyebrow: ui("Visão completa"),
      title: config.sectionTitle,
      description: config.sectionDescription,
      points: config.benefits.slice(0, 2),
    },
    {
      eyebrow: ui("Execução organizada"),
      title: config.steps[1]?.title ?? "Tudo conectado à operação",
       description: `${config.steps[1]?.description ?? config.description} ${ui("Cada ação permanece ligada ao cliente e ao serviço, facilitando a conferência do que aconteceu e do que ainda precisa de atenção.")}`,
       points: [config.benefits[2], ui("Histórico acessível durante toda a jornada")].filter(Boolean),
    },
    {
      eyebrow: ui("Acompanhamento contínuo"),
      title: config.steps[2]?.title ?? "Acompanhe cada etapa",
       description: `${config.steps[2]?.description ?? config.description} ${ui("Assim, sua equipe identifica o estado atual da operação e toma a próxima decisão com mais clareza.")}`,
       points: [config.benefits[3], ui("Informações reunidas em uma única visão")].filter(Boolean),
    },
  ];

  return <PublicPage><main>
    <section className="hero-payment relative overflow-hidden border-b border-border">
      <div className="section-shell relative z-10 flex flex-col items-center pb-5 pt-10 text-center sm:pt-12 lg:pt-14">
        <div>
          <h1 className="hero-title mx-auto max-w-6xl text-3xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl"><span className="block">{config.title}</span><span className="hero-shine mt-1 block sm:whitespace-nowrap">{config.highlight}</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{config.description}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3"><Button asChild size="lg"><Link to="/auth" search={{ modo: "criar" }}>{ui("Começar agora")} <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline"><Link to="/taxas">{ui("Ver taxas")}</Link></Button></div>
        </div>
         {config.heroImage
           ? <img src={config.heroImage} alt={ui("Demonstração principal de {{resource}}", { resource: config.eyebrow })} width={1600} height={1200} className="mt-10 w-full max-w-5xl rounded-xl border border-border shadow-float" />
           : <ResourceHeroPreview kind={config.visual} demo={config.heroDemo} floatsOverride={config.heroFloats} label={ui("Demonstração principal de {{resource}}", { resource: config.eyebrow })} />}
      </div>
    </section>
    <section className="border-b border-border bg-surface"><div className="section-shell py-16 lg:py-24"><div className="mx-auto max-w-5xl text-center"><p className="text-xs font-bold uppercase text-primary">{ui("Como funciona")}</p><h2 className="mt-3 text-3xl font-semibold sm:text-5xl">{ui("Três passos.")} <span className="hero-shine inline-block sm:whitespace-nowrap">{ui("Uma jornada conectada.")}</span></h2><p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">{ui("Da configuração ao resultado, cada etapa fica visível.")}</p></div><ol className="resource-flow mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-3 md:gap-6">{config.steps.map((step, index) => { const StepIcon = stepIcons[index] ?? CheckCircle2; return <li key={step.title} className="resource-step relative flex min-h-56 flex-col border border-border bg-card p-6 shadow-card"><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-lg bg-accent text-primary"><StepIcon className="size-5" /></span><span className="font-display text-sm font-semibold text-primary">0{index + 1}</span></div><h3 className="mt-8 text-xl font-semibold">{step.title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</p>{index < config.steps.length - 1 ? <span className="resource-step-arrow absolute z-10 grid size-9 place-items-center rounded-full border border-primary/30 bg-background text-primary shadow-card" aria-hidden="true"><ArrowRight className="hidden size-4 md:block" /><ArrowDown className="size-4 md:hidden" /></span> : null}</li>; })}</ol></div></section>
    <section className="py-20 lg:py-28" aria-label={ui("Detalhes de {{resource}}", { resource: config.eyebrow })}><div className="section-shell space-y-20 lg:space-y-28">{detailSections.map((section, index) => <article key={`${section.eyebrow}-${section.title}`} className="resource-detail grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16"><div data-reveal={index % 2 === 0 ? "left" : "right"} className={`min-w-0 ${index % 2 === 1 ? "lg:order-2" : ""}`}><span className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground"><Icon className="size-6" /></span><p className="mt-6 text-xs font-bold uppercase text-primary">{section.eyebrow}</p><h2 className="mt-3 max-w-xl text-3xl font-semibold sm:text-4xl">{section.title}</h2><p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">{section.description}</p><ul className="mt-7 grid gap-3">{section.points.map((point) => <li key={point} className="flex items-start gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-primary"><CheckCircle2 className="size-3.5" /></span><span className="pt-0.5">{point}</span></li>)}</ul></div><div data-reveal={index % 2 === 0 ? "right" : "left"} className={`min-w-0 overflow-hidden rounded-lg shadow-float ${index % 2 === 1 ? "lg:order-1" : ""}`}>{config.sectionVisuals?.[index] ? <div className={`feature-visual feature-visual-${(index % 3) + 1} relative isolate h-[30rem] overflow-hidden sm:h-[32rem]`}><div className="feature-visual-grid absolute inset-0" aria-hidden="true" /><div className="feature-visual-glow absolute inset-0" aria-hidden="true" /><div className="absolute inset-x-0 top-0 -bottom-8 z-10 flex justify-center px-3 pt-6 sm:px-6 lg:px-8"><div className="h-full w-full max-w-2xl [&>*]:h-full">{config.sectionVisuals[index]}</div></div><div className="feature-visual-bottom-fade absolute inset-x-0 bottom-0 z-20 h-20 sm:h-24" aria-hidden="true" /></div> : config.sectionImages?.[index] ? <img src={config.sectionImages[index]} alt={`${section.eyebrow}: ${config.eyebrow}`} width={1600} height={1200} loading="lazy" className="h-full w-full object-cover" /> : <FeatureVisual kind={config.visual} variation={index + 1} scene={index + 1} label={`${section.eyebrow}: ${config.eyebrow}`} />}</div></article>)}</div></section>
    <section className="border-y border-border bg-surface"><div className="section-shell grid gap-10 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:py-20"><div><p className="text-xs font-bold uppercase text-primary">{ui("Perguntas frequentes")}</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{ui("Tudo claro sobre {{resource}}.", { resource: config.eyebrow.toLowerCase() })}</h2></div><Accordion type="single" collapsible>{config.faqs.map(([question, answer], index) => <AccordionItem key={question} value={`faq-${index}`}><AccordionTrigger className="text-left text-base">{question}</AccordionTrigger><AccordionContent className="pr-8 leading-6 text-muted-foreground">{answer}</AccordionContent></AccordionItem>)}</Accordion></div></section>
    <section className="premium-cta relative isolate overflow-hidden border-y border-border px-5 py-16 text-center sm:px-10 sm:py-20 lg:py-24" aria-label={ui("Comece com a Wiize Core")}>
          <div className="premium-cta-glow absolute inset-0 -z-10" aria-hidden="true" />
          <div className="premium-cta-grid absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase text-primary"><span className="size-1.5 rounded-full bg-primary" />{ui("Comece com a Wiize Core")}</span>
            <h2 className="mt-5 text-2xl font-semibold leading-[1.2] text-foreground sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">{ui("Você chegou no fim da página...")}</h2>
            <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">{ui("Se chegou até aqui, é porque tá interessado.\nEntão vai lá, faz logo o cadastro.")}</p>
            <Button asChild size="lg" className="premium-cta-button mt-8 min-w-56 px-8 text-base">
              <Link to="/auth" search={{ modo: "criar" }}>{ui("Vai, clica nesse botão\n")} <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="premium-cta-edge absolute inset-x-[8%] bottom-0 h-px" aria-hidden="true" />
    </section>
  </main></PublicPage>;
}
