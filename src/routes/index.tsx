import { pageHead, organizationJsonLd } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, FileText, Palette, Receipt, Repeat, FileSignature, Link2, Users, UserRoundCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PublicPage } from "@/components/public-site";
import type { ReactNode } from "react";
import { FeatureVisual, type FeatureVisualKind } from "@/components/home/feature-visual";
import { OperationFlow, HowItWorksSection, ComparisonSection, AudienceSection } from "@/components/home/landing-sections";
import heroDashboard from "@/assets/hero-dashboard.png.asset.json";
import { ChargesPremium, ClientsPremium, ServicesPremium, CheckoutPremium, InvoicesPremium, PortalPremium } from "@/components/home/premium-visuals";
import { useTranslation } from "react-i18next";
import { AuthoritySection } from "@/components/institutional/infrastructure";
import { ConnectedJourneySection } from "@/components/home/connected-journey";

function PortalVisual() {
  return <PortalPremium scene={1} />;
}

export const Route = createFileRoute("/")({
  head: () => pageHead({ path: "/", title: "Wiize Core | Plataforma de Pagamentos e Gestão Unificada", description: "Conheça a Wiize Core, uma plataforma que integra pagamentos, cobranças, clientes, contratos e gestão financeira para prestadores de serviços.", jsonLd: organizationJsonLd() }),
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
  ["O que é a Wiize Core?", "Uma plataforma para empresas de serviços organizarem clientes, serviços, cobranças, recebimentos, contratos, notas fiscais e o financeiro em um só lugar."],
  ["Quais formas de pagamento estão disponíveis?", "Pix, Pix Automático, boleto e cartão de crédito, conforme a configuração da sua conta."],
  ["Posso criar contratos e enviar para assinatura?", "Sim. Você cria o contrato, envia para assinatura eletrônica e acompanha quem já assinou."],
  ["Posso emitir nota fiscal?", "Sim, notas fiscais de serviço conforme a configuração fiscal da sua empresa."],
  ["Como funcionam as taxas?", "As taxas aparecem antes de cobrar. A página de taxas mostra as regras vigentes e um simulador."],
];

function Landing() {
  const { t: ui } = useTranslation("ui");
  return (
    <PublicPage>
      <main>
        <section className="hero-payment relative overflow-hidden">
          <div className="section-shell relative z-10 flex flex-col items-center pb-8 pt-10 text-center sm:pt-12 lg:pt-14">
            <div>
              <h1 className="hero-title mx-auto mt-7 max-w-4xl text-[clamp(1.75rem,6.5vw,3.5rem)] font-semibold leading-[1.08]"><span className="block">{ui("Pagamentos inteligentes")}</span>{" "}<span className="hero-shine block">{ui("para empresas de serviços.")}</span></h1>
              <p className="mx-auto mt-5 max-w-xl text-balance text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{ui("Pagamentos, contratos, assinaturas, notas fiscais e gestão financeira em uma única plataforma, criada para simplificar a operação da sua empresa.")}</p>
              <div className="mt-7 flex flex-col items-center gap-2.5"><Button asChild size="lg"><Link to="/auth" search={{ modo: "criar" }}>{ui("Crie sua conta grátis agora")} <ArrowRight className="size-4" /></Link></Button><p className="text-[11px] font-medium text-muted-foreground sm:text-xs"><strong className="font-semibold">{ui("Sem mensalidade")}</strong>. {ui("Aprovação rápida")}</p></div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <HowItWorksSection />
        <OperationFlow />
        <ConnectedJourneySection />
        <ComparisonSection />

        <section data-reveal="features" className="section-shell py-20 lg:py-28" aria-label={ui("Funcionalidades")}>
          <div className="mx-auto max-w-2xl text-center"><h2 className=" text-3xl font-semibold sm:text-5xl">{ui("Tudo para cobrar e receber")} <span className="hero-shine">{ui("seus serviços.")}</span></h2><p className="mt-4 text-base leading-7 text-muted-foreground">{ui("Do contrato ao dinheiro na conta, com as formas de pagamento que seu cliente prefere.")}</p></div>
          <div className="mt-14 space-y-14 lg:space-y-20">
            {featureGroups.map((group, index) => (
              <article key={group.tag} data-reveal={index % 2 === 0 ? "left" : "right"} className="grid overflow-hidden rounded-lg bg-card shadow-float lg:min-h-[32rem] lg:grid-cols-2 lg:items-stretch">
                <div className={`flex min-w-0 flex-col justify-center px-5 py-5 sm:px-8 sm:py-5 lg:justify-center lg:px-9 lg:py-11 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                  <h3 className="text-2xl font-semibold leading-tight tracking-tight sm:text-[2rem]">{ui(group.title)}</h3>
                  <span className="mt-4 h-1 w-10 rounded-full bg-primary" aria-hidden="true" />
                  <p className="mt-4 text-base leading-7 text-muted-foreground">{ui(group.description)}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {group.points.map((point) => (
                      <li key={point} className="flex items-center justify-center rounded-lg border border-border bg-surface/60 p-3 text-center text-sm">{ui(point)}</li>
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
                            <div className="h-full w-full [&>*]:h-full [&>*]:shadow-float"><group.visual /></div>
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

        <AuthoritySection />
        <AudienceSection />


        <section className="section-shell grid gap-12 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-20"><div><p className="section-kicker">{ui("Perguntas frequentes")}</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{ui("Informação clara")} <span className="hero-shine">{ui("antes de começar.")}</span></h2></div><Accordion type="single" collapsible>{faqs.map(([question = "",answer = ""], index) => <AccordionItem key={question} value={`faq-${index}`}><AccordionTrigger className="text-base">{ui(question)}</AccordionTrigger><AccordionContent className="pr-8 leading-6 text-muted-foreground">{ui(answer)}</AccordionContent></AccordionItem>)}</Accordion></section>

        <section className="premium-cta relative isolate overflow-hidden border-y border-border px-5 py-16 text-center sm:px-10 sm:py-20 lg:py-24" aria-label={ui("Comece com a Wiize Core")}>
              <div className="premium-cta-glow absolute inset-0 -z-10" aria-hidden="true" />
              <div className="premium-cta-grid absolute inset-0 -z-10" aria-hidden="true" />
              <div className="mx-auto max-w-3xl">
                <h2 className="mt-5 text-2xl font-semibold leading-[1.2] text-foreground sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">{ui("Você chegou no fim da página...")}</h2>
                <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">{ui("Se chegou até aqui, é porque tá interessado.\nEntão vai lá, faz logo o cadastro.")}</p>
                <Button asChild size="lg" className="premium-cta-button mt-8 min-w-56 px-8 text-base">
                  <Link to="/auth" search={{ modo: "criar" }}>{ui("Vai, clica nesse botão\n")} <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
              <div className="premium-cta-edge absolute inset-x-[8%] bottom-0 h-px" aria-hidden="true" />
        </section>
      </main>
    </PublicPage>
  );
}

function ProductPreview() {
  const { t: ui } = useTranslation("ui");
  return (
    <div className="home-dashboard-stage relative mt-8 w-full flex-1 sm:mt-12" aria-label={ui("Demonstração do painel financeiro Wiize Core")}>
      <div className="home-dashboard-window relative z-10 mx-auto h-full w-full overflow-hidden rounded-t-2xl bg-card text-left">
        <img
          src={heroDashboard.url}
          alt={ui("Painel financeiro da Wiize Core com saldo, indicadores e gráfico de recebimentos")}
          className="h-full w-full object-cover object-top"
          loading="eager"
        />
      </div>
      <div className="home-dashboard-fade" aria-hidden="true" />
    </div>
  );
}
