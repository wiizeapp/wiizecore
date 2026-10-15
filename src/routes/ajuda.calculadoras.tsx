import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app-shell";
import { AnticipationCalculator, FeeCalculator, HelpBreadcrumb, SuggestCTA } from "@/components/help/help-parts";

export const Route = createFileRoute("/ajuda/calculadoras")({
  head: () => ({ meta: [{ title: "Calculadoras | Central de Ajuda Wiize Core" }, { name: "description", content: "Informações e recursos da plataforma Wiize Core." }, { property: "og:title", content: "Calculadoras | Central de Ajuda Wiize Core" }, { property: "og:description", content: "Informações e recursos da plataforma Wiize Core." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },] }),
  component: CalculatorsPage,
});

function CalculatorsPage() {
  const { t: ui } = useTranslation("ui");
  return (
    <div>
      <HelpBreadcrumb items={[{ label: "Calculadoras" }]} />
      <PageHeader title={ui("Calculadoras")} description={ui("Simule taxas, valor líquido e antecipação com as condições vigentes.")} />
      <section className="space-y-3"><h2 className="font-display text-lg font-semibold">{ui("Calculadora de taxas")}</h2><FeeCalculator /></section>
      <section className="mt-10 space-y-3"><h2 className="font-display text-lg font-semibold">{ui("Calculadora de antecipação")}</h2><AnticipationCalculator /></section>
      <SuggestCTA category="fees" sourceLabel="Calculadoras" />
    </div>
  );
}
