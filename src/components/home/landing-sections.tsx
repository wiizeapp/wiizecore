import type { CSSProperties, ReactNode } from "react";
import howClientes from "@/assets/how-clientes.png";
import howCobranca from "@/assets/how-cobranca.png";
import howEnvio from "@/assets/how-envio.png";
import howRecebimento from "@/assets/how-recebimento.png";
import { ArrowDown, ArrowRight, BellRing, CalendarClock, Check, CheckCircle2, CircleDollarSign, Clock3, CreditCard, FileSignature, FileText, Landmark, Lock, PenLine, QrCode, Receipt, Repeat, Users, Wallet, Briefcase, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import brandLogoUrl from "@/assets/wiizepay-logo.png";
const brandLogo = { url: brandLogoUrl };
import { formatBRL } from "@/lib/format";

function useUi() {
  return useTranslation("ui").t;
}

/* ---------- Shared building blocks ---------- */

export function SectionIntro({ eyebrow, title, accent, text, center = false }: { eyebrow?: string; title: string; accent?: string; text?: string; center?: boolean }) {
  const ui = useUi();
  return (
    <div className={center ? "mx-auto max-w-4xl text-center" : "min-w-0 max-w-xl"}>
      {eyebrow ? <p className="section-kicker">{ui(eyebrow)}</p> : null}
      <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-[2.5rem]">
        {ui(title)}{accent ? <> <span className="hero-shine">{ui(accent)}</span></> : null}
      </h2>
      {text ? <p className="mt-4 text-base leading-7 text-muted-foreground">{ui(text)}</p> : null}
    </div>
  );
}

function Window({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const ui = useUi();
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left shadow-card ${className}`}>
      <div className="flex h-10 items-center gap-3 border-b border-border bg-surface/60 px-4">
        <div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-muted-foreground/30" /><span className="size-2 rounded-full bg-muted-foreground/30" /><span className="size-2 rounded-full bg-muted-foreground/30" /></div>
        <span className="truncate text-xs font-semibold text-muted-foreground">{ui(title)}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

type Tone = "paid" | "pending" | "overdue" | "neutral";
function Status({ tone, label }: { tone: Tone; label: string }) {
  const ui = useUi();
  const styles: Record<Tone, string> = {
    paid: "bg-primary/12 text-primary",
    pending: "bg-warning/15 text-warning",
    overdue: "bg-destructive/12 text-destructive",
    neutral: "bg-muted text-muted-foreground",
  };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[tone]}`}>{ui(label)}</span>;
}

function SideNote({ title, text }: { title: string; text: string }) {
  const ui = useUi();
  return (
    <div className="border-l-2 border-primary/40 pl-4">
      <h3 className="font-semibold">{ui(title)}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{ui(text)}</p>
    </div>
  );
}

function Split({ intro, notes, visual, reverse = false }: { intro: ReactNode; notes?: ReactNode; visual: ReactNode; reverse?: boolean }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>{intro}{notes ? <div className="mt-8 grid gap-6">{notes}</div> : null}</div>
      <div className={`min-w-0 ${reverse ? "lg:order-1" : ""}`}>{visual}</div>
    </div>
  );
}

/* ---------- 3. Operation flow ---------- */

