import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DunningPlans } from "@/components/dunning-plans";
import { ArrowRight, Calculator, CheckCircle2, Clock3, CreditCard, FileText, Info, Landmark, QrCode } from "lucide-react";
import { PublicPage } from "@/components/public-site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listPublicFees, simulatePaymentFee } from "@/lib/fees.functions";
import { formatBRL, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/taxas")({
  head: () => pageHead({ path: "/taxas", title: "Taxas Wiize Core | Tarifas e Condições de Pagamento", description: "Saiba quanto custa receber por Pix, boleto e cartão na Wiize Core. Cobrança, notas fiscais, contratos, clientes e gestão financeira em um só lugar, sem mensalidade e sem custos escondidos.", ogDescription: "Taxas transparentes para receber e controle completo do seu negócio: notas fiscais, contratos, clientes e gestão financeira.", breadcrumb: [{ name: "Taxas", path: "/taxas" }] }),
  component: FeesPage,
});

type Method = "pix" | "pix_recurring" | "boleto" | "debit_card" | "credit_card";
const METHODS: Method[] = ["pix", "pix_recurring", "boleto", "credit_card"];
type FeeRow = { id: string; payment_method: string; installment_min: number; installment_max: number; fixed_fee: number; percentage_fee: number };

/** Valor fixo discreto + percentual em destaque — sempre a partir da configuração oficial. */
function Rate({ row, promotional = false }: { row?: FeeRow | undefined; promotional?: boolean }) {
  const { t } = useTranslation("fees");
  if (!row) return <span className="text-sm text-muted-foreground">{t("loading")}</span>;
  const fixed = Number(row.fixed_fee) > 0 ? formatBRL(row.fixed_fee) : null;
  const pct = promotional ? formatPercent(0) : Number(row.percentage_fee) > 0 ? formatPercent(row.percentage_fee) : null;
  if (!fixed && !pct) return <span className="font-semibold">{t("noFee")}</span>;
  return (
    <span className="numeric-tabular inline-grid min-w-[12rem] grid-cols-[1fr_auto_1fr] items-center gap-2 whitespace-nowrap rounded-lg border border-border/60 bg-background/50 px-3 py-2">
      <span className="flex flex-col items-end">
        <span className="block text-[10px] font-semibold uppercase text-muted-foreground">{t("rate.fixed")}</span>
        <span className="flex h-8 items-center text-sm font-medium text-muted-foreground">{fixed ?? formatBRL(0)}</span>
      </span>
      <span className="self-end pb-1.5 text-sm text-muted-foreground">+</span>
      <span>
        <span className="block text-[10px] font-semibold uppercase text-muted-foreground">{t("rate.percentage")}</span>
        <span className="flex h-8 items-center text-2xl font-bold leading-none text-primary">{pct ?? formatPercent(0)}</span>
      </span>
    </span>
  );
}

