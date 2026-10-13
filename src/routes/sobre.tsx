import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle, Network, ShieldCheck, Zap, TrendingUp, Wallet, Users, LockKeyhole, Eye, CheckCircle2 } from "lucide-react";
import { PublicPage } from "@/components/public-site";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

import { AboutJourney, AboutMetrics } from "@/components/about-visuals";

const SUPPORT_URL = "https://www.wiize.com.br/contato";
const URL = "https://wiizepayteste.lovable.app/sobre";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre nós — WiizePay e Grupo Wiize" },
      { name: "description", content: "Conheça o propósito da WiizePay: conectar cobranças, contratos, pagamentos e gestão financeira para empresas de serviços." },
      { property: "og:title", content: "Sobre nós — WiizePay e Grupo Wiize" },
      { property: "og:description", content: "Simplificar processos. Conectar negócios. Transformar a operação." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: SobrePage,
});

const commitments = [
  ["Transparência nas informações", "Taxas, prazos e condições ficam acessíveis antes de cobrar."],
  ["Tratamento responsável dos dados", "A WiizePay não armazena CVV, senha ou número completo do cartão."],
  ["Clareza operacional", "Um pagamento só muda de estado após a confirmação do provedor."],
  ["Evolução tecnológica responsável", "Regras financeiras e permissões são decididas no servidor, não no navegador."],
] as const;

const principles = [
  ["Integração", "Acreditamos em processos que trabalham juntos, conectando informações e reduzindo a fragmentação."],
  ["Eficiência", "Buscamos simplificar rotinas e eliminar complexidades operacionais desnecessárias."],
  ["Responsabilidade", "Valorizamos a transparência, o cuidado com as informações e a clareza nas relações com nossos clientes."],
  ["Evolução", "Desenvolvemos tecnologia com atenção às necessidades reais dos negócios e à melhoria contínua da experiência."],
] as const;

const principleIcons = [Network, Zap, ShieldCheck, TrendingUp];
const commitmentIcons = [Eye, LockKeyhole, CheckCircle2, TrendingUp];

