import { useTranslation } from "react-i18next";
import { FINANCIAL_PROVIDER } from "@/lib/financial-provider";
import { contrastRatio } from "@/lib/checkout-appearance";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function AsaasSeal({ background }: { background?: string | undefined }) {
  const { t } = useTranslation("ui");
  const light = background ? contrastRatio(background, "#000000") >= contrastRatio(background, "#FFFFFF") : undefined;
  const image = (src: string, className: string) => <img src={src} alt={t("Serviços financeiros Asaas")} width={120} height={36} className={`h-9 w-[120px] max-w-full object-contain ${className}`} />;
  return <a href={FINANCIAL_PROVIDER.site} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {light === undefined ? <>{image(FINANCIAL_PROVIDER.seals.positive, "dark:hidden")}{image(FINANCIAL_PROVIDER.seals.white, "hidden dark:block")}</> : image(light ? FINANCIAL_PROVIDER.seals.black : FINANCIAL_PROVIDER.seals.white, "")}
  </a>;
}

export function FinancialIdentity({ background }: { background?: string | undefined }) {
  const { t } = useTranslation("ui");
  return <div className="flex flex-col items-center justify-center gap-2 text-center">
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3"><Brand size="sm" /><AsaasSeal background={background} /></div>
    <p className="text-xs leading-5 text-muted-foreground">{t("Plataforma Wiize Core. Serviços financeiros prestados pelo Asaas.")}</p>
  </div>;
}

export function FinancialSupport({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("ui");
  return <section aria-label={t("Suporte financeiro")} className={compact ? "space-y-2 text-xs" : "mt-10 border-y border-border py-7"}>
    <h2 className={compact ? "font-semibold text-foreground" : "font-display text-lg font-semibold"}>{t("Suporte financeiro")}</h2>
    {!compact ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("Precisa de ajuda com pagamentos, recebimentos ou movimentações financeiras? Acesse os canais de atendimento relacionados às operações financeiras.")}</p> : null}
    <p className={`${compact ? "" : "mt-3 text-sm"} text-muted-foreground`}>{t("Atendimento financeiro Asaas:")} <a href={FINANCIAL_PROVIDER.phoneHref} className="hover:underline">{FINANCIAL_PROVIDER.phone}</a> — {t("telefone para pessoa jurídica e canal de mensagens no mesmo número.")}</p>
    <a href={FINANCIAL_PROVIDER.supportHref} className="mt-2 block text-sm text-primary hover:underline">{FINANCIAL_PROVIDER.email}</a>
    <Button asChild variant="outline" size="sm" className="mt-3"><a href={FINANCIAL_PROVIDER.supportHref} target="_blank" rel="noopener noreferrer">{t("Acessar suporte financeiro")}</a></Button>
    {!compact ? <p className="mt-4 text-xs text-muted-foreground">{t("Para acesso, configuração e uso da plataforma, fale com o suporte Wiize Core.")}</p> : null}
  </section>;
}
/** Logo Wiize Core ao lado do selo oficial, separados por um divisor sutil. */
export function BrandWithSeal({ background }: { background?: string | undefined }) {
  return <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"><Brand size="sm" /><span aria-hidden="true" className="h-6 w-px bg-border" /><AsaasSeal background={background} /></div>;
}
/** Rodapé discreto com a logo Wiize Core e o selo oficial lado a lado. */
export function SealFooter({ background, className = "" }: { background?: string | undefined; className?: string }) {
  return <footer className={`flex justify-center border-t border-border px-4 py-3 ${className}`}><BrandWithSeal background={background} /></footer>;
}
