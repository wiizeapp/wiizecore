import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnticipationCalculator, ArticleFeedback, Callout, FeeCalculator, FeeTable, HelpBreadcrumb, SettlementTable, SuggestCTA } from "@/components/help/help-parts";
import { articleBySlug, categoryById } from "@/lib/help-content";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ajuda/artigo/$slug")({
  loader: ({ params }) => { const a = articleBySlug(params.slug); if (!a) throw notFound(); return { article: a, category: categoryById(a.category)! }; },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.article.title ?? "Artigo"} | Central de Ajuda WiizePay` }, { name: "description", content: loaderData?.article.summary ?? "" }] }),
  component: ArticlePage,
});

function ArticlePage() {
  const { t: ui } = useTranslation("ui");
  const { article: a, category } = Route.useLoaderData();
  const related = (a.related ?? []).map(articleBySlug).filter(Boolean);
  return (
    <div className="mx-auto max-w-3xl">
      <HelpBreadcrumb items={[{ label: category.title, to: "/ajuda/$categoria", params: { categoria: category.id } }, { label: a.title }]} />
      <article>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{ui(category.title)}</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{ui(a.title)}</h1>
        <p className="mt-2 text-muted-foreground">{ui(a.summary)}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden="true" />{ui("Atualizado em")} {formatDate(a.updated)}</span>
          <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{a.minutes} min {ui("de leitura")}</span>
        </div>
        <div className="mt-8 space-y-4 text-[15px] leading-7">{a.body.map((p) => <p key={p}>{ui(p)}</p>)}</div>
        {a.steps ? <ol className="mt-6 space-y-3">{a.steps.map((s, i) => (
          <li key={s} className="flex gap-3 rounded-xl border border-border bg-card p-4"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span><span className="pt-0.5 text-sm">{ui(s)}</span></li>
        ))}</ol> : null}
        {a.widget ? <div className="mt-8">{a.widget === "fees" ? <FeeTable /> : a.widget === "settlement" ? <SettlementTable /> : a.widget === "fee-calc" ? <FeeCalculator /> : <AnticipationCalculator />}</div> : null}
        {a.notes?.length ? <div className="mt-6 space-y-2">{a.notes.map((n) => <Callout key={n}>{ui(n)}</Callout>)}</div> : null}
        {a.pending ? <div className="mt-3"><Callout tone="warn"><strong className="text-foreground">{ui("Pendente de validação")}: </strong>{ui(a.pending)}</Callout></div> : null}
        {a.link ? <Button className="mt-6" asChild><Link to={a.link.to as "/painel"}>{ui(a.link.label)}<ArrowRight className="ml-1.5 size-4" /></Link></Button> : null}
        <ArticleFeedback slug={a.slug} />
      </article>
      {related.length ? <div className="mt-10"><h2 className="mb-3 font-display text-lg font-semibold">{ui("Artigos relacionados")}</h2>
        <div className="surface-panel divide-y divide-border">{related.map((r) => <Link key={r!.slug} to="/ajuda/artigo/$slug" params={{ slug: r!.slug }} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/40">{ui(r!.title)}<ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}</div></div> : null}
      <div className="mt-6"><Button variant="ghost" size="sm" asChild><Link to="/ajuda/$categoria" params={{ categoria: category.id }}><ArrowLeft className="mr-1.5 size-4" />{ui("Voltar para")} {ui(category.title)}</Link></Button></div>
      <SuggestCTA category="help_content" sourceLabel={a.title} />
    </div>
  );
}
