import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { infrastructureData } from './infrastructure-data';
import { OperationDiagram } from './visuals';
import './institutional.css';

function HistoricalNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.IntersectionObserver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / 1800, 1);
        setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      setDisplay(0);
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return <span ref={ref}><span aria-hidden="true">{display}</span><span className="sr-only">{value}</span></span>;
}

export function InfrastructureSection() {
  const { t } = useTranslation('ui');
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [volume, revenue, profit] = infrastructureData.metrics;
  return <section ref={sectionRef} className={`institution-infrastructure border-y border-border ${visible ? 'is-in-view' : ''}`} aria-labelledby="infrastructure-heading">
    <div className="section-shell institution-section">
      <div className="institution-section-heading"><div><p className="section-kicker">{t('Infraestrutura de pagamentos')}</p><h2 id="infrastructure-heading">{t('Uma experiência integrada.')}<br /><span className="text-muted-foreground">{t('Uma infraestrutura preparada.')}</span></h2></div><p>{t('A Wiize Core combina sua camada de gestão com uma infraestrutura de pagamentos com histórico de operação em escala.')}</p></div>
      <div className="institution-infra-period"><span className="institution-status-dot" />{t('Resultados anuais · 2025')}<span>{t('Da infraestrutura utilizada, não da Wiize Core')}</span></div>
      <div className="institution-infra-grid"><div className="institution-infra-main"><p>{t(volume.description)}</p><div className="institution-big-number hero-shine"><span>R$</span><HistoricalNumber value={volume.value} /><span className="institution-big-unit">{t(volume.unit)}</span></div><div className="institution-big-number-bottom"><span><ArrowUpRight className="size-4" />+{volume.growth}% {t('sobre 2024')}</span></div></div>
      <div className="institution-growth" role="img" aria-label={t('Volume de pagamentos: R$ 43,5 bilhões em 2024 e R$ 67 bilhões em 2025, crescimento de 54%.')}><p>{t('Evolução do volume de pagamentos')}</p><div className="institution-growth-bars"><div><span className="institution-bar-2024"><b>R$ 43,5 bi</b></span><small>2024</small></div><div><span className="institution-bar-2025"><b>R$ 67 bi</b></span><small>2025</small></div></div><small>{t('Volume total de pagamentos (TPV) · +54% de 2024 para 2025')}</small></div>
      <div className="institution-infra-secondary">{[revenue, profit].map(metric => <div key={metric.id}><strong className="hero-shine"><span className="institution-inline-prefix">{t(metric.prefix)}</span> <HistoricalNumber value={metric.value} /> <span>{t(metric.unit)}</span></strong><p>{t(metric.description)}</p>{'growth' in metric ? <small className="text-primary">+{metric.growth}% {t('sobre 2024')}</small> : <small className="text-primary">{t('Em 2024: R$ 11,5 milhões')}</small>}</div>)}</div></div>
      <div className="institution-source"><p>{t(infrastructureData.disclaimer)}</p></div>
    </div>
  </section>;
}

export function AuthoritySection() {
  const { t } = useTranslation('ui');
  const [volume, revenue] = infrastructureData.metrics;
  return <section className="institution-authority border-y border-border" aria-labelledby="authority-heading"><div className="section-shell institution-section"><div className="institution-authority-grid"><div><h2 id="authority-heading">{t('Mais do que pagamentos.')}<br /><span className="text-primary">{t('Uma gestão conectada.')}</span></h2><p className="institution-body-copy">{t('Unifique cobranças, clientes, contratos e documentos em uma experiência pensada para simplificar a rotina financeira da sua empresa.')}</p><p className="institution-body-copy">{t('Conheça nossa visão, nossos diferenciais e a infraestrutura que sustenta a experiência de pagamentos.')}</p><Button asChild variant="outline" size="lg" className="mt-7"><Link to="/sobre">{t('Conheça nossa história')}<ArrowRight /></Link></Button></div><OperationDiagram compact /></div><div className="institution-authority-metrics"><p>{t('Infraestrutura de pagamentos utilizada')}<span>{t('Resultados anuais · 2025')}</span></p><div><strong className="hero-shine">R$ <HistoricalNumber value={volume.value} /> {t(volume.unit)}</strong><span>{t(volume.description)}</span></div><div><strong className="hero-shine">R$ <HistoricalNumber value={revenue.value} /> {t(revenue.unit)}</strong><span>{t(revenue.description)}</span></div></div><p className="institution-authority-note">{t('Indicadores da infraestrutura parceira. Não representam resultados próprios da Wiize Core.')}</p></div></section>;
}
