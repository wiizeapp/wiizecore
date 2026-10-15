import { ArrowDown, ArrowRight, Bell, Check, CheckCheck, Download, FileSignature, FileText, LayoutDashboard, Link2, LockKeyhole, MessageCircle, Receipt, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';

const modules = [
  { icon: Users, name: 'Clientes', detail: 'O relacionamento começa aqui.' },
  { icon: FileSignature, name: 'Contratos', detail: 'Cada acordo, no seu lugar.' },
  { icon: Wallet, name: 'Cobranças', detail: 'Do vencimento à confirmação.' },
  { icon: FileText, name: 'Documentos', detail: 'Informação sempre acessível.' },
];

export function OperationDiagram({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('ui');
  return <div className={`institution-operation ${compact ? 'is-compact' : ''}`} role="img" aria-label={t('Clientes, contratos, cobranças e documentos conectados pela Wiize Core')}>
    <div className="institution-operation-label"><span className="institution-status-dot" />{t('Uma operação conectada')}</div>
    <div className="institution-module-grid">{modules.map(({ icon: Icon, name, detail }, i) => <div className="institution-module" key={name}><span className="institution-module-index">0{i + 1}</span><Icon className="size-5 text-primary" /><strong>{t(name)}</strong>{!compact && <p>{t(detail)}</p>}</div>)}</div>
    <div className="institution-connection" aria-hidden="true"><span /><span /><span /><span /><i /></div>
    <div className="institution-hub"><Brand /><span className="institution-hub-caption">{t('Gestão e pagamentos, juntos.')}<CheckCheck className="size-4 text-primary" /></span></div>
  </div>;
}

export function FragmentationDiagram() {
  const { t } = useTranslation('ui');
  return <div className="institution-fragmentation" role="img" aria-label={t('De informações dispersas para uma operação organizada')}>
    <div className="institution-fragments">{[ ['Conversas', MessageCircle], ['Arquivos', FileText], ['Cobranças', Receipt], ['Acordos', FileSignature] ].map(([label, Icon]) => { const Symbol = Icon as LucideIcon; return <span key={String(label)}><Symbol className="size-4" />{t(String(label))}</span>; })}</div>
    <div className="institution-converge" aria-hidden="true"><ArrowDown className="size-5 text-primary" /></div>
    <div className="institution-organized"><Brand size="sm" /><div><Check className="size-4 text-primary" />{t('Informações conectadas ao mesmo cliente')}</div></div>
  </div>;
}

export function OperationDashboard() {
  const { t } = useTranslation('ui');
  return <figure className="institution-dashboard payment-dashboard">
    <div className="institution-dashboard-toolbar"><div className="institution-window-dots" aria-hidden="true"><i /><i /><i /></div><span><LockKeyhole className="size-3" />Wiize Core</span><Bell className="size-3.5 text-muted-foreground" /></div>
    <div className="institution-dashboard-layout"><aside className="institution-dashboard-sidebar"><Brand size="sm" /><div className="institution-dashboard-nav is-active"><LayoutDashboard className="size-4" /><span>{t('Visão geral')}</span></div>{modules.map(({ icon: Icon, name }) => <div className="institution-dashboard-nav" key={name}><Icon className="size-4" /><span>{t(name)}</span></div>)}<div className="institution-dashboard-security"><LockKeyhole className="size-3.5 text-primary" /><span>{t('Acesso seguro')}</span></div></aside>
      <div className="institution-dashboard-content"><header><div><p>{t('Visão geral')}</p><h3>{t('Uma operação conectada')}</h3></div><span className="institution-dashboard-avatar">WP</span></header><div className="institution-dashboard-summary">{modules.slice(0, 3).map(({ icon: Icon, name }, i) => <div key={name}><Icon className="size-4" /><span>{t(name)}</span><div className="institution-mini-trend" aria-hidden="true">{Array.from({ length: 8 }, (_, j) => <i key={j} className={`institution-mini-bar-${(j + i) % 4}`} />)}</div></div>)}</div><OperationDiagram /><p className="institution-dashboard-caption">{t('Representação ilustrativa do produto')}</p></div>
    </div>
  </figure>;
}

export function PortalIllustration() {
  const { t } = useTranslation('ui');
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  return <figure className="institution-portal-preview"><div ref={stageRef} className={`institution-portal-stage feature-visual feature-visual-1 ${visible ? 'is-visible' : ''}`}><div className="feature-visual-grid absolute inset-0" aria-hidden="true" /><div className="feature-visual-glow absolute inset-0" aria-hidden="true" /><div className="institution-portal">
    <div className="institution-window-top"><Brand size="sm" /><span className="institution-portal-secure"><LockKeyhole className="size-3" />{t('Portal do cliente')}</span></div>
    <div className="institution-portal-body">
      <div className="institution-portal-greeting"><div className="institution-dashboard-avatar">CE</div><div><h3>{t('Olá, cliente exemplo.')}</h3><span>{t('Documentos e pagamentos da sua empresa.')}</span></div><LockKeyhole className="ml-auto hidden size-4 text-primary sm:block" /></div>
      <div className="institution-portal-tabs">{[{ icon: Wallet, label: 'Cobranças' }, { icon: Receipt, label: 'Recibos' }, { icon: FileSignature, label: 'Contratos' }, { icon: FileText, label: 'Documentos' }].map(({ icon: Icon, label }, i) => <span className={i === 0 ? 'is-active' : ''} key={label}><Icon className="size-3.5" />{t(label)}</span>)}</div>
      <div className="institution-portal-layout"><div className="institution-portal-payments"><div className="institution-portal-section-title"><Wallet className="size-4 text-primary" /><strong>{t('Suas cobranças')}</strong></div><div className="institution-payment-example"><span>{t('Consultoria estratégica')}</span><strong>R$ 850,00</strong><small><span className="institution-status-dot" />{t('Aguardando pagamento')}</small><span className="institution-payment-action">{t('Pagar cobrança')}<ArrowRight className="size-3.5" /></span></div><div className="institution-receipt-example"><Check className="size-4 text-primary" /><span><strong>{t('Pagamento confirmado')}</strong><small>{t('Recibo disponível em PDF')}</small></span><Download className="ml-auto size-4 text-muted-foreground" /></div></div><div className="institution-portal-files">
        <div className="institution-portal-section-title"><FileSignature className="size-4 text-primary" /><strong>{t('Seus contratos')}</strong></div>
        <div className="institution-document-row"><span><strong>{t('Contrato de consultoria')}</strong><small>{t('Versão assinada disponível')}</small></span><Download className="size-4 text-primary" /></div>
        <div className="institution-portal-section-title"><FileText className="size-4 text-primary" /><strong>{t('Seus documentos')}</strong></div>
        <div className="institution-document-row"><span><strong>{t('Relatório do serviço')}</strong><small>PDF · {t('Disponibilizado pela empresa')}</small></span><Download className="size-4 text-muted-foreground" /></div>
        <div className="institution-document-row"><span><strong>{t('Nota fiscal de serviço')}</strong><small>{t('Quando emitida e autorizada')}</small></span><FileText className="size-4 text-muted-foreground" /></div>
      </div></div>
    </div>
  </div><div className="institution-portal-bottom-fade" aria-hidden="true" /></div><figcaption>{t('Exemplo ilustrativo. Não representa uma conta ou transação real.')}</figcaption></figure>;
}

export function PillarVisual({ kind }: { kind: 'clients' | 'contracts' | 'payments' | 'documents' }) {
  const { t } = useTranslation('ui');
  const content = {
    clients: { title: 'Um cliente. Um histórico.', icon: Users, rows: ['Dados cadastrais', 'Cobranças vinculadas', 'Contratos e documentos'] },
    contracts: { title: 'Do acordo à assinatura.', icon: FileSignature, rows: ['Serviço definido', 'Contrato vinculado', 'Assinatura registrada'] },
    payments: { title: 'Cada etapa, visível.', icon: Wallet, rows: ['Cobrança criada', 'Aguardando pagamento', 'Confirmação pelo provedor'] },
    documents: { title: 'O que importa, acessível.', icon: FileText, rows: ['Contrato assinado', 'Recibo do pagamento', 'Documentos disponibilizados'] },
  }[kind];
  return <div className={`institution-pillar-visual feature-visual feature-visual-1 institution-pillar-${kind}`} role="img" aria-label={t(content.title)}><div className="feature-visual-grid absolute inset-0" aria-hidden="true" /><div className="feature-visual-glow absolute inset-0" aria-hidden="true" /><div className="institution-pillar-card"><div className="institution-window-dots" aria-hidden="true"><i /><i /><i /></div><div className="institution-pillar-caption"><span className="institution-pillar-icon"><content.icon className="size-4" /></span><span>{t(content.title)}</span><span className="institution-pillar-live"><span className="institution-status-dot" />{t('Ativo')}</span></div><div className="institution-pillar-progress" aria-hidden="true"><span /></div><ol>{content.rows.map((row, i) => <li key={row} style={{ animationDelay: `${i * 120}ms` }}><span className="institution-step-symbol">{kind === 'payments' || kind === 'contracts' ? `0${i + 1}` : <Check className="size-3.5" />}</span><span>{t(row)}</span>{i === 2 ? <CheckCheck className="ml-auto size-4 text-primary" /> : <Link2 className="ml-auto size-4 text-muted-foreground" />}</li>)}</ol></div><p>{t('Representação ilustrativa do produto')}</p></div>;
}
