import { useTranslation } from "react-i18next";
import { Brand } from "@/components/brand";
import { getCheckoutAppearance } from "@/lib/checkout-appearance.functions";
import { DEFAULT_APPEARANCE, readableOn } from "@/lib/checkout-appearance";
import { PartnerNotice } from "@/components/partner-notice";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Clock3, Info, Lock, Mail, MessageCircle, MessageSquare, Phone, AlertTriangle, Palette, Pause, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { PageHeader, StatusBadge, SummaryStrip } from "@/components/ds";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, formatDate } from "@/lib/format";
import { getDunning, listDunningTargets, saveDunning, setDunningOverride } from "@/lib/dunning.functions";
import { BEFORE_OFFSETS, CHANNELS, PLAN_CHANNELS, PLAN_ORDER, type DunningChannel, type DunningPlanCode, type DunningStepKey, type DunningSteps } from "@/lib/dunning-rules";

export const Route = createFileRoute("/_authenticated/lembrete-de-cobranca")({
  head: () => ({
    meta: [
      { title: "Lembrete inteligente — WiizePay" },
      { name: "description", content: "Configure avisos automáticos por WhatsApp, SMS, e-mail e ligação para suas cobranças." },
      { property: "og:title", content: "Lembrete inteligente — WiizePay" },
      { property: "og:description", content: "Avisos automáticos das suas cobranças." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Regua,
});

export const PLAN_NAMES: Record<DunningPlanCode, string> = { essential: "Lembrete Essencial", smart: "Lembrete Inteligente", intensive: "Lembrete Intensivo" };
const PLAN_DESCRIPTIONS: Record<DunningPlanCode, string> = {
  essential: "Um lembrete direto por WhatsApp para cobranças mais simples.",
  smart: "WhatsApp, SMS e e-mail trabalhando juntos em cada vencimento.",
  intensive: "Cobertura completa, incluindo ligação automática para reforçar o contato.",
};
const CH: Record<DunningChannel, { label: string; icon: typeof Mail }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  sms: { label: "SMS", icon: MessageSquare },
  email: { label: "E-mail", icon: Mail },
  voice: { label: "Ligação", icon: Phone },
};
const STATUS: Record<string, [string, "success" | "warning" | "danger" | "neutral"]> = {
  active: ["Ativa", "success"], finished: ["Paga", "neutral"], cancelled: ["Encerrada", "neutral"], insufficient_balance: ["Sem saldo", "danger"],
};
const EVENT: Record<string, string> = { activated: "Lembretes ativados", configured: "Avisos configurados", blocked: "Bloqueado por saldo", failed: "Falha ao configurar avisos", paid: "Pagamento confirmado — lembretes encerrados", cancelled: "Cobrança cancelada", refunded: "Estorno — lembretes encerrados", chargeback: "Chargeback — lembretes encerrados" };
const ALERT: Record<string, string> = {
   low: "Seu saldo está baixo. Recomendamos adicionar saldo para manter seus lembretes ativos.",
  critical: "Seu saldo está muito baixo. Algumas comunicações podem ser interrompidas caso não haja saldo suficiente.",
  insufficient: "Não há saldo suficiente para processar novas comunicações.",
};

const STEP_KEYS: DunningStepKey[] = ["created", "before", "due", "overdue", "overdue_repeat", "received"];
/** Tipo de lembrete de um momento: o maior plano cujos canais estão todos ligados. */
function stepType(list: DunningChannel[]): DunningPlanCode | "off" {
  if (!list.length) return "off";
  return [...PLAN_ORDER].reverse().find((p) => PLAN_CHANNELS[p].every((c) => list.includes(c))) ?? "essential";
}

function Regua() {
  const { t: ui } = useTranslation("ui");
  const fetchAppearance = useServerFn(getCheckoutAppearance);
  const qc = useQueryClient();
  const fetchData = useServerFn(getDunning);
  const save = useServerFn(saveDunning);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dunning"], queryFn: () => fetchData() });
  const [plan, setPlan] = useState<DunningPlanCode>("essential");
  const [steps, setSteps] = useState<DunningSteps | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [financialPassword, setFinancialPassword] = useState("");
  const [editStep, setEditStep] = useState<DunningStepKey | null>(null);
  const appearanceQuery = useQuery({ queryKey: ["checkout-appearance"], queryFn: () => fetchAppearance(), enabled: editStep !== null });
  const appearance = appearanceQuery.data?.appearance ?? DEFAULT_APPEARANCE;
  const [pendingState, setPendingState] = useState<{ enabled: boolean; paused: boolean } | null>(null);
  useEffect(() => { if (data) { setPlan(data.config.plan); setSteps(data.config.steps); } }, [data]);

  const mut = useMutation({
    mutationFn: (v: { enabled: boolean; paused: boolean; financialPassword?: string }) => save({ data: { ...v, plan, steps: steps as unknown as Record<string, unknown> } }),
    onSuccess: () => { setPasswordOpen(false); setFinancialPassword(""); setPendingState(null); toast.success("Lembretes salvos."); void qc.invalidateQueries({ queryKey: ["dunning"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data || !steps) return <div className="space-y-6"><PageHeader title="Lembrete inteligente" /><ListSkeleton rows={4} /></div>;
  const cfg = data.config;
  const price = data.plans.find((p: { code: string; price: number }) => p.code === plan)?.price ?? 0;

  const setStepType = (k: DunningStepKey, v: DunningPlanCode | "off") => setSteps((s) => s && ({ ...s, [k]: v === "off" ? [] : [...PLAN_CHANNELS[v]] }));
  const changePlan = (p: DunningPlanCode) => {
    setPlan(p);
    // Ao escolher o lembrete, todos os momentos passam a usar os canais dele (dá para baixar por momento depois).
    setSteps((s) => {
      if (!s) return s;
      const next = { ...s };
      for (const key of STEP_KEYS) next[key] = s[key].length === 0 ? [] : [...PLAN_CHANNELS[p]];
      return next;
    });
  };
  const requestSave = (state: { enabled: boolean; paused: boolean }) => {
    if (plan !== cfg.plan) { setPendingState(state); setPasswordOpen(true); return; }
    mut.mutate(state);
  };
  const setBeforeOffset = (index: number, value: string) => {
    const offsets = [...steps.beforeOffsets];
    if (value === "none") offsets.splice(index, 1); else offsets[index] = Number(value);
    const next = [...new Set(offsets)].slice(0, 2);
    setSteps({ ...steps, beforeOffsets: next, beforeOffset: next[0] ?? 5 });
  };

  const stepRows: { key: DunningStepKey; label: string; hint?: React.ReactNode }[] = [
    { key: "created", label: "Cobrança criada" },
    { key: "before", label: "Antes do vencimento", hint: (<div className="flex gap-1.5">
      <Select value={String(steps.beforeOffsets[0] ?? steps.beforeOffset)} onValueChange={(v) => setBeforeOffset(0, v)} disabled={!data.canManage}>
        <SelectTrigger className="h-8 w-[7.5rem] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{BEFORE_OFFSETS.map((d) => <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "dia antes" : "dias antes"}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={steps.beforeOffsets[1] == null ? "none" : String(steps.beforeOffsets[1])} onValueChange={(v) => setBeforeOffset(1, v)} disabled={!data.canManage}>
        <SelectTrigger className="h-8 w-[7.5rem] text-xs"><SelectValue placeholder="Segundo aviso" /></SelectTrigger>
        <SelectContent><SelectItem value="none">Sem segundo aviso</SelectItem>{BEFORE_OFFSETS.filter((d) => d !== steps.beforeOffsets[0]).map((d) => <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "dia antes" : "dias antes"}</SelectItem>)}</SelectContent>
      </Select></div>) },
    { key: "due", label: "No dia do vencimento" },
    { key: "overdue", label: "1 dia após vencer" },
    { key: "overdue_repeat", label: "A cada 7 dias em atraso" },
    { key: "received", label: "Pagamento confirmado" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lembrete inteligente"
        description="Acompanhe vencimentos automaticamente e reduza atrasos sem gastar seu tempo cobrando cliente por cliente."
        action={data.canManage ? (
          cfg.enabled ? (
            <div className="flex gap-2">
               <Button variant="outline" onClick={() => requestSave({ enabled: true, paused: !cfg.paused })} disabled={mut.isPending}>{cfg.paused ? <><Play className="mr-2 h-4 w-4" />Retomar</> : <><Pause className="mr-2 h-4 w-4" />Pausar</>}</Button>
               <Button variant="ghost" onClick={() => requestSave({ enabled: false, paused: false })} disabled={mut.isPending}>Desativar</Button>
            </div>
          ) : <Button onClick={() => requestSave({ enabled: true, paused: false })} disabled={mut.isPending}><BellRing className="mr-2 h-4 w-4" />Ativar lembretes</Button>
        ) : null}
      />

      <PartnerNotice storageKey="dunning-asaas-v2" title="Como funcionam os lembretes">
        <p>Os avisos de cobrança são enviados aos seus clientes pelo <strong className="text-foreground">Asaas</strong>, instituição de pagamento autorizada pelo Banco Central.</p>
        <p>Você define as regras aqui na WiizePay e nós repassamos ao Asaas, que entrega o e-mail, o SMS e o WhatsApp antes do vencimento, no dia e depois do atraso.</p>
        <p>O valor, as parcelas e o andamento de cada cobrança continuam aqui na WiizePay. Em alguns avisos, o Asaas aparece como remetente da mensagem.</p>
      </PartnerNotice>

      {data.level !== "normal" ? (
        <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${data.level === "low" ? "border-warning/40 bg-warning/10" : "border-destructive/40 bg-destructive/10"}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{ALERT[data.level]}</p>
        </div>
      ) : null}
      {!cfg.enabled ? <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">Para utilizar os Lembretes de cobrança, mantenha saldo disponível para o plano escolhido. Saldo recomendado: {formatBRL(data.thresholds.recommended)}.</p> : null}

      <SummaryStrip items={[
        { label: "Situação", value: !cfg.enabled ? "Desligada" : cfg.paused ? "Pausada" : "Ativa", accent: cfg.enabled && !cfg.paused },
        { label: "Saldo disponível", value: formatBRL(data.balance) },
         { label: "Cobranças acompanhadas (mês)", value: String(data.stats.monthCharges), hint: `${data.stats.active} em andamento` },
        { label: "Gasto no mês", value: formatBRL(data.stats.monthSpent), hint: data.stats.blocked ? `${data.stats.blocked} sem saldo` : undefined },
      ]} />

      <section className="surface-panel overflow-hidden border-primary/15 p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span><div><h2 className="font-display text-xl font-semibold">Escolha como seus clientes serão lembrados</h2><p className="mt-1 text-sm text-muted-foreground">O preço vale para cada aviso ligado (criação, antes do vencimento, no dia, atraso e pagamento recebido).</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PLAN_ORDER.map((p) => {
            const pl = data.plans.find((x: { code: string; price: number }) => x.code === p);
            return (
              <button key={p} type="button" disabled={!data.canManage} onClick={() => changePlan(p)}
                className={`relative rounded-xl border p-5 text-left transition hover:-translate-y-0.5 ${plan === p ? "border-primary bg-primary/5 ring-2 ring-primary/25" : "hover:border-primary/40"}`}>
                {plan === p ? <CheckCircle2 className="absolute right-4 top-4 size-5 text-primary" /> : null}
                <p className="font-semibold">{PLAN_NAMES[p]}</p>
                <p className="mt-1 font-display text-2xl font-bold">{formatBRL(pl?.price ?? 0)}<span className="text-xs font-normal text-muted-foreground"> / aviso</span></p>
                <p className="mt-3 min-h-10 text-sm leading-5 text-muted-foreground">{PLAN_DESCRIPTIONS[p]}</p>
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-2.5">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que seu cliente recebe</p>
                  <div className="flex flex-wrap items-center gap-1">{PLAN_CHANNELS[p].map((c, i) => { const Icon = CH[c].icon; return <span key={c} className="inline-flex items-center gap-1">{i > 0 ? <span className="text-sm font-bold text-primary">+</span> : null}<span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"><Icon className="h-3.5 w-3.5" />{CH[c].label}</span></span>; })}</div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{p === "essential" ? "1 canal" : p === "smart" ? "Tudo do Essencial + SMS e E-mail" : "Tudo do Inteligente + Ligação automática"}</p>
                </div>
              </button>
            );
          })}
        </div>
        {data.canManage ? <div className="mt-4 flex justify-end"><Button onClick={() => requestSave({ enabled: cfg.enabled, paused: cfg.paused })} disabled={mut.isPending || plan === cfg.plan}>Confirmar novo plano</Button></div> : null}
      </section>

      <section className="surface-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Quando e por onde avisar</h2>
          {data.canManage ? <Button size="sm" onClick={() => requestSave({ enabled: cfg.enabled, paused: cfg.paused })} disabled={mut.isPending}>Salvar lembretes</Button> : null}
        </div>
        <div className="mt-4 divide-y">
          {stepRows.map((r) => (
            <div key={r.key} className="grid grid-cols-1 items-center gap-2 py-2.5 lg:grid-cols-[10rem_15.5rem_10.5rem_minmax(0,1fr)_auto] lg:gap-3">
              <p className="text-sm font-medium">{r.label}</p>
              <div className="min-w-0">{r.hint ?? <span className="hidden text-xs text-muted-foreground lg:inline">—</span>}</div>
              <Select value={stepType(steps[r.key])} onValueChange={(v) => setStepType(r.key, v as DunningPlanCode | "off")} disabled={!data.canManage}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Sem aviso</SelectItem>
                  {PLAN_ORDER.filter((p) => PLAN_ORDER.indexOf(p) <= PLAN_ORDER.indexOf(plan)).map((p) => <SelectItem key={p} value={p}>{PLAN_NAMES[p]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex min-w-0 flex-wrap gap-1" aria-label="Canais definidos pelo tipo de lembrete">
                {CHANNELS.map((c) => {
                  const on = steps[r.key].includes(c);
                  const Icon = on ? CH[c].icon : Lock;
                  return (
                    <span key={c} title={on ? `${CH[c].label} ligado` : `${CH[c].label} desligado`} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${on ? "border-primary/40 bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground opacity-50"}`}>
                      <Icon className="h-3 w-3 shrink-0" />{CH[c].label}
                    </span>
                  );
                })}
              </div>
              <Button size="icon" variant="ghost" className="size-8 justify-self-start lg:justify-self-end" title="Editar aparência" aria-label="Editar aparência" onClick={() => setEditStep(r.key)}><Palette className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 rounded-xl border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground sm:grid-cols-2"><p className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{formatBRL(price)} por aviso ligado, descontado do saldo quando a cobrança é criada. Cada parcela e cada novo ciclo recorrente são cobrados separadamente.</p><p className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />Você pode usar até dois avisos antes do vencimento quando essas posições estiverem disponíveis nas notificações da conta conectada.</p></div>
      </section>

      <Overrides overrides={data.overrides} canManage={data.canManage} />

      <section className="surface-panel p-5">
        <h2 className="font-display text-lg font-semibold">Cobranças acompanhadas</h2>
        {data.charges.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma cobrança entrou nos lembretes ainda. Ative o recurso e crie uma cobrança.</p> : (
          <div className="mt-3 divide-y">
            {data.charges.map((c) => {
              const [label, tone] = STATUS[c.status] ?? [c.status, "neutral" as const];
              const evs = data.events.filter((e) => e.payment_id === c.paymentId);
              return (
                <details key={c.id} className="py-3">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                     <span className="min-w-0"><span className="font-medium">{c.customer}</span> <span className="text-sm text-muted-foreground">· {c.contract || c.description || "Cobrança"}{c.installmentCount > 1 ? ` · parcela ${c.installmentNumber}/${c.installmentCount}` : c.recurring ? " · ciclo recorrente" : ""} · {formatBRL(c.amount)}{c.dueOn ? ` · vence ${formatDate(c.dueOn)}` : ""}</span></span>
                    <span className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{PLAN_NAMES[c.plan as DunningPlanCode]} · {formatBRL(c.price)}</span><StatusBadge tone={tone}>{label}</StatusBadge></span>
                  </summary>
                  <ol className="mt-3 space-y-1.5 border-l pl-4 text-sm">
                    {evs.slice().reverse().map((e) => <li key={e.id}><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span> — {EVENT[e.event] ?? e.event}{e.detail && e.event === "failed" ? `: ${e.detail}` : ""}</li>)}
                  </ol>
                </details>
              );
            })}
          </div>
        )}
      </section>
      <Dialog open={editStep !== null} onOpenChange={(v) => !v && setEditStep(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Aparência do aviso</DialogTitle><DialogDescription>{stepRows.find((r) => r.key === editStep)?.label}</DialogDescription></DialogHeader>
          {appearanceQuery.isPending ? <ListSkeleton rows={2} /> : appearanceQuery.isError ? <ErrorState onRetry={() => void appearanceQuery.refetch()} /> : <div className="overflow-hidden rounded-lg border" data-testid="reminder-brand-preview">
            <div className="flex min-h-16 items-center gap-3 px-4 py-3" style={{ background: appearance.brandColor, color: readableOn(appearance.brandColor) }}>
              {appearance.logoUrl ? <img src={appearance.logoUrl} alt={ui("Logo da empresa")} className="h-10 max-w-32 object-contain" /> : <Brand size="sm" color={readableOn(appearance.brandColor)} accentColor={readableOn(appearance.brandColor)} />}
              {appearance.logoUrl ? <span className="text-sm font-semibold">{appearanceQuery.data?.companyName}</span> : null}
            </div>
            <div className="space-y-2 p-4 text-sm text-muted-foreground"><p>Olá, cliente. Este é um lembrete da sua cobrança.</p><div className="h-2 w-3/4 rounded bg-muted" /><div className="h-2 w-1/2 rounded bg-muted" /><span className="mt-2 inline-block rounded-md px-3 py-1.5 text-xs font-medium" style={{ background: appearance.brandColor, color: readableOn(appearance.brandColor) }}>Pagar agora</span></div>
          </div>}
          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" /><p>{ui("Esta prévia usa sua marca salva na WiizePay. Os avisos enviados pelo Asaas mantêm a aparência e os textos do provedor.")}</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setEditStep(null)}>Fechar</Button><Button asChild><Link to="/checkout-personalizado" hash="marca"><Palette className="h-4 w-4" />{ui("Editar marca")}</Link></Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirmar mudança de plano</DialogTitle><DialogDescription>Essa alteração muda o valor descontado em cada nova parcela ou ciclo. Informe sua senha financeira para continuar.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="dunning-password">Senha financeira</Label><Input id="dunning-password" type="password" autoComplete="off" value={financialPassword} onChange={(e) => setFinancialPassword(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancelar</Button><Button disabled={!financialPassword || mut.isPending} onClick={() => pendingState && mut.mutate({ ...pendingState, financialPassword })}>Confirmar alteração</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Overrides({ overrides, canManage }: { overrides: { id: string; customerId: string | null; contractId: string | null; label: string; kind: string }[]; canManage: boolean }) {
  const qc = useQueryClient();
  const fetchTargets = useServerFn(listDunningTargets);
  const setOv = useServerFn(setDunningOverride);
  const { data } = useQuery({ queryKey: ["dunning-targets"], queryFn: () => fetchTargets(), enabled: canManage });
  const [sel, setSel] = useState("");
  const mut = useMutation({
    mutationFn: (v: { customerId?: string; contractId?: string; excluded: boolean }) => setOv({ data: v }),
    onSuccess: () => { setSel(""); void qc.invalidateQueries({ queryKey: ["dunning"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro."),
  });
  const add = () => { const [k, id] = sel.split(":"); if (id) mut.mutate(k === "c" ? { customerId: id, excluded: true } : { contractId: id, excluded: true }); };
  return (
    <section className="surface-panel p-5">
      <h2 className="font-display text-lg font-semibold">Clientes e contratos sem lembretes</h2>
      <p className="mt-1 text-sm text-muted-foreground">Cobranças destes clientes ou contratos não recebem avisos e não são cobradas.</p>
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Escolha um cliente ou contrato" /></SelectTrigger>
            <SelectContent>
              {(data?.customers ?? []).map((c: { id: string; name: string }) => <SelectItem key={c.id} value={`c:${c.id}`}>Cliente: {c.name}</SelectItem>)}
              {(data?.contracts ?? []).map((c: { id: string; title: string }) => <SelectItem key={c.id} value={`k:${c.id}`}>Contrato: {c.title}</SelectItem>)}
            </SelectContent>
          </Select>
           <Button variant="outline" onClick={add} disabled={!sel || mut.isPending}>Desativar lembretes</Button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {overrides.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma exceção.</p> : overrides.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
            {o.kind === "customer" ? "Cliente" : "Contrato"}: {o.label}
            {canManage ? <button type="button" aria-label="Remover" onClick={() => mut.mutate(o.customerId ? { customerId: o.customerId, excluded: false } : { contractId: o.contractId!, excluded: false })}><X className="h-3.5 w-3.5" /></button> : null}
          </span>
        ))}
      </div>
    </section>
  );
}