function SobrePage() {
  const { t: ui } = useTranslation("ui");
  return (
    <PublicPage>
      <main className="about-page">
        {/* Hero */}
        <section className="about-hero relative overflow-hidden border-b border-border">
          <div className="section-shell py-16 text-center lg:py-20">
            <div className="about-hero-content mx-auto max-w-5xl">
              <p className="section-kicker">{ui("Sobre a WiizePay")}</p>
              <h1 className="about-hero-title mt-6 font-semibold">
                <span className="block">{ui("Simplificar processos.")}</span>
                <span className="block">{ui("Conectar negócios.")}</span>
                <span className="hero-shine about-highlight block">{ui("Transformar a operação.")}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{ui("A WiizePay nasceu da visão de tornar a gestão de cobranças e recebimentos mais simples, conectando pagamentos à realidade dos negócios.")}</p>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{ui("Fazemos parte de uma visão maior: desenvolver tecnologia que reduza a complexidade operacional e ajude empresas a trabalhar com mais integração, organização e eficiência.")}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg"><a href="#visao">{ui("Conheça nossa visão")} <ArrowRight /></a></Button>
                <Button asChild size="lg" variant="outline"><Link to="/">{ui("Explore a WiizePay")}</Link></Button>
              </div>
            </div>
          </div>
        </section>

        {/* História */}
        <section className="section-shell grid gap-10 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
          <div>
            <p className="section-kicker">{ui("Nossa história e propósito")}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{ui("Os negócios não precisam de mais complexidade.")} <span className="hero-shine">{ui("Precisam de processos que funcionem juntos.")}</span></h2>
          </div>
          <div className="space-y-5 border-l border-border pl-6 text-base leading-8 text-muted-foreground sm:pl-10">
            <p>{ui("Empresas precisam vender, negociar, formalizar contratos, cobrar, receber e acompanhar seus resultados. Mas essas atividades frequentemente dependem de ferramentas desconectadas, controles manuais e informações espalhadas.")}</p>
            <p className="text-xl font-medium leading-8 text-foreground">{ui("Acreditamos que a tecnologia pode simplificar essa realidade.")}</p>
            <p>{ui("A WiizePay faz parte de uma iniciativa empresarial que busca conectar processos e reduzir o atrito entre as diferentes etapas da operação de um negócio.")}</p>
            <p>{ui("Nosso propósito é ajudar empresas e prestadores de serviços a administrar suas cobranças e recebimentos com mais clareza, organização e eficiência.")}</p>
          </div>
        </section>

        {/* Grupo Wiize */}
        <section className="border-y border-border bg-surface">
          <div className="section-shell py-20 lg:py-28">
            <div className="max-w-3xl">
              <p className="section-kicker">{ui("Grupo Wiize")}</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{ui("Uma visão compartilhada. Duas empresas. Um propósito maior.")}</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">{ui("A WiizePay e a Wiize integram o Grupo Wiize e compartilham a visão de simplificar processos empresariais por meio da tecnologia.")}</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-[1.4fr_1fr]">
              <article className="bg-background p-8 sm:p-10">
                <Wallet className="mb-6 size-8 text-primary" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-wider text-primary">WiizePay</p>
                <h3 className="mt-4 text-2xl font-semibold sm:text-3xl">{ui("Pagamentos, cobranças e recebimentos.")}</h3>
                <p className="mt-4 max-w-lg leading-7 text-muted-foreground">{ui("A WiizePay concentra sua proposta em pagamentos, cobranças e recebimentos para empresas de serviços.")}</p>
              </article>
              <article className="bg-background p-8 sm:p-10">
                <Users className="mb-6 size-8 text-primary" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Wiize</p>
                <h3 className="mt-4 text-xl font-semibold">{ui("Processos comerciais e relacionamento.")}</h3>
                <p className="mt-4 leading-7 text-muted-foreground">{ui("A Wiize complementa essa visão com sua atuação em tecnologia para processos comerciais e relacionamento com clientes.")}</p>
              </article>
            </div>
            <p className="mt-8 max-w-2xl text-sm leading-7 text-muted-foreground">{ui("Juntas, as duas empresas representam a ambição de aproximar a operação comercial da operação financeira, criando experiências mais integradas.")}</p>
          </div>
        </section>

        {/* Visão / Jornada */}
        <section id="visao" className="section-shell scroll-mt-24 py-20 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{ui("Nossa visão")}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{ui("Do primeiro contato ao recebimento: tudo faz parte da mesma jornada.")}</h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{ui("Nossa proposta é reduzir a fragmentação entre essas etapas e facilitar a administração de negócios que trabalham com contratos, serviços e pagamentos recorrentes.")}</p>
          </div>
          <AboutJourney />
          <p className="mt-10 text-center text-xs text-muted-foreground">{ui("Esta jornada representa nossa visão e proposta de valor, em evolução contínua.")}</p>
        </section>

        {/* Infraestrutura */}
        <section className="border-y border-border bg-surface">
          <div className="section-shell py-20 lg:py-28">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <p className="section-kicker">{ui("Nossa infraestrutura")}</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{ui("Tecnologia preparada para conectar operações de pagamento.")}</h2>
              </div>
              <p className="text-base leading-7 text-muted-foreground">{ui("A WiizePay combina seu produto com uma infraestrutura especializada de pagamentos, permitindo concentrar esforços na experiência do cliente, na integração dos processos e na evolução contínua da solução.")}</p>
            </div>
            <AboutMetrics />
            <p className="mt-8 max-w-3xl text-xs leading-6 text-muted-foreground">{ui("Indicadores divulgados por nossa infraestrutura de pagamentos parceira. Não representam resultados próprios da WiizePay nem da Wiize.")}</p>
          </div>
        </section>

        {/* Transparência */}
        <section className="section-shell grid gap-12 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
          <div>
            <p className="section-kicker">{ui("Segurança e transparência")}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{ui("Confiança se constrói com transparência.")}</h2>
            <p className="mt-5 leading-7 text-muted-foreground">{ui("Acreditamos que empresas precisam compreender como seus pagamentos funcionam, quais condições se aplicam às cobranças e como suas informações são tratadas.")}</p>
            <Button asChild variant="outline" className="mt-7"><Link to="/seguranca-e-confianca">{ui("Ver segurança")} <ArrowRight /></Link></Button>
          </div>
          <ul className="divide-y divide-border border-y border-border">
            {commitments.map(([title, text], i) => {
              const Icon = commitmentIcons[i] ?? ShieldCheck;
              return (
              <li key={title} className="grid gap-2 py-6 sm:grid-cols-[0.8fr_1.2fr] sm:gap-8">
                <h3 className="flex items-start gap-3 font-semibold"><Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />{ui(title)}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{ui(text)}</p>
              </li>
            ); })}
          </ul>
        </section>

        {/* Princípios */}
        <section className="border-y border-border bg-surface">
          <div className="section-shell py-20 lg:py-28">
            <p className="section-kicker">{ui("Cultura e princípios")}</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">{ui("O que orienta tudo o que construímos.")}</h2>
            <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {principles.map(([title, text], i) => {
                const Icon = principleIcons[i] ?? Network;
                return (
                  <div key={title} className="about-principle flex gap-5 border-t border-border pt-7">
                    <span className="about-principle-number font-display text-5xl font-semibold leading-none">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="flex items-center gap-3 text-2xl font-semibold"><Icon className="size-6 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />{ui(title)}</h3>
                      <p className="mt-3 leading-7 text-muted-foreground">{ui(text)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Futuro */}
        <section className="section-shell py-24 lg:py-32">
          <p className="section-kicker">{ui("Nossa visão de futuro")}</p>
          <h2 className="mt-4 max-w-5xl text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.08]">{ui("Construir tecnologia que acompanha")} <span className="hero-shine">{ui("a evolução dos negócios.")}</span></h2>
          <div className="mt-10 grid gap-6 text-base leading-8 text-muted-foreground md:grid-cols-2">
            <p>{ui("Acreditamos em um futuro em que empresas possam administrar suas operações com menos fragmentação e mais integração.")}</p>
            <p>{ui("Queremos continuar aproximando processos comerciais e financeiros, tornando a tecnologia uma aliada da eficiência. Essa visão orienta a evolução da WiizePay e a construção do Grupo Wiize.")}</p>
          </div>
        </section>

        {/* CTA */}
        <section className="premium-cta relative isolate overflow-hidden border-y border-border px-5 py-16 text-center sm:py-20" aria-label={ui("Sua operação pode ser mais simples.")}>
          <div className="premium-cta-glow absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">{ui("Sua operação pode ser mais simples.")}</h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{ui("Conheça a WiizePay e descubra uma nova maneira de conectar pagamentos e recebimentos à rotina do seu negócio.")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg"><Link to="/">{ui("Conhecer a WiizePay")} <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><a href={SUPPORT_URL} target="_blank" rel="noreferrer">{ui("Falar com a equipe")} <MessageCircle /></a></Button>
            </div>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}

