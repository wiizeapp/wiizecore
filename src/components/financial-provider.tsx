import { useTranslation } from "react-i18next";
import { FINANCIAL_PROVIDER } from "@/lib/financial-provider";
import { contrastRatio } from "@/lib/checkout-appearance";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function AsaasSeal({ background }: { background?: string }) {
  const { t } = useTranslation("ui");
  const light = background ? contrastRatio(background, "#000000") >= contrastRatio(background, "#FFFFFF") : undefined;
  const image = (src: string, className: string) => <img src={src} alt={t("Serviços financeiros Asaas")} width={160} height={48} className={`h-12 w-40 max-w-full object-contain ${className}`} />;
  return <a href={FINANCIAL_PROVIDER.site} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {light === undefined ? <>{image(FINANCIAL_PROVIDER.seals.positive, "dark:hidden")}{image(FINANCIAL_PROVIDER.seals.white, "hidden dark:block")}</> : image(light ? FINANCIAL_PROVIDER.seals.positive : FINANCIAL_PROVIDER.seals.white, "")}
  </a>;
}

export function FinancialIdentity({ background }: { background?: string }) {
  const { t } = useTranslation("ui");
  return <div className="flex flex-col items-center justify-center gap-3 text-center">
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3"><Brand /><AsaasSeal background={background} /></div>
    <p className="text-xs leading-5 text-muted-foreground">{t("Plataforma Wiize Recebe. Serviços financeiros prestados pelo Asaas.")}</p>
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
    {!compact ? <p className="mt-4 text-xs text-muted-foreground">{t("Para acesso, configuração e uso da plataforma, fale com o suporte Wiize Recebe.")}</p> : null}
  </section>;
}