/** Aviso discreto, em largura total, dentro do próprio card. */
function PromoNote({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border/40 bg-foreground/[0.045] px-4 py-2.5 text-xs leading-5 text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function Block({ icon: Icon, title, desc, note, noteClass = "", footer, children, className = "" }: { icon: typeof QrCode; title: string; desc: string; note?: string; noteClass?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <article className={`flex flex-col rounded-xl border border-border bg-surface p-6 sm:p-8 ${className}`}>
      <header className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div><h3 className="text-xl font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{desc}</p></div>
      </header>
      {note ? <p className={`mt-5 flex gap-2 rounded-lg bg-background/60 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground ${noteClass}`.trim()}><Info className="mt-0.5 size-3.5 shrink-0 text-primary" />{note}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-auto pt-6">{footer}</div> : null}
    </article>
  );
}

function RateLine({ label, hint, extra, row, promotional = false }: { label: string; hint: string; extra?: string | undefined; row?: FeeRow | undefined; promotional?: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 py-5 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-medium">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{hint}{extra ? <> · {extra}</> : null}</p></div>
      <div className="shrink-0 sm:max-w-[15rem]"><Rate row={row} promotional={promotional} /></div>
    </div>
  );
}

function TierList({ rows, singleLabel, rangeKey, promoteSingle = false }: { rows: FeeRow[]; singleLabel: string; rangeKey: string; promoteSingle?: boolean }) {
  const { t } = useTranslation("fees");
  return (
    <dl>
      {rows.map((row) => (
        <div key={row.id} className="flex min-h-16 flex-col justify-center gap-2 border-t border-border/60 py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-sm text-muted-foreground">{row.installment_max <= 1 ? singleLabel : t(rangeKey, { min: row.installment_min, max: row.installment_max })}</dt>
           <dd className="shrink-0 sm:max-w-[15rem]"><Rate row={row} promotional={promoteSingle && row.installment_max === 1} /></dd>
        </div>
      ))}
      {!rows.length ? <p className="py-4 text-sm text-muted-foreground">{t("loading")}</p> : null}
    </dl>
  );
}

function FeesPage() {
  const { t } = useTranslation("fees");
  const list = useServerFn(listPublicFees);
  const { data } = useQuery({ queryKey: ["public-fees"], queryFn: () => list() });
  const rows: FeeRow[] = data?.paymentFees ?? [];
  const by = (m: string) => rows.filter((r) => r.payment_method === m);
  const pix = by("pix")[0];
  const pixRec = by("pix_recurring")[0];
  const boleto = by("boleto");
  const credit = by("credit_card");
  const boletoSingle = boleto.find((r) => r.installment_max <= 1);
  const promoRate = pix?.percentage_fee ?? boletoSingle?.percentage_fee;
  const maxCredit = credit.reduce((m, r) => Math.max(m, r.installment_max), 0) || 21;
  const service = data?.serviceFees;
  const anticipation = data?.anticipationFees ?? [];
  const antOrder = ["boleto", "credit_card_installment", "credit_card_single", "pix"];
  const antSorted = [...anticipation].sort((a, b) => antOrder.indexOf(a.payment_method) - antOrder.indexOf(b.payment_method));
  const serviceRows = [
    service?.invoice != null ? { label: t("services.invoice"), value: formatBRL(service.invoice) } : null,
    service?.withdrawal != null ? { label: t("services.withdrawal"), value: service.withdrawal > 0 ? formatBRL(service.withdrawal) : t("services.free") } : null,
    service?.minimumWithdrawal != null ? { label: t("services.minWithdrawal"), value: formatBRL(service.minimumWithdrawal) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <PublicPage>
      <main data-i18n-native>
        <section className="resource-hero relative overflow-hidden border-b border-border">
          <div className="section-shell relative z-10 flex flex-col items-center py-16 text-center lg:py-24">
            <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">{t("hero.eyebrow")}</span>
            <h1 className="hero-title mt-6 max-w-4xl text-balance text-4xl font-semibold leading-tight sm:text-6xl"><span className="block">{t("hero.lead")}</span><span className="hero-shine block">{t("hero.highlight")}</span></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t("hero.subtitle")}</p>
          </div>
        </section>

        <section className="section-shell py-16 lg:py-20">
          <div className="mb-10 overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
            <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:p-7">
              <div className="sm:border-r sm:border-primary/20 sm:pr-8"><p className="numeric-tabular text-5xl font-bold leading-none text-primary">{formatPercent(0)}</p><p className="mt-2 text-sm font-medium">{t("promo.duration")}</p></div>
              <div><p className="text-xs font-semibold uppercase text-primary">{t("promo.eyebrow")}</p><h2 className="mt-2 text-xl font-semibold sm:text-2xl">{t("promo.body")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("promo.fixed")}</p></div>
            </div>
            <p className="flex gap-2 border-t border-primary/15 px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-7"><Info className="mt-0.5 size-3.5 shrink-0" />{t("promo.note")}</p>
          </div>
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("methods.title")}</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Block icon={QrCode} title={t("pix.title")} desc={t("pix.desc")} note={t("pix.note")} noteClass="lg:min-h-[4.25rem]" footer={promoRate != null ? <PromoNote text={t("promo.stripPix", { rate: formatPercent(promoRate) })} /> : undefined}>
              <RateLine label={t("pix.single")} hint={t("pix.perTx")} row={pix} promotional />
              <RateLine label={t("pix.recurring")} hint={t("pix.perCharge")} row={pixRec} />
            </Block>
            <Block icon={Landmark} title={t("boleto.title")} desc={t("boleto.desc")} note={t("boleto.note")} noteClass="lg:min-h-[4.25rem]" footer={promoRate != null ? <PromoNote text={t("promo.stripBoleto", { rate: formatPercent(promoRate) })} /> : undefined}>
              <TierList rows={boleto} singleLabel={t("boleto.single")} rangeKey="boleto.range" promoteSingle />
              <div className="mt-4 border-t border-border/60 pt-4"><RateLine label={t("boleto.recurring")} hint={t("boleto.recurringHint")} row={boletoSingle} /></div>
            </Block>
            <Block icon={CreditCard} title={t("cards.title")} desc={t("cards.subtitle")} className="lg:col-span-2">
              <div className="grid gap-5">
                <section className="rounded-lg border border-border/70 bg-background/35 p-4 sm:p-5">
                  <div className="mb-5 flex items-center gap-3 border-b border-border/60 pb-4"><span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><CreditCard className="size-4" /></span><div><h4 className="font-semibold">{t("cards.creditTitle")}</h4><p className="text-xs text-muted-foreground">{t("cards.desc", { max: maxCredit })}</p></div></div>
                  <TierList rows={credit} singleLabel={t("cards.creditSingle")} rangeKey="cards.creditRange" />
                  <div className="mt-4 border-t border-border/60 pt-4"><RateLine label={t("cards.recurring")} hint={t("cards.recurringHint")} row={credit.find((r) => r.installment_max <= 1)} /></div>
                  <p className="mt-5 flex gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0 text-primary" />{t("cards.note")}</p>
                </section>
              </div>
            </Block>
          </div>
        </section>

        <DunningPlans />

        <section className="border-y border-border bg-surface/40">
          <div className="section-shell grid items-stretch gap-5 py-16 lg:grid-cols-2 lg:py-20">
            <Block icon={FileText} title={t("services.title")} desc={t("services.subtitle")}>
              <dl>
                {serviceRows.length ? serviceRows.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-4 border-b border-border/50 py-4 last:border-b-0">
                    <dt className="text-sm text-muted-foreground">{s.label}</dt><dd className="numeric-tabular text-lg font-semibold">{s.value}</dd>
                  </div>
                )) : <p className="text-sm text-muted-foreground">{t("loading")}</p>}
              </dl>
            </Block>
            <Block icon={Clock3} title={t("anticipation.title")} desc={t("anticipation.subtitle")}>
              <div className="grid gap-3">
                {antSorted.length ? antSorted.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-4 py-3.5">
                    <span className="text-sm">{t(`anticipation.${a.payment_method}`, { defaultValue: t("anticipation.other") })}</span>
                    <span className="numeric-tabular whitespace-nowrap"><span className="text-lg font-semibold text-primary">{formatPercent(a.monthly_percentage_fee)}</span> <span className="text-xs text-muted-foreground">{t("anticipation.perMonth")}</span></span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">{t("loading")}</p>}
              </div>
              <Link to="/prazos" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{t("anticipation.prazos")} <ArrowRight className="size-4" /></Link>
            </Block>
          </div>
        </section>

        <Simulator />

        <section className="section-shell max-w-4xl py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("faq.title")}</h2>
          <div className="mt-6 divide-y divide-border/60 border-y border-border/60">
            {[1, 2, 3].map((n) => (
              <details key={n} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{t(`faq.q${n}`)}<span className="text-primary transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(`faq.a${n}`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="section-shell pb-20">
          <div className="flex flex-col items-start justify-between gap-5 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
            <div><h2 className="text-2xl font-semibold">{t("cta.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("cta.subtitle")}</p></div>
            <Button asChild size="lg"><Link to="/auth" search={{ modo: "criar" }}>{t("cta.button")} <ArrowRight className="ml-1 size-4" /></Link></Button>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}

function Simulator() {
  const { t } = useTranslation("fees");
  const simulate = useServerFn(simulatePaymentFee);
  const [amount, setAmount] = useState("1000,00");
  const [method, setMethod] = useState<Method>("pix");
  const [installments, setInstallments] = useState(1);
  const [share, setShare] = useState(0);
  const allowsInst = method === "credit_card" || method === "debit_card" || method === "boleto" || method === "pix";
  const normalized = amount.replace(/\./g, "").replace(",", ".");
  const { data: result, isFetching } = useQuery({
    queryKey: ["fee-simulation", method, normalized, installments, share],
    queryFn: () => simulate({ data: { paymentMethod: method, grossAmount: normalized, installments: allowsInst ? installments : 1, feePassShare: share } }),
    enabled: /^\d+(?:\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0,
  });
  useEffect(() => { if (!allowsInst) setInstallments(1); }, [allowsInst]);
  const n = result?.installments ?? 1;
  return (
    <section className="section-shell py-16 lg:py-20">
      <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-wider text-primary">{t("sim.eyebrow")}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{t("sim.title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("sim.subtitle")}</p></div>
      <div className="mt-8 grid overflow-hidden rounded-xl border border-border bg-surface lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5 border-b border-border p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <div className="space-y-2"><Label>{t("sim.amount")}</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-12 text-lg" /></div>
          <div className="space-y-2"><Label>{t("sim.method")}</Label><Select value={method} onValueChange={(v) => setMethod(v as Method)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{t(`sim.labels.${m}`)}</SelectItem>)}</SelectContent></Select></div>
          {allowsInst ? <div className="space-y-2"><Label>{t("sim.installments")}</Label><Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 21 }, (_, i) => i + 1).map((k) => <SelectItem key={k} value={String(k)}>{k}x</SelectItem>)}</SelectContent></Select>{installments > 1 ? <p className="text-xs text-muted-foreground">{method === "credit_card" || method === "debit_card" ? t("sim.cardFixedOnce") : t("sim.fixedEach")}</p> : null}</div> : null}
          <div className="space-y-2"><Label>{t("sim.whoPays")}</Label><div className="flex flex-wrap gap-1.5">{[0, 25, 50, 75, 100].map((v) => <button key={v} type="button" onClick={() => setShare(v)} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${share === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{v === 0 ? t("sim.absorb") : v === 100 ? t("sim.customerPays") : t("sim.customerShare", { v })}</button>)}</div></div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t("sim.youReceive")}</p><p className="numeric-tabular mt-2 text-3xl font-semibold text-primary sm:text-4xl">{formatBRL(result?.netAmount ?? 0)}</p></div><span className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground"><Calculator className="size-5" /></span></div>
          <dl className="mt-8 space-y-4 border-t border-border pt-6">
            <Summary label={t("sim.serviceValue")} value={formatBRL(result?.serviceAmount ?? 0)} />
            {share > 0 ? <Summary label={t("sim.feeByCustomer")} value={formatBRL(result?.customerPaysFee ?? 0)} /> : null}
            <Summary label={t("sim.totalCustomer")} value={formatBRL(result?.grossAmount ?? 0)} />
            {n > 1 ? <Summary label={t("sim.installmentsEst", { n })} value={t("sim.installmentsOf", { n, v: formatBRL((result?.grossAmount ?? 0) / n) })} /> : null}
            <Summary label={t("sim.fee")} value={isFetching ? t("sim.calculating") : formatBRL(result?.totalFee ?? 0)} />
            <Summary label={t("sim.net")} value={formatBRL(result?.netAmount ?? 0)} strong />
          </dl>
          <div className="mt-6 flex gap-2 rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><p>{t("sim.disclaimer")}</p></div>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className={`numeric-tabular text-right ${strong ? "text-xl font-bold text-primary" : "font-semibold"}`}>{value}</dd></div>;
}
