import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { matchesSearch } from "@/components/ds/search-field";
import { SuggestCTA, SuggestionDialog, useHasSession } from "@/components/help/help-parts";
import { HELP_ARTICLES, HELP_CATEGORIES, HELP_FAQ, categoryById } from "@/lib/help-content";

export const Route = createFileRoute("/ajuda/")({
  head: () => ({ meta: [{ title: "Central de Ajuda | Wiize Recebe" }, { name: "description", content: "Respostas, guias, taxas, prazos e calculadoras da Wiize Recebe." }] }),
  component: HelpHome,
});

const FEATURED = ["criar-cobranca", "tabela-de-taxas", "prazos-de-liquidacao", "como-funciona-antecipacao", "ativar-pagamentos", "pix-automatico"];

function HelpHome() {
  const { t: ui } = useTranslation("ui");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const signed = useHasSession();
  const results = useMemo(() => {
    if (q.trim().length < 2) return null;
    const arts = HELP_ARTICLES.filter((a) => matchesSearch(q, [a.title, a.summary, ...(a.body ?? []), ...(a.steps ?? []), categoryById(a.category)?.title])).map((a) => ({ kind: "Artigo", slug: a.slug, title: a.title, summary: a.summary, cat: categoryById(a.category)?.title ?? "" }));
    const faq = HELP_FAQ.filter((f) => matchesSearch(q, [f.q, f.a])).map((f) => ({ kind: "Dúvida frequente", slug: f.slug, title: f.q, summary: f.a, cat: "Dúvidas frequentes" }));
    return [...arts, ...faq].slice(0, 20);
  }, [q]);
  const countBy = (id: string) => HELP_ARTICLES.filter((a) => a.category === id).length;

  return (
    <div>
      <PageHeader title={ui("Central de Ajuda")} description={ui("Encontre respostas, aprenda a utilizar a Wiize Recebe e consulte informações sobre taxas, pagamentos e recebimentos.")} />
      <div className="mb-10">
        <div className="relative mx-auto max-w-2xl">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui("Como podemos ajudar você?")} aria-label={ui("Como podemos ajudar você?")} className="h-12 rounded-full bg-card pl-12 text-base shadow-sm" />
        </div>
        {results ? (
          <div className="mt-4" aria-live="polite">
            {results.length ? <ul className="divide-y divide-border rounded-xl border border-border">
              {results.map((r) => (
                <li key={`${r.kind}-${r.title}`}><Link to="/ajuda/artigo/$slug" params={{ slug: r.slug }} className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="min-w-0"><span className="block text-sm font-medium">{ui(r.title)}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{ui(r.summary)}</span></span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{ui(r.kind === "Artigo" ? r.cat : r.kind)}</span>
                </Link></li>
              ))}
            </ul> : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
              <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">{ui("Nenhum resultado encontrado")}</p>
              <p className="max-w-md text-sm text-muted-foreground">{ui("Tente outras palavras, envie uma sugestão de conteúdo ou fale com o suporte.")}</p>
              <div className="flex flex-wrap justify-center gap-2">{signed ? <Button size="sm" onClick={() => setOpen(true)}>{ui("Enviar sugestão")}</Button> : null}<Button size="sm" variant="outline" asChild><Link to="/suporte">{ui("Falar com o suporte")}</Link></Button></div>
            </div>}
          </div>
        ) : null}
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold">{ui("Categorias")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {HELP_CATEGORIES.map((c) => (
          <Link key={c.id} to="/ajuda/$categoria" params={{ categoria: c.id }} className="group flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="min-w-0"><span className="block font-semibold">{ui(c.title)}</span><span className="mt-1 block text-sm text-muted-foreground">{ui(c.description)}</span>
              <span className="mt-2 block text-xs text-muted-foreground">{c.id === "duvidas" ? `${HELP_FAQ.length} ${ui("perguntas")}` : `${countBy(c.id)} ${ui("artigos")}`}</span></span>
          </Link>
        ))}
        <Link to="/ajuda/calculadoras" className="group flex gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span><span className="block font-semibold">{ui("Calculadoras")}</span><span className="mt-1 block text-sm text-muted-foreground">{ui("Simule taxas, valor líquido e antecipação.")}</span></span>
        </Link>
      </div>

      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">{ui("Mais acessados")}</h2>
      <div className="surface-panel divide-y divide-border">
        {FEATURED.map((s) => HELP_ARTICLES.find((a) => a.slug === s)).filter(Boolean).map((a) => (
          <Link key={a!.slug} to="/ajuda/artigo/$slug" params={{ slug: a!.slug }} className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
            <span className="min-w-0"><span className="block text-sm font-medium">{ui(a!.title)}</span><span className="block truncate text-xs text-muted-foreground">{ui(a!.summary)}</span></span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
      <SuggestCTA sourceLabel="Central de Ajuda" />
      {signed ? <SuggestionDialog open={open} onOpenChange={setOpen} defaultCategory="help_content" sourceLabel={`Busca: ${q}`} /> : null}
    </div>
  );
}