export function OperationFlow() {
  const ui = useUi();
  const flow = [
    { icon: Users, label: "Cliente" },
    { icon: Briefcase, label: "Serviço" },
    { icon: Receipt, label: "Cobrança" },
    { icon: CreditCard, label: "Pagamento" },
    { icon: Wallet, label: "Financeiro" },
    { icon: FileText, label: "Nota fiscal" },
  ];
  const modules = [
    { icon: Receipt, title: "Cobranças e pagamentos", text: "Crie cobranças avulsas, parceladas ou recorrentes e receba por Pix, Pix Automático, boleto ou cartão." },
    { icon: Briefcase, title: "Serviços", text: "Organize o que sua empresa vende, com valor fixo ou personalizado." },
    { icon: FileSignature, title: "Contratos", text: "Assinatura eletrônica antes do pagamento, com certificado." },
    { icon: Wallet, title: "Financeiro", text: "Entradas, saídas e saldo ligados às cobranças recebidas." },
    { icon: BellRing, title: "Lembretes", text: "Avisos antes, no dia e depois do vencimento." },
    { icon: FileText, title: "Notas fiscais", text: "Emissão a partir da cobrança, conforme sua configuração fiscal." },
  ];
  return (
    <div className="operation-flow-band">
    <section id="plataforma" className="section-shell scroll-mt-24 pb-20 pt-12 lg:py-28">
      <SectionIntro center title="Tudo o que você precisa para" accent="administrar seus recebimentos." text="Uma única plataforma para vender, cobrar, receber e organizar o financeiro da sua empresa de serviços." />
      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        <div className="feature-visual feature-visual-1 relative isolate overflow-hidden rounded-xl border border-border p-6 shadow-float lg:row-span-3 lg:p-8">
          <div className="feature-visual-grid absolute inset-0 -z-10" aria-hidden="true" />
          <div className="feature-visual-glow absolute inset-0 -z-10" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-[5] h-44 bg-gradient-to-b from-background/90 via-background/60 to-transparent backdrop-blur-[2px]" aria-hidden="true" />
                    <h3 className="mt-3 text-2xl font-semibold leading-tight">{ui("Cada etapa alimenta a próxima.")}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{ui("Sem planilhas paralelas: o pagamento recebido atualiza o cliente, o saldo e o financeiro.")}</p>
          <ol className="mt-8 space-y-3" style={{ perspective: "800px" }}>
            {flow.map((step, i) => (
              <li key={step.label} className="operation-flow-step" style={{ transformStyle: "preserve-3d" }}>
                <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-card/90 p-2.5 shadow-float backdrop-blur-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><step.icon className="size-4" /></span>
                <span className="text-sm font-semibold">{ui(step.label)}</span>
                <span className="ml-auto text-[10px] font-semibold text-muted-foreground">0{i + 1}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {modules.map((m) => (
          <div key={m.title} className="group rounded-xl border border-border bg-card p-6 shadow-card transition-colors hover:border-primary/50">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary transition-colors group-hover:border-primary/40 group-hover:bg-primary/15" aria-hidden="true">
                <m.icon className="size-4.5" strokeWidth={1.75} />
              </span>
              <h3 className="text-lg font-semibold">{ui(m.title)}</h3>
            </div>
            <p className="mt-2.5 text-sm leading-6 text-muted-foreground">{ui(m.text)}</p>
          </div>
        ))}
      </div>
    </section>
    </div>
  );
}

export function HowItWorksSection() {
  const ui = useUi();
  // Canvas size, visible-content size and optical weight of each 3D icon. The artwork
  // boxes are very different (the plane is wide and flat, the document is tall), so
  // every icon is scaled to the same visible area, and the weight compensates the
  // drawings that are naturally lighter or denser than the others.
  const steps: Array<[string, string, string, string, string, number, number, number, number, number]> = [
    ["01", howClientes, "Cadastre cliente e serviço", "Informe quem vai pagar e o que você vende. CPF/CNPJ pode ficar para depois: ele é pedido na hora do pagamento.", "~ 1 min", 360, 237, 208, 189, 1.004],
    ["02", howCobranca, "Gere a cobrança com contrato", "Defina valor, vencimento, Pix, boleto ou cartão, parcelas, multa e lembretes. Se houver contrato, o cliente assina antes de pagar.", "Link único", 360, 333, 232, 239, 0.961],
    ["03", howEnvio, "Envie um link permanente", "Mande por WhatsApp ou e-mail. Os lembretes avisam antes e depois do vencimento, sem você precisar cobrar.", "Automático", 360, 233, 326, 224, 1.108],
    ["04", howRecebimento, "Receba e veja o saldo", "A confirmação do pagamento atualiza a cobrança, o cliente, o saldo e o financeiro, com a data real de liberação.", "Em tempo real", 360, 280, 286, 264, 0.959],
  ];
  return (
    <section className="border-y border-border bg-surface">
      <div className="section-shell pb-20 pt-14 lg:pb-28 lg:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="section-kicker">{ui("Como funciona")}</p>
          <h2 className="mt-3 text-[1.0625rem] font-bold leading-tight min-[390px]:text-xl sm:text-4xl lg:text-[2.75rem]">{ui("Da primeira cobrança ao dinheiro na conta")} <span className="hero-shine whitespace-nowrap">{ui("em 4 passos.")}</span></h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{ui("Sem planilhas e sem conferir extrato: cada passo alimenta o próximo automaticamente.")}</p>
        </div>
        <ol className="how-steps mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([n, iconSrc, title, text, tag, canvasW, canvasH, contentW, contentH, weight], index) => (
            <li key={n} className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card">
              {index < steps.length - 1 ? <span className="absolute -right-4 top-1/2 hidden h-px w-4 bg-border lg:block" aria-hidden="true" /> : null}
              <div className="flex h-11 items-center justify-between gap-3">
                <span className="grid h-11 w-14 shrink-0 place-items-center">
                  <img
                    src={iconSrc}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="max-w-none object-contain"
                    style={{
                      width: `calc(var(--how-icon) * ${((canvasW * weight) / Math.sqrt(contentW * contentH)).toFixed(3)})`,
                      height: `calc(var(--how-icon) * ${((canvasH * weight) / Math.sqrt(contentW * contentH)).toFixed(3)})`,
                    }}
                  />
                </span>
                <span className="font-display text-xs font-semibold text-primary">{ui("Passo")} {n}</span>
              </div>
              <h3 className="mt-5 font-semibold">{ui(title)}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">{ui(text)}</p>
              <span className="mt-5 inline-flex w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{ui(tag)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Comparison: só um link de pagamento vs Wiize Core ---------- */

export function ComparisonSection() {
  const ui = useUi();
  const rows: Array<[string, string, string]> = [
    ["O pagamento", "O valor entra, mas o restante da operação continua manual.", "Recebimento confirmado, cliente e saldo atualizados sozinhos."],
    ["O cliente", "Um nome solto na lista de quem pagou.", "Ficha com histórico, contratos e total em aberto."],
    ["O vencimento", "Você mesmo cobra no WhatsApp depois do atraso.", "Cobrança automática antes e após o atraso."],
    ["O contrato", "PDF por e-mail e assinatura fora do fluxo.", "Sistema completo de assinatura de contratos."],
    ["O financeiro", "Somar extrato para descobrir o que entrou.", "Controle financeiro completo, em uma única visão."],
    ["A nota fiscal", "Outro sistema, outro cadastro.", "Nota fiscal automática, direto da cobrança."],
    ["A recorrência", "Pix manual precisa gerar cobrança avulsa todo mês.", "Pix recorrente sem cobrança avulsa."],
  ];
  return (
    <section className="section-shell py-20 lg:py-28">
      <SectionIntro center title="Receber o pagamento" accent="é só o começo." text="Um link de pagamento resolve o momento da cobrança. A Wiize Core cuida do que vem antes e do que vem depois dele." />
      <div className="relative mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-float">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 cmp-half-live" />
        <div className="relative">
          <div className="grid grid-cols-2">
            <div className="flex min-w-0 flex-col items-start gap-2 border-b border-border/70 px-3 py-4 sm:flex-row sm:items-center sm:gap-3.5 sm:px-7 sm:py-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border sm:size-11 border-border bg-muted/40 text-muted-foreground"><CreditCard className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{ui("Sem a Wiize Core")}</p>
                <p className="mt-0.5 font-display text-sm font-semibold text-muted-foreground sm:text-base">{ui("Só um link de pagamento")}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-2 border-b border-l border-border/70 border-l-primary/20 px-3 py-4 sm:flex-row sm:items-center sm:gap-3.5 sm:px-7 sm:py-5">
              <img src={brandLogo.url} alt="Wiize Core" width={44} height={44} className="size-9 shrink-0 rounded-xl sm:size-11" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{ui("Com a Wiize Core")}</p>
                <p className="mt-0.5 font-display text-sm font-semibold sm:text-base">Wiize <span className="text-primary">Core</span></p>
              </div>
              <span className="ml-auto hidden shrink-0 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary lg:block">{ui("Tudo no mesmo fluxo")}</span>
            </div>
          </div>
          {rows.map(([label, off, on]) => (
            <div key={label} className="cmp-anim grid grid-cols-2 border-b border-border/70 last:border-b-0">
              <div className="min-w-0 px-3 py-3 sm:px-7 sm:py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{ui(label)}</p>
                <div className="mt-1.5 flex items-start gap-2 sm:gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 sm:size-6 place-items-center rounded-full bg-muted text-muted-foreground"><X className="size-3.5" /></span>
                  <p className="text-xs leading-5 text-muted-foreground sm:text-[0.95rem] sm:leading-6">{ui(off)}</p>
                </div>
              </div>
              <div className="min-w-0 border-l border-primary/15 px-3 py-3 sm:px-7 sm:py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{ui(label)}</p>
                <div className="mt-1.5 flex items-start gap-2 sm:gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 sm:size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span>
                  <p className="text-xs font-medium leading-5 sm:text-[0.95rem] sm:leading-6">{ui(on)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-muted-foreground">{ui("Comparação entre usar apenas um link de pagamento e usar a Wiize Core. Os recursos dependem do plano e da configuração da sua conta.")}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg"><Link to="/auth" search={{ modo: "criar" }}>{ui("Começar agora")} <ArrowRight className="size-4" /></Link></Button>
      </div>
    </section>
  );
}

/* ---------- 4. Charges ---------- */

export function ChargesVisual() {
  const ui = useUi();
  const rows: Array<[string, string, number, Tone, string]> = [
    ["Empresa Horizonte", "Consultoria mensal", 2500, "paid", "Pago"],
    ["Atlas Consultoria", "Implantação", 1850, "pending", "Pendente"],
    ["Nexo Digital", "Suporte técnico", 920, "overdue", "Vencido"],
    ["Studio Prisma", "Gestão de redes", 1400, "paid", "Pago"],
    ["Lumen Arquitetura", "Projeto executivo", 3200, "pending", "Pendente"],
  ];
  const dates = ["05/10", "08/10", "28/09", "02/10", "12/10"];
  return (
<Window title="Cobranças">
              <div className="mb-4 flex flex-wrap gap-2 text-[11px]">{["Todas", "Pagas", "Pendentes", "Vencidas"].map((tab, i) => <span key={tab} className={`rounded-md px-2.5 py-1 font-medium ${i === 0 ? "bg-foreground text-background" : "bg-surface text-muted-foreground"}`}>{ui(tab)}</span>)}</div>
              <div className="divide-y divide-border">
                {rows.map(([client, service, value, tone, label], i) => (
                  <div key={client} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_4rem_6rem_5rem]">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{client}</p><p className="truncate text-xs text-muted-foreground">{ui(service)}</p></div>
                    <span className="hidden text-xs text-muted-foreground sm:block">{dates[i]}</span>
                    <span className="numeric-tabular text-right text-sm font-semibold sm:text-left">{formatBRL(value)}</span>
                    <span className="col-span-2 sm:col-span-1 sm:justify-self-end"><Status tone={tone} label={label} /></span>
                  </div>
                ))}
              </div>
            </Window>
  );
}

/* ---------- 5. Receivables ---------- */

export function ReceivablesVisual() {
  const ui = useUi();
  const stats: Array<[string, number, string]> = [
    ["Recebido", 24320, "text-primary"],
    ["A receber", 7800, "text-foreground"],
    ["Pendente", 3050, "text-warning"],
    ["Vencido", 920, "text-destructive"],
  ];
  return (
<Window title="Recebimentos">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              {stats.map(([label, value, color]) => <div key={label} className="bg-card p-3"><p className="text-[11px] text-muted-foreground">{ui(label)}</p><p className={`numeric-tabular mt-1 text-base font-semibold ${color}`}>{formatBRL(value)}</p></div>)}
            </div>
            <p className="mt-5 text-xs font-semibold">{ui("Movimentações")}</p>
            <div className="mt-2 divide-y divide-border">
              {[[QrCode, "Pix · Empresa Horizonte", 2500, "Hoje"], [CreditCard, "Cartão · Atlas Consultoria", 1850, "Previsto em 30 dias"], [Landmark, "Boleto · Studio Prisma", 1400, "Ontem"]].map(([Icon, label, value, when]) => {
                const I = Icon as typeof QrCode;
                return <div key={label as string} className="flex items-center gap-3 py-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary"><I className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm">{label as string}</p><p className="text-xs text-muted-foreground">{ui(when as string)}</p></div><span className="numeric-tabular text-sm font-semibold">{formatBRL(value as number)}</span></div>;
              })}
            </div>
          </Window>
  );
}

/* ---------- 6. Finance ---------- */

export function FinanceVisual() {
  const ui = useUi();
  const bars = [42, 58, 50, 66, 61, 78, 72, 88];
  return (
    <Window title="Financeiro">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr]">
            <div className="rounded-lg bg-foreground p-4 text-background"><p className="text-xs opacity-70">{ui("Saldo")}</p><p className="numeric-tabular mt-1 text-2xl font-semibold">{formatBRL(18640)}</p></div>
            <div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">{ui("Entradas")}</p><p className="numeric-tabular mt-1 text-xl font-semibold text-primary">{formatBRL(24320)}</p></div>
            <div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">{ui("Saídas")}</p><p className="numeric-tabular mt-1 text-xl font-semibold">{formatBRL(5680)}</p></div>
          </div>
          <div className="mt-4 grid gap-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold">{ui("Fluxo financeiro")}</p>
              <div className="mt-4 flex h-32 items-end gap-2" aria-hidden="true">{bars.map((h, i) => <span key={i} className="flex flex-1 flex-col justify-end gap-0.5"><span className="rounded-t-sm bg-primary/80" style={{ height: `${h}%` }} /><span className="rounded-b-sm bg-muted-foreground/25" style={{ height: `${h / 4}%` }} /></span>)}</div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold">{ui("Últimas movimentações")}</p>
              <div className="mt-2 divide-y divide-border text-sm">
                {[["Recebimento de cobrança", 2500, true], ["Software e ferramentas", 320, false], ["Recebimento de cobrança", 1400, true], ["Saque para conta", 3000, false]].map(([label, value, inflow], i) => <div key={i} className="flex items-center justify-between gap-2 py-2"><span className="truncate text-muted-foreground">{ui(label as string)}</span><span className={`numeric-tabular font-semibold ${inflow ? "text-primary" : ""}`}>{inflow ? "+" : "−"} {formatBRL(value as number)}</span></div>)}
              </div>
            </div>
          </div>
    </Window>
  );
}

/* ---------- 7. Clients ---------- */

export function ClientsVisual() {
  const ui = useUi();
  return (
<Window title="Ficha do cliente">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-accent font-semibold text-primary">EH</span><div className="min-w-0"><p className="font-semibold">Empresa Horizonte Ltda.</p><p className="text-xs text-muted-foreground">financeiro@horizonte.com.br</p></div><span className="ml-auto"><Status tone="paid" label="Ativo" /></span></div>
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
              {[["Total pago", formatBRL(15000)], ["Em aberto", formatBRL(2500)], ["Cobranças", "7"]].map(([l, v]) => <div key={l} className="bg-card p-3"><p className="text-[11px] text-muted-foreground">{ui(l as string)}</p><p className="numeric-tabular mt-1 text-sm font-semibold">{v}</p></div>)}
            </div>
            <p className="mt-5 text-xs font-semibold">{ui("Histórico")}</p>
            <ul className="mt-2 grid gap-2.5 text-sm">
              {[[CheckCircle2, "Cobrança de setembro paga via Pix"], [FileSignature, "Contrato de prestação assinado"], [Clock3, "Cobrança de outubro aguardando pagamento"]].map(([Icon, text]) => { const I = Icon as typeof CheckCircle2; return <li key={text as string} className="flex items-center gap-2.5"><I className="size-4 shrink-0 text-primary" /><span className="text-muted-foreground">{ui(text as string)}</span></li>; })}
            </ul>
          </Window>
  );
}

/* ---------- 8. Services ---------- */

export function ServicesVisual() {
  const ui = useUi();
  const flow: Array<[string, string, string]> = [
    ["Serviço", "Consultoria empresarial", formatBRL(1500)],
    ["Cliente", "Empresa Horizonte", ""],
    ["Cobrança", "Vence em 10/10", formatBRL(1500)],
    ["Recebimento", "Pago", "✓"],
  ];
  return (
<div className="mx-auto grid max-w-md gap-2">
              {flow.map(([step, title, value], i) => (
                <div key={step}>
                  <div className={`flex items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 shadow-card ${i === flow.length - 1 ? "border-primary/40" : "border-border"}`}>
                    <div><p className="text-[11px] font-bold uppercase text-muted-foreground">{ui(step)}</p><p className="mt-0.5 font-semibold">{ui(title)}</p></div>
                    {value ? <span className={`numeric-tabular font-semibold ${i === flow.length - 1 ? "text-primary" : ""}`}>{value}</span> : null}
                  </div>
                  {i < flow.length - 1 ? <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" /> : null}
                </div>
              ))}
            </div>
  );
}

/* ---------- 9. Contracts ---------- */

export function ContractsSection() {
  const ui = useUi();
  const steps = ["Crie o contrato", "Envie para assinatura", "Cliente assina", "Continue com a cobrança"];
  return (
    <section className="section-shell py-20 lg:py-28">
      <SectionIntro center title="Contrato e cobrança no mesmo fluxo." text="Envie o contrato, acompanhe a assinatura e siga com a cobrança. O pagamento só é liberado depois que o contratante assina." />
      <div className="mt-12 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <Window title="Contrato de prestação de serviços">
          <div className="space-y-2" aria-hidden="true">{[100, 92, 96, 70, 88, 60].map((w, i) => <span key={i} className="block h-2 rounded-full bg-muted" style={{ width: `${w}%` }} />)}</div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-primary/40 bg-accent/50 p-3"><p className="font-signature text-lg italic text-primary">Ana Souza</p><p className="mt-1 text-[10px] text-muted-foreground">{ui("Contratante · assinado")}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-lg italic text-muted-foreground">—</p><p className="mt-1 text-[10px] text-muted-foreground">{ui("Contratada · pendente")}</p></div>
          </div>
        </Window>
        <ol className="mx-auto grid gap-3 lg:w-56">
          {steps.map((s, i) => <li key={s} className="flex items-center gap-3"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${i < 3 ? "bg-primary text-primary-foreground" : "border border-primary text-primary"}`}>{i + 1}</span><span className="text-sm font-medium">{ui(s)}</span></li>)}
        </ol>
        <Window title="Cobrança vinculada">
          <p className="text-xs text-muted-foreground">{ui("Implantação")} · Atlas Consultoria</p>
          <p className="numeric-tabular mt-1 text-3xl font-semibold">{formatBRL(1850)}</p>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm text-primary"><CheckCircle2 className="size-4" />{ui("Contrato assinado. Pagamento liberado.")}</div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{ui("Vencimento")}</span><span>15/10</span></div>
        </Window>
      </div>
    </section>
  );
}

/* ---------- 10. Checkout ---------- */

export function CheckoutVisual() {
  const ui = useUi();
  return (
<div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-float">
              <div className="flex items-center gap-3 bg-foreground px-5 py-4 text-background"><span className="grid size-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">L</span><div><p className="text-sm font-semibold">Lumen Arquitetura</p><p className="text-[11px] opacity-70">{ui("Pagamento seguro")}</p></div></div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground">{ui("Projeto executivo")}</p>
                <p className="numeric-tabular mt-1 text-3xl font-semibold">{formatBRL(3200)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{ui("Vencimento")} 12/10 · Empresa Horizonte</p>
                <div className="mt-5 grid gap-2">
                  {[[QrCode, "Pix", true], [CreditCard, "Cartão de crédito", false], [Landmark, "Boleto", false]].map(([Icon, label, active]) => { const I = Icon as typeof QrCode; return <div key={label as string} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${active ? "border-primary bg-accent/50 font-semibold" : "border-border"}`}><I className="size-4 text-primary" />{ui(label as string)}</div>; })}
                </div>
                <div className="mt-5 rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground">{ui("Pagar agora")}</div>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><Lock className="size-3" />{ui("Ambiente protegido")}</p>
              </div>
            </div>
  );
}

/* ---------- 11. Invoices ---------- */

export function InvoicesVisual() {
  const ui = useUi();
  const rows: Array<[string, string, number, Tone, string]> = [
    ["NFS-e 0142", "Empresa Horizonte", 2500, "paid", "Emitida"],
    ["NFS-e 0143", "Studio Prisma", 1400, "paid", "Emitida"],
    ["NFS-e 0144", "Atlas Consultoria", 1850, "pending", "Processando"],
  ];
  return (
<Window title="Notas fiscais">
            <div className="divide-y divide-border">
              {rows.map(([n, c, v, t, l]) => <div key={n} className="flex items-center gap-3 py-3"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary"><FileText className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{n}</p><p className="truncate text-xs text-muted-foreground">{c}</p></div><span className="numeric-tabular hidden text-sm font-semibold sm:block">{formatBRL(v)}</span><Status tone={t} label={l} /></div>)}
            </div>
          </Window>
  );
}

/* ---------- 12. Payment methods ---------- */

export function PaymentMethodsSection() {
  const ui = useUi();
  const methods = [
    { icon: QrCode, title: "Pix", text: "Confirmação na hora, a qualquer momento." },
    { icon: Repeat, title: "Pix Automático", text: "O cliente autoriza uma vez e as mensalidades são cobradas sozinhas." },
    { icon: Landmark, title: "Boleto", text: "Para clientes que preferem pagar pelo banco." },
    { icon: CreditCard, title: "Cartão de crédito", text: "À vista ou parcelado." },
  ];
  return (
    <section className="border-y border-border bg-surface/50">
      <div className="section-shell py-20 lg:py-28">
        <SectionIntro center title="Receba de forma simples." text="Ofereça as formas de pagamento que seu cliente prefere, na mesma cobrança." />
        <div className="mt-12 grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {methods.map((m) => <div key={m.title} className="p-6"><m.icon className="size-6 text-primary" /><h3 className="mt-4 font-semibold">{ui(m.title)}</h3><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{ui(m.text)}</p></div>)}
        </div>
      </div>
    </section>
  );
}

/* ---------- 13. Reminders ---------- */

export function RemindersSection() {
  const ui = useUi();
  const steps = [
    { icon: CalendarClock, title: "Antes do vencimento", text: "O cliente recebe um aviso de que a cobrança vai vencer." },
    { icon: BellRing, title: "No vencimento", text: "Um lembrete no dia do pagamento." },
    { icon: Clock3, title: "Em atraso", text: "Novos avisos enquanto a cobrança estiver pendente." },
    { icon: CheckCircle2, title: "Pagamento", text: "Pagou, os lembretes param." },
  ];
  return (
    <section className="section-shell py-20 lg:py-28">
      <SectionIntro center title="Sua cobrança acompanha cada vencimento." text="Escolha um plano de lembretes e os avisos são enviados por e-mail, SMS ou WhatsApp, conforme o plano escolhido." />
      <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => <li key={s.title} className="relative border-t-2 border-border pt-5">{i === steps.length - 1 ? <span className="absolute -top-0.5 left-0 h-0.5 w-full bg-primary" /> : null}<s.icon className="size-5 text-primary" /><h3 className="mt-3 font-semibold">{ui(s.title)}</h3><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{ui(s.text)}</p></li>)}
      </ol>
    </section>
  );
}

/* ---------- 14. Audience ---------- */

type Testimonial = { text: string; name: string; role: string };

const TESTIMONIALS: Testimonial[] = [
  { text: "Antes eu corria atrás de pagamento no fim do mês. Hoje a cobrança sai na data certa e eu só acompanho o que entrou.", name: "Marina Duarte", role: "Consultora financeira" },
  { text: "Contrato assinado e cobrança no mesmo fluxo. A agência parou de perder prazo de pagamento.", name: "Rafael Nogueira", role: "Dono de agência digital" },
  { text: "Coloquei as mensalidades no Pix Automático e parei de cobrar manualmente. O sistema lembra por mim.", name: "Cláudia Ferreira", role: "Advogada" },
  { text: "Em duas semanas organizamos anos de cobranças atrasadas. Hoje sei exatamente quanto falta receber.", name: "Pedro Salgado", role: "Contador" },
  { text: "Meus clientes pagam num checkout com a marca do meu escritório. Parece página própria.", name: "Juliana Prado", role: "Arquiteta" },
  { text: "A senha financeira me deu confiança para delegar: minha equipe emite cobrança, mas não movimenta o dinheiro.", name: "André Luiz", role: "Dono de clínica" },
  { text: "Notas fiscais e recebimentos na mesma tela aposentaram a planilha que eu mantia havia anos.", name: "Beatriz Camargo", role: "Mentora de negócios" },
  { text: "Comecei num sábado e na segunda já estava cobrando. Não precisei treinar ninguém.", name: "Thiago Mendes", role: "Dono de software house" },
  { text: "Sei quem pagou, quem atrasou e quanto vai entrar no mês. Nunca tive essa clareza antes.", name: "Vanessa Lopes", role: "Gestora de tráfego" },
];

function testimonialInitials(name: string): string {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function TestimonialsRow({ items, duration, reverse = false }: { items: Testimonial[]; duration: number; reverse?: boolean }) {
  const ui = useUi();
  return (
    <div className="relative overflow-hidden py-1.5">
      <div className="tm-track flex w-max flex-row gap-4 md:gap-6" style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}>
        {[0, 1, 2].map((copy) => (
          <div key={copy} className="flex flex-row gap-4 md:gap-6" aria-hidden={copy !== 0}>
            {items.map(({ text, name, role }) => (
              <figure key={`${copy}-${name}`} className="m-0 w-[250px] shrink-0 rounded-2xl border border-border bg-card p-4 sm:w-[320px] sm:p-6 shadow-card md:w-[380px]">
                
                <blockquote className="m-0"><p className="text-[13px] leading-relaxed text-muted-foreground sm:text-sm md:text-base">{ui(text)}</p></blockquote>
                <figcaption className="mt-4 flex items-center gap-3 sm:mt-6 sm:gap-4">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-xs sm:size-12 sm:text-sm font-bold text-primary-foreground">{testimonialInitials(name)}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold md:text-base">{name}</span>
                    <span className="truncate text-xs text-muted-foreground md:text-sm">{ui(role)}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AudienceSection() {
  const ui = useUi();
  return (
    <section id="depoimentos" data-reveal="none" className="relative w-full overflow-hidden py-16 md:py-24">
      <div className="section-shell relative mb-12 text-center">
                <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">{ui("O que nossos")} <span className="hero-shine">{ui("clientes dizem")}</span></h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{ui("Veja como empresas de serviços estão cobrando, recebendo e organizando o financeiro com a Wiize Core.")}</p>
      </div>
      <div className="tm-mask-x relative flex flex-col gap-4 md:gap-6" role="region" aria-label={ui("Depoimentos de clientes")}>
        <TestimonialsRow items={TESTIMONIALS.slice(0, 5)} duration={60} />
        <TestimonialsRow items={TESTIMONIALS.slice(5, 9)} duration={70} reverse />
      </div>
    </section>
  );
}
