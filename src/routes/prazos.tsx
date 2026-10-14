import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Clock3, Landmark, Send, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANTICIPATION_ANALYSIS_DAYS, SETTLEMENT_RULES } from "@/lib/settlement-rules";
import { PublicPage } from "@/components/public-site";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/prazos")({
  head: () => pageHead({ path: "/prazos", title: "Prazos de recebimento — WiizePay", description: "Consulte prazos de recebimento, antecipação e processamento de saques no WiizePay.", ogDescription: "Previsões de recebimento, análise de antecipação e etapas de saques por Pix.", breadcrumb: [{ name: "Prazos", path: "/prazos" }] }),
  component: PrazosPage,
});

function PrazosPage() {
  const { t: ui } = useTranslation("ui");
  const heroTitle = ui("Do pagamento ao saque, cada etapa bem explicada.");
  const [heroLead, ...heroHighlightParts] = heroTitle.split(",");
  const heroHighlight = heroHighlightParts.join(",").trim();
  const rows = [SETTLEMENT_RULES.pix, SETTLEMENT_RULES.boleto, SETTLEMENT_RULES.debit_card, SETTLEMENT_RULES.credit_card, SETTLEMENT_RULES.credit_installment];
  const ant = [
    { label: "Pix", days: ANTICIPATION_ANALYSIS_DAYS.pix },
    { label: ui("Boleto"), days: ANTICIPATION_ANALYSIS_DAYS.boleto },
     { label: ui("Cartão de crédito"), days: ANTICIPATION_ANALYSIS_DAYS.credit_card },
  ];
  return (
    <PublicPage>
      <main>
         <section className="resource-hero border-b border-border"><div className="section-shell flex flex-col items-center py-16 text-center lg:py-24"><span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><CalendarClock className="size-3.5" />{ui("Prazos WiizePay")}</span><h1 className="hero-title mt-6 max-w-5xl text-4xl font-semibold leading-tight sm:text-6xl"><span className="block">{heroLead}{heroHighlight ? "," : ""}</span>{heroHighlight ? <span className="hero-shine block">{heroHighlight}</span> : null}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{ui("Consulte previsões de liberação, análise de antecipação e processamento de saques por Pix.")}</p></div></section>

        <section className="section-shell py-16 lg:py-20">
           <p className="text-xs font-bold uppercase text-primary">{ui("Recebimentos")}</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{ui("Quando cada pagamento fica disponível.")}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{ui("Os prazos começam após a confirmação do pagamento e seguem as regras de dias úteis indicadas.")}</p>
          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-surface">
            {rows.map((r) => (
              <div key={r.rule} className="grid gap-3 border-b border-border bg-background p-5 last:border-0 sm:grid-cols-[1fr_1.4fr] sm:items-center">
                 <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-accent text-primary"><Wallet className="size-4"/></span><p className="font-semibold">{ui(r.label)}</p></div>
                 <p className="text-sm text-muted-foreground">{ui(r.text)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-surface"><div className="section-shell py-16 lg:py-20">
           <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-md bg-accent text-primary"><Clock3 className="size-5" /></span><h2 className="text-3xl font-semibold">{ui("Antecipação de recebíveis")}</h2></div>
           <p className="mt-3 max-w-2xl text-muted-foreground">{ui("Só podem ser antecipados valores já pagos e liberados para antecipação. A taxa aparece na simulação, antes de você confirmar. Depois do pedido, a antecipação passa por análise:")}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {ant.map((a) => (
              <div key={a.label} className="rounded-lg border border-border bg-background p-5">
                <p className="text-sm text-muted-foreground">{a.label}</p>
                 <p className="mt-3 text-xl font-semibold text-primary">{ui("Até {{days}} dias úteis", { days: a.days })}</p>
              </div>
            ))}
          </div>
        </div></section>

         <section className="section-shell py-16 lg:py-20"><div className="max-w-2xl"><p className="text-xs font-bold uppercase text-primary">{ui("Saques por Pix")}</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{ui("O saque passa por validação antes do envio.")}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{ui("Não há um prazo fixo garantido enquanto a solicitação está em análise. A conclusão depende das validações, do saldo, dos limites da conta e do processamento bancário.")}</p></div><ol className="mt-9 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">{[
          { icon: Send, title: "Solicitação", text: "Você informa o valor e confirma o pedido de saque." },
          { icon: BadgeCheck, title: "Análise protegida", text: "O sistema confere saldo, conta Pix, limites e autenticação." },
          { icon: Landmark, title: "Tarifa do saque", text: "A tarifa de R$ 5 é processada antes do envio do valor." },
          { icon: CheckCircle2, title: "Envio por Pix", text: "Após aprovação, o saque é enviado para a chave cadastrada." },
         ].map((step, index) => <li key={step.title} className="bg-background p-5"><span className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-md bg-accent text-primary"><step.icon className="size-4"/></span><span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span></span><h3 className="mt-6 font-semibold">{ui(step.title)}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{ui(step.text)}</p></li>)}</ol><div className="mt-6 rounded-lg border border-primary/25 bg-primary/10 p-5"><p className="text-sm font-semibold text-primary">{ui("Depois da aprovação")}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{ui("O Pix costuma ser processado rapidamente, mas pode depender da disponibilidade do serviço bancário e do limite Pix da conta. Se a tarifa não puder ser cobrada ou o envio falhar, o saque é recusado e o valor retorna ao saldo.")}</p></div></section>

        <section className="border-t border-border"><div className="section-shell py-12"><div className="surface-panel flex gap-3 p-5 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <p>
             {ui("As datas mostradas são previsões. O dinheiro só vai para o seu saldo disponível quando o recebimento é confirmado de fato. Os prazos contam dias úteis e desconsideram fins de semana e feriados nacionais.")}
          </p>
        </div><div className="mt-6 flex justify-end"><Button asChild><Link to="/auth">{ui("Acessar plataforma")} <ArrowRight /></Link></Button></div></div></section>
      </main>
    </PublicPage>
  );
}
