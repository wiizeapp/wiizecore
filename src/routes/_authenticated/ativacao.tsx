import { ActivationFeeCheckout } from "@/components/activation-fee-checkout";
import { getActivationFee } from "@/lib/activation-fee.functions";
import { PartnerNotice } from "@/components/partner-notice";
import { createFileRoute } from "@tanstack/react-router";
import { TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Building2, Clock, ShieldCheck, User, AlertTriangle, XCircle, ExternalLink, Loader2, RefreshCw, Smartphone, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { getActivation, refreshActivationStatus, saveActivationDraft, submitActivation, uploadActivationDocument } from "@/lib/activation.functions";
import { ActivationBadge, DOC_LABEL } from "@/components/activation-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createActivationHandoff, getActivationHandoffStatus } from "@/lib/activation-handoff.functions";
import { getSecurityStatus } from "@/lib/security.functions";
import { Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { activationFormSchema, BRAZIL_STATES, formatBRLInput, REQUIRED_DOCS, validateActivationStep } from "@/lib/activation-validation";
import { compressActivationFile } from "@/lib/image-compression";
import { ActivationDocumentUpload } from "@/components/activation-document-upload";

export const Route = createFileRoute("/_authenticated/ativacao")({
  head: () => ({
    meta: [
      { title: "Ativar pagamentos — Wiize Core" },
      { name: "description", content: "Envie seus dados e documentos para ativar o recebimento de pagamentos no Wiize Core." },
      { property: "og:title", content: "Ativar pagamentos — Wiize Core" },
      { property: "og:description", content: "Envie seus dados e documentos para ativar o recebimento de pagamentos no Wiize Core." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AtivacaoPage,
});

type Form = Record<string, string>;
const EDITABLE = ["not_started", "draft", "in_progress", "action_required"];

function AtivacaoPage() {
  const feeFn = useServerFn(getActivationFee);
  const fee = useQuery({queryKey:["activation-fee"],queryFn:()=>feeFn(),staleTime:0});
  const fetchA = useServerFn(getActivation);
  const { data, isError, refetch, isFetchedAfterMount } = useQuery({ queryKey: ["activation"], enabled: fee.data?.status === "confirmed", queryFn: () => fetchA(), refetchOnMount: "always", staleTime: 0, gcTime: 0 });
  if(fee.isError) return <ErrorState onRetry={()=>fee.refetch()}/>;
  if(!fee.data) return <ListSkeleton rows={3}/>;
  if(fee.data.status!=="confirmed" && !fee.data.enabled) return <BetaNotice/>;
  if(fee.data.status!=="confirmed") return <ActivationFeeCheckout/>;
  return (
    <div>
      <PartnerNotice storageKey="activation-asaas-v2" title="Como funciona a análise da sua conta">
        <p>A abertura da sua conta de pagamentos é feita pelo <strong className="text-foreground">Asaas</strong>, instituição de pagamento autorizada pelo Banco Central.</p>
        <p>Você envia seus dados e documentos aqui na Wiize Core. Nós organizamos e encaminhamos tudo ao Asaas, que faz a análise e a aprovação da conta e nos devolve o resultado.</p>
        <p>Você acompanha cada etapa nesta tela e avisaremos assim que houver uma resposta.</p>
      </PartnerNotice>
      <PageHeader title="Ative seus pagamentos" description="Para receber pelo Wiize Core, precisamos confirmar a sua identidade e a da sua empresa. Seus dados ficam protegidos. Avisaremos tudo por aqui e no seu e-mail de acesso." />
      {isError ? <ErrorState onRetry={() => refetch()} /> : !isFetchedAfterMount || !data ? <ListSkeleton rows={4} /> : <Content data={data} />}
    </div>
  );
}

function Content({ data }: { data: Awaited<ReturnType<typeof getActivation>> }) {
  const editable = EDITABLE.includes(data.status);
  return (
    <div className="space-y-6">
      <StatusCard data={data} />
      {data.submittedAt || data.status !== "not_started" && data.events.length ? <ProcessSteps data={data} /> : null}
      {["submitted", "under_review", "approved"].includes(data.status) ? <NextSteps status={data.status} /> : null}
      {data.provider?.items?.length ? <ProviderPanel data={data} /> : null}
      {editable && (data.role === "owner" || data.role === "admin") && <Wizard data={data} />}
      {editable && !(data.role === "owner" || data.role === "admin") && (
        <p className="text-muted-foreground">Peça ao proprietário da empresa para concluir a ativação.</p>
      )}
    </div>
  );
}

function ProcessSteps({ data }: { data: Awaited<ReturnType<typeof getActivation>> }) {
  const qc = useQueryClient();
  const submit = useServerFn(submitActivation);
  const resend = useMutation({
    mutationFn: () => submit(),
    onSuccess: () => { toast.success("Cadastro reenviado para análise."); qc.invalidateQueries({ queryKey: ["activation"] }); },
    onError: (e: Error) => { toast.error(e.message, { duration: 10000 }); qc.invalidateQueries({ queryKey: ["activation"] }); },
  });
  const failed = data.status === "action_required" && !!data.provider?.lastError;
  const sent = !!data.submittedAt;
  const items = data.provider?.items ?? [];
  const hasAccount = items.length > 0;
  const docsSent = hasAccount && items.filter((i) => i.kind === "document").every((i) => i.status !== "NOT_SENT");
  const done = data.status === "approved";
  const steps = [
    { label: "Termos aceitos e dados conferidos", ok: sent },
    { label: "Conta criada na instituição de pagamento", ok: hasAccount, fail: failed && !hasAccount },
    { label: "Documentos enviados", ok: docsSent, fail: failed && hasAccount && !docsSent },
    { label: "Análise do Asaas", ok: done, fail: data.status === "rejected" },
  ];
  return (
    <section className="surface-panel space-y-4 p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold">Etapas do envio</h2>
      <ol className="space-y-2">
        {steps.map((st) => (
          <li key={st.label} className="flex items-center gap-2 text-sm">
            {st.ok ? <BadgeCheck className="size-4 text-primary" /> : st.fail ? <XCircle className="size-4 text-destructive" /> : <Clock className="size-4 text-muted-foreground" />}
            <span className={st.fail ? "text-destructive" : st.ok ? "" : "text-muted-foreground"}>{st.label}</span>
          </li>
        ))}
      </ol>
      {failed ? (
        <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p><strong>O que deu errado:</strong> {data.provider?.lastError}</p>
          <p className="text-muted-foreground">Seus dados e documentos continuam salvos. Corrija o que foi indicado, se precisar, e reenvie.</p>
          <Button size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>{resend.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Reenviar para análise</Button>
        </div>
      ) : null}
    </section>
  );
}

function StatusCard({ data }: { data: Awaited<ReturnType<typeof getActivation>> }) {
  const map: Record<string, { icon: typeof Clock; title: string; text: string }> = {
    not_started: { icon: ShieldCheck, title: "Wiize Core ainda não ativado", text: "Preencha as etapas abaixo e envie para análise. Você pode salvar e continuar depois." },
    draft: { icon: ShieldCheck, title: "Cadastro em rascunho", text: "Continue de onde parou." },
    in_progress: { icon: ShieldCheck, title: "Cadastro em preenchimento", text: "Continue de onde parou. Seu progresso fica salvo." },
    submitted: { icon: Clock, title: "Cadastro enviado", text: "Recebemos seus dados e enviamos para a análise da instituição de pagamento. Você será avisado aqui no sistema." },
    under_review: { icon: Clock, title: "Cadastro em análise", text: "Seus dados e documentos estão em análise. Você recebe um aviso assim que houver resposta." },
    action_required: { icon: AlertTriangle, title: "Precisamos de mais informações", text: "Corrija os pontos indicados e envie novamente." },
    approved: { icon: BadgeCheck, title: "Wiize Core ativado", text: "Sua conta foi aprovada. Você já pode criar cobranças e receber pagamentos." },
    rejected: { icon: XCircle, title: "Cadastro não aprovado", text: "Não foi possível aprovar a ativação. Em caso de dúvida, fale com o suporte: wiizepay@gmail.com." },
    suspended: { icon: XCircle, title: "Recebimentos suspensos", text: "Os recebimentos desta conta estão suspensos. Fale com o suporte: wiizepay@gmail.com." },
  };
  const s = (map[data.status] ?? map["not_started"])!;
  const Icon = s.icon;
  return (
    <section className="surface-panel flex items-start gap-4 p-5 sm:p-6">
      <div className="rounded-lg bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" /></div>
      <div className="space-y-1 flex-1">
        <div className="flex items-center gap-2 flex-wrap"><h2 className="font-display text-base font-semibold tracking-tight">{s.title}</h2><ActivationBadge status={data.status} /></div>
        <p className="text-sm text-muted-foreground">{s.text}</p>
        {data.reviewMessage && ["action_required", "rejected", "suspended"].includes(data.status) && (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><strong>Mensagem da análise:</strong> {data.reviewMessage}</p>
        )}
      </div>
    </section>
  );
}

function NextSteps({ status }: { status: string }) {
  const fetchS = useServerFn(getSecurityStatus);
  const { data: sec } = useQuery({ queryKey: ["security-status"], queryFn: () => fetchS() });
  return (
    <section className="surface-panel space-y-4 p-5 sm:p-6">
      {status !== "approved" ? (
        <div className="space-y-2">
          <h2 className="font-display text-base font-semibold">O que acontece agora</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>O Asaas analisa seus dados e documentos. Costuma levar até 3 dias úteis.</li>
            <li>Se faltar algo, avisamos aqui, no sininho e por e-mail, com o que corrigir.</li>
            <li>Quando aprovado, você já pode criar cobranças e receber pagamentos.</li>
          </ol>
        </div>
      ) : null}
      {sec && !sec.hasFinancialPassword ? (
        <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><KeyRound className="mt-0.5 size-5 shrink-0 text-foreground" /><div><p className="text-sm font-semibold">Crie sua senha financeira</p><p className="text-sm text-muted-foreground">Ela protege saques e outras operações com dinheiro. Sem ela, você não conseguirá sacar.</p></div></div>
          <Button asChild><Link to="/seguranca">Criar senha financeira</Link></Button>
        </div>
      ) : null}
    </section>
  );
}

const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Aprovado", cls: "bg-primary/10 text-primary" },
  AWAITING_APPROVAL: { label: "Em análise", cls: "bg-warning/15 text-foreground" },
  PENDING: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  NOT_SENT: { label: "Não enviado", cls: "bg-muted text-muted-foreground" },
  REJECTED: { label: "Recusado", cls: "bg-destructive/10 text-destructive" },
};

function ProviderPanel({ data }: { data: Awaited<ReturnType<typeof getActivation>> }) {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshActivationStatus);
  const m = useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => { toast.success("Situação atualizada."); qc.invalidateQueries({ queryKey: ["activation"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const items = data.provider?.items ?? [];
  const parts = items.filter((i) => i.kind === "part");
  const docs = items.filter((i) => i.kind === "document");
  return (
    <section className="surface-panel space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-base font-semibold">Andamento da análise</h2><p className="text-sm text-muted-foreground">Situação informada pela instituição de pagamento{data.providerSyncedAt ? ` · atualizado em ${new Date(data.providerSyncedAt).toLocaleString("pt-BR")}` : ""}.</p></div>
        <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Atualizar situação</Button>
      </div>
      {Object.keys(data.provider?.failed ?? {}).length ? (
        <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">Alguns documentos precisam ser reenviados</p>
          <p className="text-sm text-muted-foreground">A instituição de pagamento não aceitou estes arquivos. Envie um novo para continuar a análise.</p>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div><p className="mb-1 font-medium">Dicas</p><ul className="space-y-0.5 text-muted-foreground"><li>• Documento original, inteiro e dentro da foto</li><li>• Lugar bem iluminado, sem reflexo ou sombra</li><li>• Todos os dados e a foto legíveis</li><li>• Na selfie: rosto à mostra e documento ao lado</li></ul></div>
            <div><p className="mb-1 font-medium">Não é permitido</p><ul className="space-y-0.5 text-muted-foreground"><li>• Foto de tela, cópia ou documento de outra pessoa</li><li>• Imagem cortada, borrada ou editada</li><li>• Documento vencido ou rasurado</li><li>• Boné, óculos escuros ou filtros na selfie</li></ul></div>
          </div>
          <Documents company={data.personType === "company"} docs={[]} errors={data.provider?.failed ?? {}} only={Object.keys(data.provider?.failed ?? {})} />
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {parts.map((p) => { const st = ITEM_STATUS[p.status] ?? ITEM_STATUS["PENDING"]!; return (
          <div key={p.key} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{p.label}</p><span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></div>
        ); })}
      </div>
      {docs.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Documentos pedidos</h3>
          {docs.map((d) => { const st = ITEM_STATUS[d.status] ?? ITEM_STATUS["PENDING"]!; return (
            <div key={d.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div className="min-w-0"><p className="font-medium">{d.label}</p>{d.reason ? <p className="mt-0.5 text-xs text-destructive">O que corrigir: {d.reason}</p> : null}</div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                {d.onboardingUrl ? <Button size="sm" asChild><a href={d.onboardingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Concluir etapa segura</a></Button> : null}
              </div>
            </div>
          ); })}
          {docs.some((d) => d.onboardingUrl) ? <p className="text-xs text-muted-foreground">Algumas etapas, como selfie e prova de vida, são feitas no ambiente seguro da instituição de pagamento. Depois de concluir, volte aqui e clique em Atualizar situação.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

const REVIEW_FLAG = "wiizepay-activation-review";
const STEPS = ["Tipo", "Dados pessoais", "Endereço", "Negócio", "Documentos", "Envio"];

function Wizard({ data }: { data: Awaited<ReturnType<typeof getActivation>> }) {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const save = useServerFn(saveActivationDraft);
  const submit = useServerFn(submitActivation);
  const [step, setStep] = useState(0);
  const [personType, setPersonType] = useState<"individual" | "company" | null>(data.personType);
  const [form, setForm] = useState<Form>(data.form ?? {});
  const [consents, setConsents] = useState<Record<string, boolean>>(data.consents ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [handoffOpen, setHandoffOpen] = useState(false);
  const createHandoff = useServerFn(createActivationHandoff);
  const [handoff, setHandoff] = useState<{ url: string; token: string; expiresAt: string; qr: string } | null>(null);
  const handoffStatusFn = useServerFn(getActivationHandoffStatus);
  const handoffStatus = useQuery({
    queryKey: ["handoff-status", handoff?.token],
    queryFn: () => handoffStatusFn({ data: { token: handoff!.token } }),
    enabled: handoffOpen && !!handoff,
    refetchInterval: (q) => (q.state.data?.state === "done" || q.state.data?.state === "expired" ? false : 4000),
  });
  useEffect(() => {
    if (handoffStatus.data?.state === "done") {
      toast.success("Dados recebidos do celular.");
      setHandoffOpen(false);
      sessionStorage.setItem(REVIEW_FLAG, "1");
      void qc.invalidateQueries({ queryKey: ["activation"] }).then(() => window.location.reload());
    }
  }, [handoffStatus.data?.state, qc]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!handoffOpen) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [handoffOpen]);
  const handoffM = useMutation({
    mutationFn: async () => {
      await save({ data: { personType, form: form as never, consents } });
      const result = await createHandoff();
      const tema = document.documentElement.classList.contains("dark") ? "dark" : "light";
      const url = `${window.location.origin}/ativacao-celular/${result.token}?tema=${tema}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 260 });
      return { ...result, url, qr };
    },
    onSuccess: (result) => { setHandoff(result); setHandoffOpen(true); },
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => { if (data.personType) setStep((s) => s || 1); }, [data.personType]);
  // Ao voltar do celular, abre direto a etapa final com as declarações e o botão de envio.
  useEffect(() => { if (sessionStorage.getItem(REVIEW_FLAG)) { sessionStorage.removeItem(REVIEW_FLAG); setStep(STEPS.length - 1); } }, []);

  const saveM = useMutation({
    mutationFn: () => save({ data: { personType, form: form as never, consents } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activation"] }); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submitM = useMutation({
    mutationFn: async () => { await save({ data: { personType, form: form as never, consents } }); await submit(); },
    onSuccess: () => { toast.success("Cadastro enviado para análise."); },
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ["activation"] }); },
  });
  const go = async (n: number) => {
    if (n > step) {
      const nextErrors = validateActivationStep(personType, activationFormSchema.parse(form), step);
      if (step === 4) {
        const have = new Set(data.documents.map((document) => document.kind));
        for (const kind of REQUIRED_DOCS[company ? "company" : "individual"]) if (!have.has(kind)) nextErrors[kind] = "Envie este documento obrigatório.";
      }
      if (Object.keys(nextErrors).length) { setErrors(nextErrors); toast.error("Confira os campos obrigatórios antes de continuar."); return; }
    }
    setErrors({}); await saveM.mutateAsync(); setStep(n); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((current) => ({ ...current, [k]: "" })); };
  const F = ({ k, label, ...p }: { k: string; label: string } & React.ComponentProps<typeof Input>) => (
    <div className="space-y-1.5"><Label htmlFor={k}>{label}</Label><Input id={k} value={form[k] ?? ""} onChange={set(k)} aria-invalid={!!errors[k]} {...p} />{errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null}</div>
  );
  const company = personType === "company";

  return (
    <section className="surface-panel p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm"><span className="font-medium">Etapa {step + 1} de {STEPS.length}: {ui(STEPS[step] ?? "")}</span><span className="text-muted-foreground">{Math.round(((step + 1) / STEPS.length) * 100)}%</span></div>
        <Progress value={((step + 1) / STEPS.length) * 100} />
      </div>

      {step === 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {([["individual", "Pessoa Física", "Autônomo ou profissional liberal com CPF.", User], ["company", "Pessoa Jurídica", "Empresa com CNPJ (MEI, ME, LTDA etc.).", Building2]] as const).map(([v, t, d, I]) => (
            <Button key={v} type="button" variant="outline" onClick={() => { setPersonType(v); setErrors((current) => ({ ...current, personType: "" })); }} className={`h-auto min-h-28 justify-start whitespace-normal p-5 text-left ${personType === v ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:border-primary/50"}`}>
              <I className="h-6 w-6 text-primary mb-2" /><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p>
            </Button>
          ))}
          {errors['personType'] ? <p className="text-sm text-destructive sm:col-span-2">{errors['personType']}</p> : null}
          {personType ? <div className="sm:col-span-2 flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Prefere usar o celular?</p><p className="text-sm text-muted-foreground">Leia um QR Code e envie fotos dos documentos direto do celular.</p></div><Button type="button" variant="outline" disabled={handoffM.isPending} onClick={() => handoffM.mutate()}>{handoffM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}Continuar no celular</Button></div> : null}
        </div>
      )}

      <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Continue no celular</DialogTitle><DialogDescription>Aponte a câmera do celular para o QR Code. Ele vale por 15 minutos, funciona uma única vez e só permite enviar os dados do cadastro.</DialogDescription></DialogHeader>
          {handoff ? (() => { const left = Math.max(0, new Date(handoff.expiresAt).getTime() - now); const expired = left === 0 || handoffStatus.data?.state === "expired"; return (
            <div className="space-y-4 text-center">
              <div className={`mx-auto w-fit rounded-lg border bg-background p-3 ${expired ? "opacity-30" : ""}`}><img src={handoff.qr} alt="QR Code para continuar no celular" width={220} height={220} /></div>
              {expired ? (
                <div className="space-y-2"><p className="text-sm font-medium text-destructive">QR Code expirado.</p><Button onClick={() => handoffM.mutate()} disabled={handoffM.isPending}>Gerar novo QR Code</Button></div>
              ) : (
                <p className="text-sm text-muted-foreground">{handoffStatus.data?.state === "opened" ? "Celular conectado. Aguardando você concluir por lá…" : "Aguardando leitura…"} · expira em {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}</p>
              )}
            </div>
          ); })() : null}
        </DialogContent>
      </Dialog>

      {step === 1 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {F({ k: "fullName", label: company ? "Seu nome completo (sócio/administrador)" : "Nome completo" })}
          {F({ k: "cpf", label: "CPF", inputMode: "numeric" })}
          {F({ k: "birthDate", label: "Data de nascimento", type: "date" })}
          {F({ k: "phone", label: "Celular com DDD", inputMode: "tel" })}
          {company && <>
            {F({ k: "legalName", label: "Razão social" })}
            {F({ k: "tradeName", label: "Nome fantasia (opcional)" })}
            {F({ k: "cnpj", label: "CNPJ", inputMode: "numeric" })}
            {F({ k: "companyType", label: "Tipo de empresa (MEI, LTDA…)" })}
            {F({ k: "openedOn", label: "Data de abertura", type: "date" })}
            {F({ k: "legalRepName", label: "Nome do responsável legal" })}
            {F({ k: "legalRepCpf", label: "CPF do responsável legal", inputMode: "numeric" })}
            {F({ k: "legalRepRole", label: "Cargo do responsável (opcional)" })}
          </>}
        </div>
      )}

      {step === 2 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {F({ k: "zipCode", label: "CEP", inputMode: "numeric" })}
          {F({ k: "address", label: "Rua / Avenida" })}
          {F({ k: "number", label: "Número" })}
          {F({ k: "complement", label: "Complemento (opcional)" })}
          {F({ k: "district", label: "Bairro" })}
          {F({ k: "city", label: "Cidade" })}
          <div className="space-y-1.5"><Label htmlFor="state">Estado</Label><Select value={form["state"] ?? ""} onValueChange={(value) => { setForm((current) => ({ ...current, state: value })); setErrors((current) => ({ ...current, state: "" })); }}><SelectTrigger id="state" aria-invalid={!!errors['state']}><SelectValue placeholder="Selecione o Estado" /></SelectTrigger><SelectContent>{BRAZIL_STATES.map(([uf, name]) => <SelectItem key={uf} value={uf}>{uf} — {name}</SelectItem>)}</SelectContent></Select>{errors['state'] ? <p className="text-xs text-destructive">{errors['state']}</p> : null}</div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {F({ k: "monthlyRevenue", label: "Faturamento mensal aproximado", inputMode: "numeric", placeholder: "R$ 0,00", onChange: (event) => { setForm((current) => ({ ...current, monthlyRevenue: formatBRLInput(event.target.value) })); setErrors((current) => ({ ...current, monthlyRevenue: "" })); } })}
            {F({ k: "expectedVolume", label: "Quanto espera receber por mês no Wiize Core", inputMode: "numeric", placeholder: "R$ 0,00", onChange: (event) => { setForm((current) => ({ ...current, expectedVolume: formatBRLInput(event.target.value) })); setErrors((current) => ({ ...current, expectedVolume: "" })); } })}
          </div>
          <div className="space-y-1.5"><Label htmlFor="businessModel">O que você vende ou qual serviço presta?</Label><Textarea id="businessModel" value={form["businessModel"] ?? ""} onChange={set("businessModel")} aria-invalid={!!errors['businessModel']} />{errors['businessModel'] ? <p className="text-xs text-destructive">{errors['businessModel']}</p> : null}</div>
          <div className="space-y-1.5"><Label htmlFor="paymentSources">Como seus clientes costumam pagar pelos seus serviços?</Label><Textarea id="paymentSources" value={form["paymentSources"] ?? ""} onChange={set("paymentSources")} aria-invalid={!!errors['paymentSources']} placeholder="Ex.: Pix, boleto, cartão ou transferência." />{errors['paymentSources'] ? <p className="text-xs text-destructive">{errors['paymentSources']}</p> : null}</div>
        </div>
      )}

      {step === 4 && <Documents company={company} docs={data.documents} errors={errors} />}

      {step === 5 && (
        <div className="space-y-4">
          {([["truth", "Declaro que todas as informações e documentos enviados são verdadeiros."], ["terms", "Li e aceito os Termos de Uso e a Política de Pagamentos."], ["privacy", "Estou ciente da Política de Privacidade e do uso dos meus dados para análise cadastral."]] as const).map(([k, t]) => (
            <label key={k} className="flex gap-3 items-start text-sm"><Checkbox checked={!!consents[k]} onCheckedChange={(v) => setConsents((c) => ({ ...c, [k]: v === true }))} /><span>{t}</span></label>
          ))}
          <p className="text-sm text-muted-foreground">Após o envio, o cadastro é analisado pelo Asaas. Os recebimentos só são liberados depois da aprovação.</p>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2 border-t">
        <Button variant="outline" disabled={step === 0 || saveM.isPending} onClick={() => go(step - 1)}>Voltar</Button>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={saveM.isPending} onClick={() => saveM.mutate(undefined, { onSuccess: () => toast.success("Progresso salvo.") })}>{ui("Salvar")}</Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={saveM.isPending} onClick={() => go(step + 1)}>Continuar</Button>
          ) : (
            <Button disabled={submitM.isPending || !consents["truth"] || !consents["terms"] || !consents["privacy"]} onClick={() => submitM.mutate()}>{submitM.isPending ? "Enviando…" : "Enviar para análise"}</Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Documents({ company, docs, errors, only }: { company: boolean; docs: { kind: string; created_at: string }[]; errors: Record<string, string>; only?: string[] }) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadActivationDocument);
  const [busy, setBusy] = useState<string | null>(null);
  const kinds = useMemo(() => {
    const k: [string, boolean][] = [["id_front", true], ["id_back", true], ["selfie", true], ["address_proof", false]];
    if (company) k.push(["company_doc", true], ["legal_rep_doc", true]);
    return only ? k.filter(([kind]) => only.includes(kind)) : k;
  }, [company, only]);
  const onFile = async (kind: string, file?: File) => {
    if (!file) return;
    setBusy(kind);
    try {
      const prepared = await compressActivationFile(file);
      if (prepared.size > 8 * 1024 * 1024) { toast.error("O arquivo deve ter até 8 MB."); return; }
      const buf = new Uint8Array(await prepared.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await upload({ data: { kind: kind as never, mimeType: prepared.type, base64: btoa(bin) } });
      toast.success("Documento enviado.");
      qc.invalidateQueries({ queryKey: ["activation"] });
    } catch (e) { toast.error((e as Error).message); throw e; } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">As fotos são verificadas e reduzidas antes do envio. Você também pode escolher um PDF de até 8 MB.</p>
      {kinds.map(([k, req]) => {
        const sent = docs.some((d) => d.kind === k);
        return (
          <div key={k} className={`flex flex-col items-stretch justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center ${errors[k] ? "border-destructive" : ""}`}>
            <div><p className="font-medium text-sm">{DOC_LABEL[k]} {req && <span className="text-destructive">*</span>}</p>
              <p className={`text-xs ${errors[k] ? "text-destructive" : "text-muted-foreground"}`}>{errors[k] || (sent ? "Enviado ✓ (envie de novo para substituir)" : req ? "Obrigatório" : "Opcional")}</p></div>
            <ActivationDocumentUpload kind={k} sent={sent} busy={busy !== null} onUpload={(file) => onFile(k, file)} />
          </div>
        );
      })}
    </div>
  );
}

function BetaNotice() {
  const { t } = useTranslation("ui");
  const items = [
    { icon: BadgeCheck, title: t("Teste à vontade"), text: t("Crie cobranças, links e checkouts no modo de teste.") },
    { icon: RefreshCw, title: t("Simule pagamentos"), text: t("Veja todo o fluxo funcionando, sem dinheiro real.") },
    { icon: Clock, title: t("Aviso no lançamento"), text: t("Você recebe um e-mail assim que a produção for liberada.") },
  ];
  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="relative overflow-hidden rounded-3xl border bg-card p-8 shadow-sm sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />{t("Versão beta")}
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("A conta de produção chega em breve")}</h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">{t("A WiizeCore está na versão beta. Por enquanto, é possível apenas testar e simular pagamentos. Em breve vamos liberar o acesso à conta de produção para você receber de verdade.")}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {items.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-background/60 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
              <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground"><strong>{t("Fique tranquilo:")}</strong> {t("assim que liberarmos, você recebe um aviso aqui e no seu e-mail.")}</p>
          <Button asChild variant="outline" size="sm"><Link to="/painel">{t("Voltar ao painel")}</Link></Button>
        </div>
      </div>
    </div>
  );
}
