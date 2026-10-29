import { useTranslation } from "react-i18next";
import { Fingerprint, ShieldCheck, FileCheck2, ArrowUpRight, Clock3 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GlobePulse } from "@/components/ui/cobe-globe-pulse";

export function ThreeDsSecurity() {
  const { t: ui } = useTranslation("ui");
  return <section className="secure-three-ds overflow-hidden" aria-labelledby="secure-three-ds-title">
    <div className="section-shell py-16 lg:py-24">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase text-primary"><ShieldCheck className="size-4" />{ui("Autenticação de cartão")}</p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{ui("Homologação em produção pendente")}</p>
      </div>
      <div className="relative grid gap-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:py-14">
        <div className="relative z-10 min-w-0"><h2 id="secure-three-ds-title" className="text-4xl font-semibold leading-tight sm:text-5xl">{ui("3D Secure Asaas")}</h2><p className="mt-5 max-w-xl text-xl font-medium leading-relaxed">{ui("Uma verificação a mais. Uma decisão mais segura.")}</p><p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">{ui("A integração preparada pela WiizePay conecta o pagamento à autenticação do banco emissor. Quando habilitada, o banco pode verificar a identidade do comprador antes de seguir com a transação.")}</p>
          <div className="mt-7 flex items-center gap-3 border-l-2 border-primary pl-4"><Fingerprint className="size-6 shrink-0 text-primary" /><p className="text-sm font-medium">{ui("Infraestrutura financeira Asaas. Controle e acompanhamento WiizePay.")}</p></div>
          <Button asChild variant="link" className="mt-5 h-auto px-0"><Link to="/contestacoes">{ui("Central de Contestações")}<ArrowUpRight className="size-4" /></Link></Button>
        </div>
        <div className="secure-globe-stage relative min-w-0"><GlobePulse /></div>
      </div>
      <div className="grid gap-8 border-y border-border py-8 md:grid-cols-3 md:gap-10">
        {[
          { icon: Fingerprint, n: "01", title: "Verificação pelo emissor", text: "O banco pode solicitar uma confirmação adicional ao comprador. O retorno da verificação não aprova o pagamento sozinho." },
          { icon: ShieldCheck, n: "02", title: "Menos exposição à fraude", text: "Uma camada adicional para reduzir o risco de uso indevido do cartão, conforme as regras da bandeira, do emissor e do Asaas." },
          { icon: FileCheck2, n: "03", title: "Defesa bem acompanhada", text: "Dados oficiais, prazos e documentos reunidos na Central de Contestações. Enviar uma defesa não garante a reversão da disputa." },
        ].map(item => <article key={item.n}><div className="flex items-center justify-between"><item.icon className="size-5 text-primary" /><span className="font-mono text-xs text-muted-foreground">{item.n}</span></div><h3 className="mt-4 text-base font-semibold">{ui(item.title)}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{ui(item.text)}</p></article>)}
      </div>
      <div className="grid gap-4 pt-8 lg:grid-cols-[1fr_2fr] lg:gap-14"><p className="flex items-start gap-2 text-sm font-semibold"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />{ui("Integração preparada. Ativação condicionada.")}</p><div><p className="text-sm leading-6 text-muted-foreground">{ui("O 3DS permanece desligado até a habilitação da conta e a liberação autorizada para teste. O ambiente de testes Asaas não reproduz o desafio 3DS: o módulo só será considerado concluído após um teste real na conta de produção habilitada.")}</p><p className="mt-3 text-xs leading-6 text-muted-foreground">{ui("Nenhuma camada elimina totalmente a fraude ou garante ausência de prejuízos. A confirmação de pagamento não comprova autenticação 3DS; os efeitos da proteção dependem da transação e das regras aplicáveis.")}</p></div></div>
    </div>
  </section>;
}