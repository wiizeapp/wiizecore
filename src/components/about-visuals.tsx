import { useEffect, useRef, useState } from "react";
import { BarChart3, Check, CreditCard, FileSignature, Handshake, Landmark, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

const steps = [
  { label: "Venda", icon: Handshake, kind: "sale" },
  { label: "Contrato", icon: FileSignature, kind: "contract" },
  { label: "Cobrança", icon: Receipt, kind: "charge" },
  { label: "Pagamento", icon: CreditCard, kind: "payment" },
  { label: "Acompanhamento financeiro", icon: BarChart3, kind: "finance" },
] as const;

export function AboutJourney() {
  const { t: ui } = useTranslation("ui");
  return (
    <ol className="about-journey mt-12">
      <li className="about-journey-track" aria-hidden="true"><span /></li>
      {steps.map(({ label, icon: Icon, kind }, index) => (
        <li className="about-journey-step" key={label}>
          <span className="about-step-number">{String(index + 1).padStart(2, "0")}</span>
          <article className="about-journey-card">
            <div className={`about-stage about-stage-${kind}`} aria-hidden="true">
              <div className="about-mini-window">
                <div className="about-mini-header"><span /><span /><span /></div>
                <Icon className="about-stage-icon" strokeWidth={1.5} />
                {kind === "finance" ? <div className="about-mini-bars"><i /><i /><i /><i /><i /></div> : <div className="about-mini-lines"><i /><i /><i /></div>}
              </div>
              <span className="about-stage-check"><Check size={14} strokeWidth={3} /></span>
            </div>
            <h3 className="text-base font-semibold leading-6">{ui(label)}</h3>
          </article>
        </li>
      ))}
    </ol>
  );
}

const metrics = [
  { value: 171.3, prefix: "R$ ", suffix: " bi", digits: 1, label: "movimentados", icon: TrendingUp },
  { value: 3.8, prefix: "+", suffix: " mi", digits: 1, label: "contas criadas", icon: Users },
  { value: 549.3, prefix: "+", suffix: " mi", digits: 1, label: "cobranças pagas", icon: Wallet },
  { value: 2021, prefix: "", suffix: "", digits: 0, label: "autorizada como instituição de pagamento pelo Banco Central", icon: Landmark },
] as const;

export function AboutMetrics() {
  const { t: ui, i18n } = useTranslation("ui");
  const ref = useRef<HTMLDListElement>(null);
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = Math.min((now - start) / 1600, 1);
        setProgress(1 - Math.pow(1 - elapsed, 3));
        if (elapsed < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  const locale = i18n.language.startsWith("en") ? "en-US" : i18n.language.startsWith("es") ? "es-ES" : "pt-BR";
  return (
    <dl ref={ref} className="about-metrics mt-12 grid gap-8 border-y border-border py-10 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(({ value, prefix, suffix, digits, label, icon: Icon }) => {
        const format = (number: number) => prefix + number.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: digits > 0 }) + suffix;
        return (
          <div key={label} className="about-metric min-w-0">
            <Icon className="mb-5 size-6 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <dt className="sr-only">{ui(label)}</dt>
            <dd className="about-metric-value font-display font-semibold numeric-tabular" aria-label={format(value)}>
              <span aria-hidden="true">{format(digits === 0 ? value : value * progress)}</span>
            </dd>
            <div className="mt-3 max-w-56 text-sm leading-6 text-muted-foreground" aria-hidden="true">{ui(label)}</div>
          </div>
        );
      })}
    </dl>
  );
}