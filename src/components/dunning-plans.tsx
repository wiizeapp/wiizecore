import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Mail, MessageCircle, MessageSquare, Phone, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { listPublicFees } from "@/lib/fees.functions";
import { formatBRL } from "@/lib/format";
import { Link } from "@tanstack/react-router";

const channelIcons = { whatsapp: MessageCircle, sms: MessageSquare, email: Mail, voice: Phone } as const;

/** Planos públicos da Régua de Cobrança — preços vêm da configuração versionada. */
export function DunningPlans() {
  const { t } = useTranslation("fees");
  const fn = useServerFn(listPublicFees);
  const { data } = useQuery({ queryKey: ["public-fees"], queryFn: () => fn(), staleTime: 300_000 });
  const plans = data?.dunningPlans ?? [];
  return (
    <section className="relative overflow-hidden border-y border-primary/20 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/.18),transparent_38%),linear-gradient(180deg,hsl(var(--surface)),hsl(var(--background)))]">
      <div className="section-shell py-16 lg:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Sparkles className="h-3.5 w-3.5" />{t("dunning.eyebrow")}</p>
        <h2 className="mt-5 text-balance text-3xl font-semibold sm:text-5xl">{t("dunning.title")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t("dunning.subtitle")}</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.length === 0 ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : plans.map((p, i) => (
          <div key={p.code} className={`group relative rounded-2xl border p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-float ${i === 1 ? "border-primary bg-primary/[0.08] md:scale-[1.03]" : "border-border bg-background/70"}`}>
            {i === 1 ? <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">{t("dunning.popular")}</span> : null}
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Zap className="size-5" /></span>
            <p className="mt-5 text-lg font-semibold">{t(`dunning.plans.${p.code}`)}</p>
            <p className="mt-2 font-display text-4xl font-bold tracking-tight">{formatBRL(p.price)}<span className="ml-1 text-xs font-normal text-muted-foreground">{t("dunning.per")}</span></p>
            <p className="mt-3 min-h-10 text-sm leading-5 text-muted-foreground">{t(`dunning.desc.${p.code}`)}</p>
            <ul className="mt-5 space-y-3 border-t border-border/70 pt-5 text-sm">
              {p.channels.map((c) => { const Icon = channelIcons[c as keyof typeof channelIcons] ?? Check; return <li key={c} className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>{t(`dunning.ch.${c}`)}</li>; })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-xl border border-primary/20 bg-background/70 p-5 backdrop-blur sm:flex-row">
        <p className="flex max-w-2xl items-start gap-2 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />{t("dunning.note")}</p>
        <Link to="/auth" search={{ modo: "criar" }} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">{t("dunning.cta")}<ArrowRight className="size-4" /></Link>
      </div>
      </div>
    </section>
  );
}
