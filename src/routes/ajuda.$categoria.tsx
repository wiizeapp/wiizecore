import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpBreadcrumb, SuggestCTA } from "@/components/help/help-parts";
import { HELP_ARTICLES, HELP_FAQ, categoryById } from "@/lib/help-content";

export const Route = createFileRoute("/ajuda/$categoria")({
  loader: ({ params }) => { const c = categoryById(params.categoria); if (!c) throw notFound(); return { category: c }; },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.category.title ?? "Ajuda"} | Central de Ajuda WiizePay` }, { name: "description", content: "Informações e recursos da plataforma WiizePay." }, { property: "og:title", content: `${loaderData?.category.title ?? "Ajuda"} | Central de Ajuda WiizePay` }, { property: "og:description", content: "Informações e recursos da plataforma WiizePay." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },] }),
  component: CategoryPage,
});

function CategoryPage() {
  const { t: ui } = useTranslation("ui");
  const { category } = Route.useLoaderData();
  const articles = HELP_ARTICLES.filter((a) => a.category === category.id);
  return (
    <div>
      <HelpBreadcrumb items={[{ label: category.title }]} />
      <PageHeader title={ui(category.title)} description={ui(category.description)} action={<Button variant="outline" size="sm" asChild><Link to="/ajuda"><ArrowLeft className="mr-1.5 size-4" />{ui("Voltar")}</Link></Button>} />
      {category.id === "duvidas" ? (
        <div className="surface-panel px-5">
          <Accordion type="single" collapsible>
            {HELP_FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left">{ui(f.q)}</AccordionTrigger>
                <AccordionContent><p className="text-muted-foreground">{ui(f.a)}</p><Link to="/ajuda/artigo/$slug" params={{ slug: f.slug }} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{ui("Ler artigo completo")}<ArrowRight className="size-3.5" /></Link></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {articles.map((a) => (
            <Link key={a.slug} to="/ajuda/artigo/$slug" params={{ slug: a.slug }} className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              
              <span className="min-w-0"><span className="block font-semibold">{ui(a.title)}</span><span className="mt-1 block text-sm text-muted-foreground">{ui(a.summary)}</span>
                <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" aria-hidden="true" />{a.minutes} min{a.steps ? ` · ${ui("Passo a passo")}` : ""}</span></span>
            </Link>
          ))}
        </div>
      )}
      <SuggestCTA category="help_content" sourceLabel={category.title} />
    </div>
  );
}
