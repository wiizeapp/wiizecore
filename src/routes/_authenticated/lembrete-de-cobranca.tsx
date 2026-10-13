import { PartnerNotice } from "@/components/partner-notice";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Clock3, Info, Lock, Mail, MessageCircle, MessageSquare, Phone, AlertTriangle, Pause, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { PageHeader, StatusBadge, SummaryStrip } from "@/components/ds";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, formatDate } from "@/lib/format";
import { getDunning, listDunningTargets, saveDunning, setDunningOverride } from "@/lib/dunning.functions";
import { BEFORE_OFFSETS, CHANNELS, PLAN_CHANNELS, PLAN_ORDER, minPlanFor, type DunningChannel, type DunningPlanCode, type DunningStepKey, type DunningSteps } from "@/lib/dunning-rules";

export const Route = createFileRoute("/_authenticated/lembrete-de-cobranca")({
  head: () => ({
    meta: [
      { title: "Lembretes de cobrança — WiizePay" },
      { name: "description", content: "Configure avisos automáticos por WhatsApp, SMS, e-mail e ligação para suas cobranças." },
      { property: "og:title", content: "Lembretes de cobrança — WiizePay" },
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

function Regua() {
  const qc = useQueryClient();
  const fetchData = useServerFn(getDunning);
  const save = useServerFn(saveDunning);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dunning"], queryFn: () => fetchData() });
  const [plan, setPlan] = useState<DunningPlanCode>("essential");
  const [steps, setSteps] = useState<DunningSteps | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [financialPassword, setFinancialPassword] = useState("");
  const [pendingState, setPendingState] = useState<{ enabled: boolean; paused: boolean } | null>(null);
  useEffect(() => { if (data) { setPlan(data.config.plan); setSteps(data.config.steps); } }, [data]);

  const mut = useMutation({
    mutationFn: (v: { enabled: boolean; paused: boolean; financialPassword?: string }) => save({ data: { ...v, plan, steps: steps as unknown as Record<string, unknown> } }),
    onSuccess: () => { setPasswordOpen(false); setFinancialPassword(""); setPendingState(null); toast.success("Lembretes salvos."); void qc.invalidateQueries({ queryKey: ["dunning"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data || !steps) return <div className="space-y-6"><PageHeader title="Lembretes de cobrança" /><ListSkeleton rows={4} /></div>;
  const cfg = data.config;
  const price = data.plans.find((p: { code: string; price: number }) => p.code === plan)?.price ?? 0;

  const toggle = (k: DunningStepKey, c: DunningChannel) => setSteps((s) => s && ({ ...s, [k]: s[k].includes(c) ? s[k].filter((x) => x !== c) : [...s[k], c] }));
  const changePlan = (p: DunningPlanCode) => {
    setPlan(p);
    setSteps((s) => {
      if (!s) return s;
      const next = { ...s };
      for (const key of ["created", "before", "due", "overdue", "overdue_repeat", "received"] as DunningStepKey[]) {
        next[key] = s[key].filter((channel) => PLAN_CHANNELS[p].includes(channel));
      }
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
    { key: "before", label: "Antes do vencimento", hint: (<div className="flex flex-wrap gap-2">
      <Select value={String(steps.beforeOffsets[0] ?? steps.beforeOffset)} onValueChange={(v) => setBeforeOffset(0, v)} disabled={!data.canManage}>
        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>{BEFORE_OFFSETS.map((d) => <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "dia antes" : "dias antes"}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={steps.beforeOffsets[1] == null ? "none" : String(steps.beforeOffsets[1])} onValueChange={(v) => setBeforeOffset(1, v)} disabled={!data.canManage}>
        <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Segundo aviso" /></SelectTrigger>
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
        title="Lembretes de cobrança"
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

      <PartnerNotice storageKey="dunning-asaas" title="Como funcionam os lembretes">
        <p>Os avisos de cobrança chegam aos seus clientes em parceria com o <strong className="text-foreground">Asaas</strong>, instituição de pagamento autorizada pelo Banco Central.</p>
        <p>Nessa parceria, o Asaas cuida da entrega das mensagens de lembrete: o e-mail, o SMS e o WhatsApp que avisam antes do vencimento, no dia e depois de atrasado.</p>
        <p>O valor, as parcelas e o andamento de cada cobrança continuam aqui na WiizePay. Em alguns avisos, o Asaas aparece identificado como remetente da mensagem.</p>
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
            <div key={r.key} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3"><p className="min-w-44 font-medium">{r.label}</p>{r.hint}</div>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const allowed = PLAN_CHANNELS[plan].includes(c);
                  const Icon = CH[c].icon;
                  return (
                    <label key={c} title={allowed ? undefined : `Disponível na ${PLAN_NAMES[minPlanFor(c)]}.`}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${allowed ? "" : "opacity-50"}`}>
                      {allowed ? <Icon className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{CH[c].label}
                      <Switch checked={allowed && steps[r.key].includes(c)} disabled={!allowed || !data.canManage} onCheckedChange={() => toggle(r.key, c)} />
                    </label>
                  );
                })}
              </div>
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
