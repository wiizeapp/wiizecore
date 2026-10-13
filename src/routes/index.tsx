import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Briefcase, CircleDollarSign, FileText, Palette, Receipt, Repeat, CheckCircle2, CreditCard, FileSignature, Landmark, LayoutDashboard, Link2, QrCode, ShieldCheck, Users, UserRoundCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PublicPage } from "@/components/public-site";
import { FeatureMarquee } from "@/components/feature-marquee";
import type { ReactNode } from "react";
import { FeatureVisual, type FeatureVisualKind } from "@/components/home/feature-visual";
import { OperationFlow, HowItWorksSection, ComparisonSection, AudienceSection } from "@/components/home/landing-sections";
import { formatBRL } from "@/lib/format";
import { ChargesPremium, ClientsPremium, ServicesPremium, CheckoutPremium, InvoicesPremium, PortalPremium } from "@/components/home/premium-visuals";
import { useTranslation } from "react-i18next";

function PortalVisual() {
  return <PortalPremium scene={1} />;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
       { title: "WiizePay — gestão financeira e recebimentos para empresas de serviços" },
      {
        name: "description",
        content:
          "Clientes, serviços, cobranças, recebimentos, contratos, notas fiscais e controle financeiro em uma única plataforma para empresas de serviços.",
      },
       { property: "og:title", content: "WiizePay — gestão financeira e recebimentos para empresas de serviços" },
      {
        property: "og:description",
        content: "Venda seus serviços, organize suas cobranças e controle seus recebimentos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const featureGroups: Array<{ icon: typeof Wallet; tag: string; title: string; visual: FeatureVisualKind | (() => ReactNode); description: string; points: string[] }> = [
  { icon: Users, tag: "Clientes", title: "Seus clientes também fazem parte do seu financeiro.", visual: ClientsPremium, description: "Cada cliente reúne seus dados, cobranças, pagamentos e contratos. Você sabe exatamente quem pagou, quem deve e o histórico de cada relação.", points: ["Cadastro completo", "Total pago e em aberto", "Histórico do cliente", "Contratos vinculados"] },
  { icon: Briefcase, tag: "Serviços", title: "Organize os serviços que sua empresa vende.", visual: ServicesPremium, description: "Cadastre seus serviços com valor fixo ou personalizado e use-os ao criar cobranças. Você sabe quanto cada serviço vende e recebe.", points: ["Valor fixo ou personalizado", "Uso direto na cobrança", "Ticket médio por serviço", "Arquivar serviços antigos"] },
  { icon: FileSignature, tag: "Contratos", title: "Contrato e cobrança no mesmo fluxo.", visual: "contracts", description: "Envie o contrato, acompanhe a assinatura e siga com a cobrança. O pagamento só é liberado depois que o contratante assina.", points: ["Contratos digitais", "Assinatura na página de pagamento", "Histórico por cliente", "Certificado de assinatura"] },
  { icon: Receipt, tag: "Gestão de cobranças", title: "Tenha suas cobranças sob controle.", visual: ChargesPremium, description: "Crie cobranças, acompanhe vencimentos e veja o status de cada pagamento em uma única lista.", points: ["Pagas, pendentes e vencidas", "Cobranças avulsas e recorrentes", "Status atualizado sozinho", "Histórico de cada cobrança"] },
  { icon: Wallet, tag: "Pagamentos", title: "Receba do jeito que seu cliente prefere", visual: "payments", description: "Pix, boleto e cartão de crédito na mesma cobrança, com confirmação automática e saldo atualizado assim que o pagamento é compensado.", points: ["Pix com confirmação na hora", "Boleto bancário", "Cartão à vista ou parcelado", "Taxas claras antes de cobrar"] },
  { icon: Repeat, tag: "Recorrência", title: "Pix recorrente, estilo débito automático", visual: "recurring", description: "Seu cliente autoriza uma única vez e as mensalidades são cobradas automaticamente, sem boletos esquecidos nem cobranças manuais.", points: ["Autorização única pelo banco", "Cobranças mensais automáticas", "Acompanhamento de cada parcela", "Menos inadimplência"] },
  { icon: Palette, tag: "Checkout personalizado", title: "Um checkout com a identidade da sua empresa.", visual: CheckoutPremium, description: "Dê aos seus clientes uma experiência de pagamento com sua logo e suas cores, mostrando o serviço, o valor e as formas de pagamento disponíveis.", points: ["Logo e cores da empresa", "Um link por cobrança", "Pix, boleto e cartão", "Ambiente protegido"] },
  { icon: UserRoundCheck, tag: "Portal do cliente", title: "Um portal para seu cliente resolver tudo sozinho.", visual: PortalVisual, description: "Depois do primeiro pagamento, seu cliente acessa com e-mail e CPF para baixar recibos, ver contratos assinados, abrir documentos e pagar as próximas cobranças, sem precisar te chamar.", points: ["Recibos em PDF na hora", "Contratos e todas as versões", "Documentos enviados por você", "Feito para o celular"] },
  { icon: Link2, tag: "Lembretes de cobrança", title: "Sua cobrança acompanha cada vencimento.", visual: "links", description: "Envie um link pronto por WhatsApp ou e-mail e deixe os lembretes de vencimento trabalharem por você.", points: ["Aviso antes do vencimento", "Lembrete no dia", "Avisos em atraso", "Param quando o cliente paga"] },
  { icon: FileText, tag: "Nota fiscal", title: "Financeiro e nota fiscal na mesma operação.", visual: InvoicesPremium, description: "Emita notas fiscais de serviço a partir das cobranças e acompanhe o status de cada uma, conforme a configuração fiscal da sua empresa.", points: ["Emissão a partir da cobrança", "Status de cada nota", "Notas organizadas", "Ligadas ao financeiro"] },
];

const faqs = [
  ["O que é a WiizePay?", "Uma plataforma para empresas de serviços organizarem clientes, serviços, cobranças, recebimentos, contratos, notas fiscais e o financeiro em um só lugar."],
  ["Quais formas de pagamento estão disponíveis?", "Pix, Pix Automático, boleto e cartão de crédito, conforme a configuração da sua conta."],
  ["Posso criar contratos e enviar para assinatura?", "Sim. Você cria o contrato, envia para assinatura eletrônica e acompanha quem já assinou."],
  ["Posso emitir nota fiscal?", "Sim, notas fiscais de serviço conforme a configuração fiscal da sua empresa."],
  ["Como funcionam as taxas?", "As taxas aparecem antes de cobrar. A página de taxas mostra as regras vigentes e um simulador."],
];

function Landing() {
  const { t: ui } = useTranslation("ui");
  return (
    <PublicPage footerStart={
      <section className="premium-cta public-brand-surface relative isolate overflow-hidden px-5 py-16 text-center sm:px-10 sm:py-20 lg:py-24" aria-label={ui("Comece com a WiizePay")}>
        <div className="premium-cta-grid absolute inset-0 -z-10" aria-hidden="true" />
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase text-primary"><span className="size-1.5 rounded-full bg-primary" />{ui("Comece com a WiizePay")}</span>
          <h2 className="mt-5 text-2xl font-semibold leading-[1.2] text-foreground sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">{ui("Você chegou no fim da página...")}</h2>
          <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">{ui("Se chegou até aqui, é porque tá interessado.\nEntão vai lá, faz logo o cadastro.")}</p>
          <Button asChild size="lg" className="premium-cta-button mt-8 min-w-56 px-8 text-base">
            <Link to="/auth" search={{ modo: "criar" }}>{ui("Vai, clica nesse botão\n")} <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    }>
      <main>
        <section className="hero-payment relative overflow-hidden border-b border-border">
          <div className="section-shell relative z-10 flex flex-col items-center pb-5 pt-10 text-center sm:pt-12 lg:pt-14">
            <div>
              <h1 className="hero-title mx-auto mt-7 max-w-4xl text-[clamp(1.75rem,6.5vw,3.5rem)] font-semibold leading-[1.08]"><span className="block">{ui("A plataforma financeira")}</span><span className="hero-shine block">{ui("para empresas de serviços.")}</span></h1>
              <p className="mx-auto mt-5 max-w-xl text-balance text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{ui("Cobranças, contratos, notas fiscais e financeiro da sua empresa de serviços em um só lugar.")}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3"><Button asChild size="lg"><Link to="/auth" search={{ modo: "criar" }}>{ui("Começar agora")} <ArrowRight className="size-4" /></Link></Button><Button asChild size="lg" variant="outline"><a href="#plataforma">{ui("Conhecer a plataforma")}</a></Button></div>
            </div>
            <ProductPreview />
          </div>
        </section>
        <FeatureMarquee />

        <OperationFlow />
        <HowItWorksSection />
        <ComparisonSection />

        <section data-reveal="features" className="section-shell py-20 lg:py-28" aria-label={ui("Funcionalidades")}>
          <div className="mx-auto max-w-2xl text-center"><p className="section-kicker">{ui("Funcionalidades")}</p><h2 className="mt-2 text-3xl font-semibold sm:text-5xl">{ui("Tudo para cobrar e receber")} <span className="hero-shine">{ui("seus serviços.")}</span></h2><p className="mt-4 text-base leading-7 text-muted-foreground">{ui("Do contrato ao dinheiro na conta, com as formas de pagamento que seu cliente prefere.")}</p></div>
          <div className="mt-14 space-y-14 lg:space-y-20">
            {featureGroups.map((group, index) => (
              <article key={group.tag} data-reveal={index % 2 === 0 ? "left" : "right"} className="grid overflow-hidden rounded-lg border border-border bg-card shadow-card lg:min-h-[32rem] lg:grid-cols-2 lg:items-stretch">
                <div className={`flex min-w-0 flex-col justify-center px-5 py-5 sm:px-8 sm:py-5 lg:justify-start lg:px-9 lg:pb-5 lg:pt-11 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                  <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground"><group.icon className="size-6" /></span>
                  <span className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground"><span className="size-1.5 rounded-full bg-primary-foreground" />{ui(group.tag)}</span>
                  <h3 className="mt-4 text-2xl font-semibold sm:text-3xl">{ui(group.title)}</h3>
                  <p className="mt-3 text-base leading-7 text-muted-foreground">{ui(group.description)}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {group.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 rounded-lg border border-border bg-surface/60 p-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><CheckCircle2 className="size-3.5" /></span>{ui(point)}</li>
                    ))}
                  </ul>
                </div>
                <div className={`min-w-0 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
                  {typeof group.visual === "string"
                    ? <FeatureVisual kind={group.visual} variation={(index % 3) + 1} label={`Demonstração da funcionalidade ${group.title}`} />
                    : (
                      <div className={`feature-visual feature-visual-${(index % 3) + 1} relative isolate h-full min-h-[27rem] overflow-hidden sm:min-h-[30rem] lg:min-h-[32rem]`} role="img" aria-label={`Demonstração da funcionalidade ${group.title}`}>
                        <div className="feature-visual-grid absolute inset-0" aria-hidden="true" />
                        <div className="feature-visual-glow absolute inset-0" aria-hidden="true" />
                        <div className="absolute inset-x-0 top-0 -bottom-8 z-10 flex justify-center px-3 pt-5 sm:px-5 lg:px-7">
                          <div className="feature-demo-stage h-full w-full max-w-2xl" data-visible="true">
                            <div className="h-full w-full [&>*]:h-full [&>*]:shadow-card"><group.visual /></div>
                          </div>
                        </div>
                        <div className="feature-visual-bottom-fade absolute inset-x-0 bottom-0 z-20 h-20 sm:h-24" aria-hidden="true" />
                      </div>
                    )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <AudienceSection />


        <section className="section-shell grid gap-12 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-20"><div><p className="section-kicker">{ui("Perguntas frequentes")}</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{ui("Informação clara")} <span className="hero-shine">{ui("antes de começar.")}</span></h2></div><Accordion type="single" collapsible>{faqs.map(([question = "",answer = ""], index) => <AccordionItem key={question} value={`faq-${index}`}><AccordionTrigger className="text-base">{ui(question)}</AccordionTrigger><AccordionContent className="pr-8 leading-6 text-muted-foreground">{ui(answer)}</AccordionContent></AccordionItem>)}</Accordion></section>

      </main>
    </PublicPage>
  );
}

function ProductPreview() {
  const { t: ui } = useTranslation("ui");
  const bars = [38, 54, 46, 67, 58, 78, 70, 92, 76, 86, 73, 96];
  return (
    <div className="home-dashboard-stage relative mt-12 w-full max-w-6xl flex-1" aria-label={ui("Demonstração do painel financeiro WiizePay")}>
      <div className="home-dashboard-window relative z-10 mx-auto w-[96%] overflow-hidden rounded-t-xl border-x border-t border-border bg-card text-left shadow-float sm:w-[88%] lg:w-[82%]">
        <div className="grid h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface/70 px-3 sm:px-4">
          <div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-destructive/60" /><span className="size-2 rounded-full bg-warning/70" /><span className="size-2 rounded-full bg-primary/70" /></div>
          <div className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><LayoutDashboard className="size-3.5" /></span><span className="truncate text-[10px] font-semibold sm:text-xs">{ui("Painel WiizePay")}</span></div>
          <span className="hidden items-center gap-1.5 text-[9px] text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-primary" />{ui("Atualizado agora")}</span>
        </div>
        <div className="grid min-h-[21rem] grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)] lg:min-h-[24rem]">
          <aside className="border-r border-border bg-surface/45 p-2.5 sm:p-3.5" aria-label={ui("Menu ilustrativo do painel")}>
            <div className="mb-5 flex items-center gap-2 px-1"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-display text-[9px] font-bold text-primary-foreground">WP</span><span className="hidden text-[11px] font-semibold sm:block">{ui("Minha empresa")}</span></div>
            <div className="grid gap-1.5">
              <DashboardNav icon={LayoutDashboard} label="Visão geral" active />
              <DashboardNav icon={Link2} label="Cobranças" />
              <DashboardNav icon={Users} label="Clientes" />
              <DashboardNav icon={FileSignature} label="Contratos" />
              <DashboardNav icon={Wallet} label="Financeiro" />
            </div>
          </aside>
          <div className="min-w-0 bg-background/35 p-2.5 sm:p-4 lg:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4"><div><p className="text-[9px] text-muted-foreground sm:text-[10px]">{ui("Visão geral")}</p><p className="text-xs font-semibold sm:text-sm">{ui("Olá, sua operação está em dia.")}</p></div><span className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-[9px] text-muted-foreground sm:block">{ui("Últimos 30 dias")}</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <DashboardMetric label="Disponível para saque" value={formatBRL(12500)} icon={Wallet} featured />
              <DashboardMetric label="A receber" value={formatBRL(7800)} icon={BarChart3} />
              <DashboardMetric label="Recebido no mês" value={formatBRL(24320)} icon={CheckCircle2} className="col-span-2 sm:col-span-1" />
            </div>
            <div className="mt-2 grid gap-2 sm:mt-3 sm:grid-cols-[1.25fr_0.9fr] sm:gap-3">
              <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold">{ui("Movimentações")}</p><p className="text-[9px] text-muted-foreground">{ui("Recebimentos confirmados")}</p></div><span className="text-[9px] font-semibold text-primary">+18,4%</span></div>
                <div className="dashboard-chart relative mt-4 flex h-24 items-end gap-1.5 sm:h-28 sm:gap-2" aria-hidden="true">{bars.map((height, index) => <span key={index} className="dashboard-chart-bar flex-1 rounded-t-sm" style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }} />)}</div>
                <div className="mt-2 hidden grid-cols-6 text-center text-[8px] text-muted-foreground sm:grid"><span>{ui("Abr")}</span><span>{ui("Mai")}</span><span>{ui("Jun")}</span><span>{ui("Jul")}</span><span>{ui("Ago")}</span><span>{ui("Set")}</span></div>
              </div>
              <div className="hidden rounded-lg border border-border bg-card p-3 sm:block sm:p-4">
                <div className="flex items-center justify-between"><p className="text-[10px] font-semibold">{ui("Últimas cobranças")}</p><span className="text-[9px] text-primary">{ui("Ver todas")}</span></div>
                <div className="mt-3 grid gap-2">
                  <PaymentRow icon={QrCode} label="Pix · Empresa Horizonte" value={formatBRL(2500)} detail="Pago agora" delay="0ms" />
                  <PaymentRow icon={CreditCard} label="Cartão · Atlas Consultoria" value={formatBRL(1850)} detail="Aprovado hoje" delay="140ms" />
                  <PaymentRow icon={Landmark} label="Boleto · Nexo Digital" value={formatBRL(920)} detail="Compensado hoje" delay="280ms" />
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-md border border-primary/25 bg-accent px-3 py-2 sm:hidden"><span className="text-[9px] font-semibold text-primary">{ui("24 cobranças pagas")}</span><CheckCircle2 className="size-3.5 text-primary" /></div>
          </div>
        </div>
        <div className="home-dashboard-fade" aria-hidden="true" />
      </div>
      <div className="payment-float payment-float-left absolute bottom-10 left-[-1%] z-20 hidden items-center gap-3 rounded-lg border border-border bg-card/90 p-3 text-left shadow-float backdrop-blur-xl md:flex">
        <span className="grid size-8 place-items-center rounded-md bg-accent text-primary"><QrCode className="size-4" /></span><div><p className="text-[10px] text-muted-foreground">{ui("Pagamento recebido")}</p><p className="numeric-tabular text-sm font-semibold text-primary">+ {formatBRL(2500)}</p></div>
      </div>
      <div className="payment-float payment-float-right absolute right-0 top-8 z-20 hidden items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs font-medium shadow-float backdrop-blur-xl sm:flex"><ShieldCheck className="size-4 text-primary" />{ui("Operação protegida")}</div>
    </div>
  );
}

function DashboardNav({ icon: Icon, label, active = false }: { icon: typeof Wallet; label: string; active?: boolean }) {
  const { t: ui } = useTranslation("ui");
  return <div className={`flex min-h-8 items-center gap-2 rounded-md px-2 text-[10px] font-medium ${active ? "bg-accent text-primary" : "text-muted-foreground"}`}><Icon className="size-3.5 shrink-0" /><span className="hidden truncate sm:block">{ui(label)}</span></div>;
}

function DashboardMetric({ label, value, icon: Icon, featured = false, className = "" }: { label: string; value: string; icon: typeof Wallet; featured?: boolean; className?: string }) {
  const { t: ui } = useTranslation("ui");
  return <div className={`${className} rounded-lg border p-2.5 sm:p-3 ${featured ? "balance-hero border-primary/30" : "border-border bg-card"}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className={`truncate text-[8px] sm:text-[9px] ${featured ? "opacity-75" : "text-muted-foreground"}`}>{ui(label)}</p><p className="numeric-tabular mt-1 truncate text-xs font-semibold sm:text-base">{value}</p></div><Icon className={`size-3.5 shrink-0 ${featured ? "opacity-80" : "text-primary"}`} /></div></div>;
}

function PaymentRow({ icon: Icon, label, value, detail, delay }: { icon: typeof QrCode; label: string; value: string; detail: string; delay: string }) {
  const { t: ui } = useTranslation("ui");
  return <div className="payment-row flex items-center gap-2 rounded-md border border-border bg-surface/50 p-2" style={{ animationDelay: delay }}><span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-primary"><Icon className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-medium">{ui(label)}</p><p className="truncate text-[8px] text-muted-foreground">{ui(detail)}</p></div><div className="text-right"><p className="numeric-tabular text-[9px] font-semibold text-primary">{value}</p><CheckCircle2 className="ml-auto mt-0.5 size-3 text-primary" /></div></div>;
}
