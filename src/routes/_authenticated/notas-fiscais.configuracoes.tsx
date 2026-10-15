import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FiscalServiceDialog } from "@/components/invoices/fiscal-service-dialog";
import { ArrowLeft, CheckCircle2, Circle, KeyRound, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { archiveFiscalService, getFiscalOverview, refreshMunicipalOptions, saveFiscalService, saveFiscalSettings, saveIssuanceDefaults, searchMunicipalServices } from "@/lib/invoices.functions";
import { confirmAction } from "@/components/confirm-dialog";
import { FormSection, PageHeader, StatusBadge, ErrorState, ListSkeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/notas-fiscais/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações fiscais — Wiize Core" },
      { name: "description", content: "Configure os dados necessários para emissão de NFS-e." },
      { property: "og:title", content: "Configurações fiscais — Wiize Core" },
      { property: "og:description", content: "Configure os dados necessários para emissão de NFS-e." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfigFiscal,
});

const RULES = [
  ["ON_PAYMENT_CONFIRMATION", "Após o pagamento", "A NFS-e será processada após a confirmação do pagamento."],
  ["ON_PAYMENT_DUE_DATE", "Na data de vencimento", "A nota é emitida no dia do vencimento da cobrança."],
  ["BEFORE_PAYMENT_DUE_DATE", "Antes do vencimento", "A nota é emitida alguns dias antes do vencimento."],
  ["ON_DUE_DATE_MONTH", "No mês do vencimento", "A nota é emitida no mês de vencimento da cobrança."],
  ["ON_NEXT_MONTH", "No mês seguinte", "A nota é emitida no mês seguinte ao vencimento."],
] as const;

function ConfigFiscal() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getFiscalOverview);
  const refreshFn = useServerFn(refreshMunicipalOptions);
  const ov = useQuery({ queryKey: ["fiscal-overview"], queryFn: () => fetchOverview() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fiscal-overview"] });
  const refresh = useMutation({ mutationFn: () => refreshFn(), onSuccess: () => { void invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!autoTried && ov.data && ov.data.connected && ov.data.canEdit && !Object.keys(ov.data.options ?? {}).length) { setAutoTried(true); refresh.mutate(); }
  }, [ov.data, autoTried]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ov.isLoading) return <div><PageHeader title="Configurações fiscais" description="Configure os dados necessários para emissão de NFS-e." /><ListSkeleton rows={6} /></div>;
  if (ov.isError || !ov.data) return <div><PageHeader title="Configurações fiscais" /><ErrorState onRetry={() => ov.refetch()} /></div>;
  const d = ov.data;
  const st = d.settings?.configStatus ?? "pending";

  return (
    <div className="space-y-6">
      <div>
        <Link to="/notas-fiscais" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Notas fiscais</Link>
        <PageHeader title="Configurações fiscais" description="Configure os dados necessários para emissão de NFS-e."
          action={<Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending || !d.connected}><RefreshCw className={`mr-1.5 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />Verificar novamente</Button>} />
      </div>

      {!d.connected ? (
        <div className="surface-panel p-5 text-sm">Conclua a ativação de pagamentos antes de configurar notas fiscais. <Link to="/ativacao" className="text-primary underline">{ui("Ativar pagamentos")}</Link></div>
      ) : null}

      <section className="surface-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {st === "configured" ? <CheckCircle2 className="h-5 w-5 text-primary" /> : st === "attention" ? <TriangleAlert className="h-5 w-5 text-warning" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
          <div>
            <p className="font-display text-sm font-semibold">Configuração fiscal</p>
            <p className="text-xs text-muted-foreground">{st === "configured" ? "Configurada — pronta para emitir notas." : st === "attention" ? "Requer atenção" : "Configuração pendente"}</p>
          </div>
        </div>
        <StatusBadge tone={d.environment === "production" ? "warning" : "neutral"}>{d.environment === "production" ? "Ambiente de produção" : "Ambiente de teste"}</StatusBadge>
      </section>
      {d.settings?.missing?.length && st !== "configured" ? (
        <ul className="surface-panel space-y-1 p-5 text-sm">{d.settings.missing.map((m) => <li key={m} className="flex items-center gap-2"><TriangleAlert className="h-3.5 w-3.5 text-warning" />{m}</li>)}</ul>
      ) : null}

      <FormSection title="Empresa e município" description="Usamos o CNPJ e a cidade do cadastro da empresa. Se mudarem, verifique a configuração novamente.">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Empresa</dt><dd className="font-medium">{d.tenant?.legal_name ?? d.tenant?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">CPF/CNPJ</dt><dd className="font-medium">{d.tenant?.document ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Município</dt><dd className="font-medium">{d.tenant?.city ? `${d.tenant.city}/${d.tenant.state ?? ""}` : "—"}</dd></div>
        </dl>
        {!d.tenant?.document || !d.tenant?.city ? <p className="mt-3 text-xs text-warning">Complete os dados da empresa em <Link to="/configuracoes" className="underline">{ui("Dados e conta")}</Link>.</p> : null}
      </FormSection>

      {d.canEdit && d.connected ? <SettingsForm d={d} onSaved={invalidate} /> : null}
      <FiscalServices d={d} onSaved={invalidate} />
      {d.canEdit ? <Defaults d={d} onSaved={invalidate} /> : null}
    </div>
  );
}

type Ov = Awaited<ReturnType<typeof getFiscalOverview>>;

function SettingsForm({ d, onSaved }: { d: Ov; onSaved: () => void }) {
  const save = useServerFn(saveFiscalSettings);
  const s = d.settings;
  const o = d.options ?? {};
  const [f, setF] = useState({
    portal: "national" as const, municipalInscription: s?.municipalInscription ?? "", simplesNacional: s?.simplesNacional ?? true,
    cnae: s?.cnae ?? "", specialTaxRegime: s?.specialTaxRegime ?? "", serviceListItem: s?.serviceListItem ?? "", nbsCode: s?.nbsCode ?? "",
    rpsSerie: s?.rpsSerie ?? "", rpsNumber: s?.rpsNumber ? String(s.rpsNumber) : "", nationalRegime: s?.nationalRegime ?? "", email: s?.email ?? "",
  });
  const [cred, setCred] = useState({ username: "", password: "", accessToken: "", certificatePassword: "" });
  const [cert, setCert] = useState<{ b64: string; name: string } | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const m = useMutation({
    mutationFn: async () => {
      let confirmProduction: boolean | undefined;
      if (d.environment === "production" && !s?.productionConfirmed) {
        confirmProduction = await confirmAction({ title: "Ambiente de produção", description: "Esta ação poderá gerar um documento fiscal válido. Deseja continuar?", confirmText: "Continuar" });
        if (!confirmProduction) throw new Error("Operação cancelada.");
      }
      return save({ data: {
        portal: f.portal, email: f.email || null, municipalInscription: f.municipalInscription || null, simplesNacional: f.simplesNacional, culturalProjectsPromoter: false,
        cnae: f.cnae || null, specialTaxRegime: f.specialTaxRegime || null, serviceListItem: f.serviceListItem || null, nbsCode: f.nbsCode || null,
        rpsSerie: f.rpsSerie || null, rpsNumber: f.rpsNumber ? Number(f.rpsNumber) : null, nationalRegime: f.nationalRegime || null,
        username: cred.username || undefined, password: cred.password || undefined, accessToken: cred.accessToken || undefined,
        certificateBase64: cert?.b64, certificateName: cert?.name, certificatePassword: cred.certificatePassword || undefined, confirmProduction,
      } });
    },
    onSuccess: (r) => { setCred({ username: "", password: "", accessToken: "", certificatePassword: "" }); setCert(null); toast.success(r.status === "configured" ? "Configuração fiscal concluída." : "Dados salvos. Confira o que ainda falta."); onSaved(); },
    onError: (e: Error) => { if (e.message !== "Operação cancelada.") toast.error("Não foi possível salvar", { description: e.message }); },
  });

  const help = (t?: string | null) => (t ? <p className="mt-1 whitespace-pre-line text-[11px] text-muted-foreground">{t}</p> : null);
  const field = (k: keyof typeof f, label: string, hint?: string | null, extra: Record<string, string> = {}) => (
    <div><Label htmlFor={`fs-${k}`}>{label}</Label><Input id={`fs-${k}`} value={String(f[k])} onChange={(e) => set(k, e.target.value)} {...extra} />{help(hint)}</div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-6">
      <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"><span className="font-medium">Portal Nacional da NFS-e</span><span className="block text-xs text-muted-foreground">As notas são emitidas pelo emissor nacional. O emissor municipal foi descontinuado pelo provedor.</span></p>

      <FormSection title="Dados fiscais" description="Mostramos somente o que sua prefeitura exige.">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("municipalInscription", "Inscrição municipal", o.municipalInscriptionHelp)}
          <div>
            <Label>Simples Nacional</Label>
            <Select value={f.simplesNacional ? "sim" : "nao"} onValueChange={(v) => set("simplesNacional", v === "sim")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sim">Sim, sou optante</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
            </Select>
          </div>
          {field("cnae", "CNAE (opcional)")}
          {field("email", "E-mail para avisos fiscais (opcional)", null, { type: "email" })}
          {o.usesSpecialTaxRegimes ? (
            <div>
              <Label>Regime especial de tributação</Label>
              <Select value={f.specialTaxRegime} onValueChange={(v) => set("specialTaxRegime", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{(o.specialTaxRegimesList ?? []).map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}</SelectContent>
              </Select>{help(o.specialTaxRegimeHelp)}
            </div>
          ) : null}
          {o.usesServiceListItem ? field("serviceListItem", "Item da lista de serviço", o.serviceListItemHelp) : null}
          {f.portal === "national" ? <>{field("nationalRegime", "Regime de apuração (Portal Nacional, se aplicável)")}{field("nbsCode", "Código NBS (se exigido)")}</> : null}
        </div>
      </FormSection>

      {o.authenticationType ? (
        <FormSection title="Acesso ao portal da prefeitura" description="Enviado com segurança direto ao emissor. O Wiize Core não guarda nem mostra esses dados.">
          {s?.credentialsConfigured ? <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-primary"><KeyRound className="h-3.5 w-3.5" />Credenciais configuradas. Preencha apenas se quiser trocar.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {o.authenticationType === "USER_AND_PASSWORD" ? <>
              <div><Label>Usuário da prefeitura</Label><Input autoComplete="off" value={cred.username} onChange={(e) => setCred({ ...cred, username: e.target.value })} /></div>
              <div><Label>Senha da prefeitura</Label><Input type="password" autoComplete="new-password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} /></div>
            </> : null}
            {o.authenticationType === "TOKEN" ? <div className="sm:col-span-2"><Label>Token de acesso</Label><Input type="password" autoComplete="off" value={cred.accessToken} onChange={(e) => setCred({ ...cred, accessToken: e.target.value })} />{help(o.accessTokenHelp)}</div> : null}
            {o.authenticationType === "CERTIFICATE" ? <>
              <div><Label>Certificado digital (.pfx)</Label><Input type="file" accept=".pfx,.p12" onChange={(e) => {
                const file = e.target.files?.[0]; if (!file) return;
                if (file.size > 140_000) { toast.error("Arquivo muito grande."); return; }
                const r = new FileReader(); r.onload = () => setCert({ b64: String(r.result).split(",")[1] ?? "", name: file.name }); r.readAsDataURL(file);
              }} />{help(o.digitalCertificatedHelp)}</div>
              <div><Label>Senha do certificado</Label><Input type="password" autoComplete="new-password" value={cred.certificatePassword} onChange={(e) => setCred({ ...cred, certificatePassword: e.target.value })} /></div>
            </> : null}
          </div>
        </FormSection>
      ) : null}

      <div className="flex justify-end"><Button type="submit" disabled={m.isPending}>{m.isPending ? "Salvando…" : "Salvar configuração fiscal"}</Button></div>
    </form>
  );
}

type FsRow = Ov["services"][number];

function FiscalServices({ d, onSaved }: { d: Ov; onSaved: () => void }) {
  const [edit, setEdit] = useState<FsRow | "new" | null>(null);
  const archive = useServerFn(archiveFiscalService);
  const active = d.services.filter((s) => s.active);
  return (
    <FormSection title="Serviços fiscais" description="Como cada serviço aparece na nota. Ligue ao serviço que você vende para preencher sozinho.">
      <div className="space-y-2">
        {active.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum serviço fiscal cadastrado.</p> : active.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">{s.municipal_service_code ? `Código ${s.municipal_service_code}` : s.municipal_service_name} · ISS {s.iss ?? 0}%{s.service_id ? " · ligado a um serviço" : ""}</p>
            </div>
            {d.canEdit ? <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (await confirmAction({ title: "Arquivar este serviço fiscal?", confirmText: "Arquivar" })) { await archive({ data: { id: s.id } }); onSaved(); } }}>Arquivar</Button>
            </div> : null}
          </div>
        ))}
        {d.canEdit ? <Button variant="outline" size="sm" onClick={() => setEdit("new")}><Plus className="mr-1.5 h-4 w-4" />Novo serviço fiscal</Button> : null}
      </div>
      {edit ? <FiscalServiceDialog row={edit === "new" ? null : edit} portal="national" codeHelp={d.options?.municipalServiceCodeHelp} onClose={() => setEdit(null)} onSaved={onSaved} /> : null}
    </FormSection>
  );
}

function Defaults({ d, onSaved }: { d: Ov; onSaved: () => void }) {
  const save = useServerFn(saveIssuanceDefaults);
  const s = d.settings;
  const [f, setF] = useState({
    autoIssue: s?.autoIssue ?? false, rule: (s?.autoIssueRule ?? "ON_PAYMENT_CONFIRMATION") as (typeof RULES)[number][0],
    days: (s?.autoIssueDays ?? 5) as 5 | 10 | 15 | 30 | 60, fs: s?.defaultFiscalServiceId ?? "", obs: s?.defaultObservations ?? "",
  });
  const m = useMutation({
    mutationFn: () => save({ data: { autoIssue: f.autoIssue, rule: f.rule, days: f.rule === "BEFORE_PAYMENT_DUE_DATE" ? f.days : null, defaultFiscalServiceId: f.fs || null, defaultObservations: f.obs || null } }),
    onSuccess: () => { toast.success("Emissão padrão salva."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <FormSection title="Emissão automática" description="Padrão para novas cobranças. Em recorrências, a regra é aplicada na própria recorrência.">
      <div className="space-y-4">
        <div className="flex items-center gap-3"><Switch id="auto" checked={f.autoIssue} onCheckedChange={(v) => setF({ ...f, autoIssue: v })} /><Label htmlFor="auto">Emitir automaticamente</Label></div>
        {f.autoIssue ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {RULES.map(([k, t, dsc]) => (
              <button key={k} type="button" onClick={() => setF({ ...f, rule: k })} className={`rounded-xl border p-3 text-left text-sm ${f.rule === k ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <span className="block font-medium">{t}</span><span className="text-xs text-muted-foreground">{dsc}</span>
              </button>
            ))}
          </div>
        ) : null}
        {f.autoIssue && f.rule !== "ON_PAYMENT_CONFIRMATION" ? <p className="text-xs text-muted-foreground">Essa regra vale para cobranças recorrentes. Cobranças avulsas emitem após o pagamento.</p> : null}
        {f.autoIssue && f.rule === "BEFORE_PAYMENT_DUE_DATE" ? (
          <div className="flex flex-wrap gap-1.5">{([5, 10, 15, 30, 60] as const).map((n) => (
            <button key={n} type="button" onClick={() => setF({ ...f, days: n })} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${f.days === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n} dias</button>
          ))}</div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Serviço fiscal padrão</Label>
            <Select value={f.fs || "none"} onValueChange={(v) => setF({ ...f, fs: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nenhum</SelectItem>{d.services.filter((x) => x.active).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Observações padrão</Label><Input maxLength={2000} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></div>
        </div>
        <div className="flex justify-end"><Button onClick={() => m.mutate()} disabled={m.isPending}>Salvar emissão padrão</Button></div>
      </div>
    </FormSection>
  );
}
