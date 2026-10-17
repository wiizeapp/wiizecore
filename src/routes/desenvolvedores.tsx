import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowRight, BookOpen, Copy, FileText, KeyRound, Rocket, ShieldCheck, Sparkles, Webhook } from "lucide-react";
import { PublicPage } from "@/components/public-site";
import { Button } from "@/components/ui/button";
import { AiGuideCard } from "@/components/developer/ai-guide-card";
import { DOC_SECTIONS, LLMS_API_URL, type DocBlock } from "@/lib/api-docs-content";
import { EXT_API_BASE } from "@/lib/ext-docs";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/desenvolvedores")({
  head: () => pageHead({ path: "/desenvolvedores", title: "Documentação da API — Wiize Core", description: "Documentação completa da API da Wiize Core: autenticação, checkout, cobranças, assinaturas, webhooks e testes.", ogDescription: "Integre cobranças e assinaturas ao seu sistema com a API da Wiize Core.", breadcrumb: [{ name: "Desenvolvedores", path: "/desenvolvedores" }] }),
  component: DocsPage,
});

function CodeBlock({ code, label }: { code: string; label?: string | undefined }) {
  const { t } = useTranslation("ui");
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>{label ?? "code"}</span>
        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { void navigator.clipboard.writeText(code); toast.success(t("Copiado.")); }}><Copy className="size-3" />{t("Copiar")}</button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-5"><code>{code}</code></pre>
    </div>
  );
}

function Block({ b }: { b: DocBlock }) {
  const { t } = useTranslation("ui");
  if (b.kind === "p") return <p>{b.text}</p>;
  if (b.kind === "note") return <div className="rounded-md border-l-4 border-primary bg-surface p-4 font-medium text-foreground">{b.text}</div>;
  if (b.kind === "list") return <ul className="grid gap-2">{b.items.map((i) => <li key={i} className="grid grid-cols-[auto_1fr] gap-3"><ArrowRight className="mt-1.5 size-3.5 text-primary" /><span>{i}</span></li>)}</ul>;
  if (b.kind === "code") return <CodeBlock code={b.code} label={b.label} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-foreground"><tr>{b.head.map((h) => <th key={h} className="p-2.5 font-semibold">{t(h)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r) => <tr key={r.join()} className="border-t border-border">{r.map((c, i) => <td key={i} className={i === 0 ? "p-2.5 font-mono text-foreground" : "p-2.5"}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const GROUP_ORDER = ["Começo", "Segurança", "Implementação", "Webhooks", "Testes", "Referência"];
const SECTIONS = [...DOC_SECTIONS].sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group));
const QUICK = [
  { id: "inicio-rapido", label: "Início rápido", icon: Rocket },
  { id: "checkout", label: "Criar checkout", icon: KeyRound },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "guia-ia", label: "Guia para IA", icon: Sparkles },
];

function DocsPage() {
  const { t } = useTranslation("ui");
  const groups = GROUP_ORDER.filter((g) => SECTIONS.some((s) => s.group === g));
  const [active, setActive] = useState(SECTIONS[0]?.id ?? "guia-ia");
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = "guia-ia";
      for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el && el.getBoundingClientRect().top <= 140) current = s.id; }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = SECTIONS.at(-1)?.id ?? current;
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const activeGroup = SECTIONS.find((s) => s.id === active)?.group;

  return (
    <PublicPage followTheme>
      <main className="bg-surface/45">
        <section className="border-b border-border bg-background">
          <div className="section-shell py-12 lg:py-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-accent px-3 py-1.5 text-xs font-bold uppercase text-accent-foreground"><BookOpen className="size-4" />{t("Desenvolvedores")}</div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl">{t("Documentação da API")}</h1>
              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">{t("Tudo o que o seu sistema precisa para criar cobranças, abrir o checkout, acompanhar assinaturas e receber avisos de pagamento.")}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button asChild><Link to="/integracao-externa"><KeyRound className="size-4" />{t("Criar chave de API")}</Link></Button>
                <Button asChild variant="outline"><a href={LLMS_API_URL} target="_blank" rel="noreferrer"><FileText className="size-4" />llms-api.txt</a></Button>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">{EXT_API_BASE}</p>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {[{ i: KeyRound, ti: "Chaves separadas", d: "Teste e Produção nunca se misturam." }, { i: Webhook, ti: "Avisos assinados", d: "Webhooks com assinatura e novas tentativas." }, { i: ShieldCheck, ti: "Criação protegida", d: "Chaves e webhooks exigem login e senha financeira." }].map((x) => (
                <article key={x.ti} className="rounded-lg border border-border bg-card p-5 shadow-card"><x.i className="size-5 text-primary" /><h2 className="mt-3 font-semibold">{t(x.ti)}</h2><p className="mt-1 text-sm text-muted-foreground">{t(x.d)}</p></article>
              ))}
            </div>
          </div>
        </section>

        <div className="section-shell grid gap-8 py-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:py-14">
          <aside className="hidden lg:block">
            <nav aria-label={t("Índice")} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="px-3 text-xs font-bold uppercase text-muted-foreground">{t("Acessos rápidos")}</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {QUICK.map((q) => (
                  <a key={q.id} href={`#${q.id}`} aria-current={active === q.id ? "location" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-2.5 text-xs font-medium transition-colors hover:bg-accent ${active === q.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}><q.icon className="size-3.5 text-primary" />{t(q.label)}</a>
                ))}
              </div>
              <div className="my-4 h-px bg-border" />
              {groups.map((g) => (
                <div key={g} className="mb-4 last:mb-0">
                  <p className={`px-3 text-xs font-bold uppercase ${activeGroup === g ? "text-primary" : "text-muted-foreground"}`}>{t(g)}</p>
                  <div className="mt-1.5 grid gap-0.5 border-l border-border pl-1 ml-3">
                    {SECTIONS.filter((s) => s.group === g).map((s) => (
                      <a key={s.id} data-doc={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined} className={`-ml-[5px] border-l-2 px-3 py-1.5 text-sm transition-colors hover:text-foreground ${active === s.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"}`}>{t(s.title)}</a>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
          <article className="min-w-0 space-y-5">
            <div id="guia-ia" className="scroll-mt-24"><AiGuideCard /></div>
            {SECTIONS.map((s) => (
              <section id={s.id} key={s.id} className="scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-card sm:p-7">
                <p className="text-xs font-bold uppercase text-primary">{t(s.group)}</p>
                <h2 className="mt-1 text-xl font-semibold">{t(s.title)}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </PublicPage>
  );
}
