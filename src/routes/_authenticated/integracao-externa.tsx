import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, Copy, ExternalLink, KeyRound, Pause, Play, Plus, RefreshCw, ShieldCheck, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { ExtWebhooksPanel } from "@/components/ext-webhooks-panel";
import { ExtLogs } from "@/components/ext-insights";
import { ChargesTab, EnvBadge, RequestLogs, ServicesTab } from "@/components/developer/portal-parts";
import { SecureActionDialog } from "@/components/developer/secure-action-dialog";
import { useDevEnv } from "@/lib/dev-environment";
import { EXT_API_BASE } from "@/lib/ext-docs";
import { createExtIntegration, listExtIntegrations, rotateExtKey, setExtIntegrationStatus } from "@/lib/ext-integrations.functions";

export const Route = createFileRoute("/_authenticated/integracao-externa")({
  head: () => ({ meta: [{ title: "API e desenvolvedores — Wiize Core" }, { name: "description", content: "Chaves de API, webhooks, testes e registros da integração com a Wiize Core." }, { property: "og:title", content: "API e desenvolvedores — Wiize Core" }, { property: "og:description", content: "Chaves de API, webhooks, testes e registros da integração com a Wiize Core." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

const SCOPE_LABEL: Record<string, string> = {
  "services:read": "Ver serviços", "customers:read": "Ver clientes", "customers:write": "Cadastrar clientes",
  "charges:read": "Ver cobranças", "charges:write": "Criar cobranças", "subscriptions:read": "Ver assinaturas",
  "subscriptions:write": "Criar assinaturas", "checkout_sessions:write": "Abrir checkout",
};
const STATUS_LABEL: Record<string, string> = { active: "Ativa", suspended: "Suspensa", revoked: "Revogada" };
type Action = { kind: "create" } | { kind: "rotate"; id: string } | { kind: "revoke"; id: string } | null;

function Page() {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const list = useServerFn(listExtIntegrations);
  const create = useServerFn(createExtIntegration);
  const rotate = useServerFn(rotateExtKey);
  const setStatus = useServerFn(setExtIntegrationStatus);
  const q = useQuery({ queryKey: ["ext-integrations"], queryFn: () => list() });
  const env = useDevEnv();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[] | null>(null);
  const [liveOk, setLiveOk] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [revealed, setRevealed] = useState<{ secret: string; publicKey: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [whKeySel, setWhKey] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ext-integrations"] });
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success(t("Copiado.")); };

  const allScopes = q.data?.allScopes ?? [];
  const chosen = scopes ?? allScopes;
  const canManage = Boolean(q.data?.canManage);
  const items = (q.data?.integrations ?? []).filter((i) => i.environment === env && i.status !== "revoked");
  const opened = items.find((i) => i.id === openId) ?? null;
  const whKey = items.some((i) => i.id === whKeySel) ? whKeySel : (items.find((i) => i.status === "active") ?? items[0])?.id ?? null;
  const toggleStatus = async (id: string, status: "active" | "suspended") => {
    try { await setStatus({ data: { id, status } }); toast.success(t("Integração atualizada.")); } catch (e) { toast.error(e instanceof Error ? e.message : t("Algo deu errado.")); }
    void refresh();
  };

  return (
    <div className="space-y-6">
      <Link to="/integracoes" className="text-xs text-muted-foreground hover:text-foreground">← {t("Integrações")}</Link>

      <section className="surface-panel relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <EnvBadge env={env} />
            <h1 className="font-display text-3xl font-semibold tracking-tight">{t("API e desenvolvedores")}</h1>
            <p className="text-sm text-muted-foreground">{t("Crie chaves e webhooks para o seu sistema cobrar pela Wiize Core. Troque entre Teste e Produção no menu lateral.")}</p>
            <code className="inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{EXT_API_BASE}</code>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href="/desenvolvedores" target="_blank" rel="noreferrer"><BookOpen className="size-4" />{t("Documentação")}<ExternalLink className="size-3.5" /></a></Button>
            {canManage && <Button onClick={() => { setName(""); setLiveOk(false); setAction({ kind: "create" }); }}><Plus className="size-4" />{t("Nova chave")}</Button>}
          </div>
        </div>
      </section>

      {revealed && (
        <section className="surface-panel space-y-3 border-primary/50 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold"><ShieldCheck className="size-4 text-primary" />{t("Copie sua chave secreta agora")}</h2>
          <p className="text-xs text-muted-foreground">{t("Ela aparece só esta vez. Guarde apenas no servidor do seu sistema, nunca no navegador ou no código do site.")}</p>
          <KeyRow label={t("Chave secreta")} value={revealed.secret} onCopy={copy} />
          <KeyRow label={t("Chave pública")} value={revealed.publicKey} onCopy={copy} />
          <Button size="sm" variant="outline" onClick={() => setRevealed(null)}>{t("Já copiei")}</Button>
        </section>
      )}

      <section className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div><h2 className="font-display text-lg font-semibold">{t("Suas chaves")}</h2><p className="text-xs text-muted-foreground">{t("Clique em uma chave para ver as configurações.")}</p></div>
          {canManage && items.length > 0 && <Button size="sm" onClick={() => { setName(""); setLiveOk(false); setAction({ kind: "create" }); }}><Plus className="size-4" />{t("Nova chave")}</Button>}
        </div>
        {q.isLoading ? <div className="skeleton-shimmer m-5 h-32 rounded-xl" /> : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <KeyRound className="size-8 text-primary" />
            <p className="font-semibold">{t("Nenhuma chave neste ambiente")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("Crie a primeira chave para conectar o seu sistema. Depois cadastre o webhook nela.")}</p>
            {canManage ? <Button onClick={() => setAction({ kind: "create" })}><Plus className="size-4" />{t("Nova chave")}</Button> : <p className="text-xs text-muted-foreground">{t("Somente o dono ou administrador pode criar chaves.")}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-5 py-2.5 font-medium">{t("Nome")}</th><th className="px-3 py-2.5 font-medium">{t("Chave secreta")}</th><th className="px-3 py-2.5 font-medium">{t("Situação")}</th><th className="px-3 py-2.5 font-medium">{t("Permissões")}</th><th className="px-3 py-2.5 font-medium">{t("Último uso")}</th><th className="px-3 py-2.5 font-medium">{t("Criada em")}</th><th className="w-8" /></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} onClick={() => setOpenId(i.id)} className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3 font-medium">{i.name}</td>
                    <td className="px-3 py-3"><code className="text-xs text-muted-foreground">{i.key?.masked ?? "—"}</code></td>
                    <td className="px-3 py-3"><StatusPill status={i.status} label={t(STATUS_LABEL[i.status] ?? i.status)} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{i.scopes.length}/{allScopes.length}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{i.last_used_at ? formatDateTime(i.last_used_at) : t("Nunca")}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(i.created_at)}</td>
                    <td className="pr-4 text-muted-foreground"><ChevronRight className="size-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Webhook className="size-4 text-primary" />{t("Webhooks")}</h2>
            <p className="text-xs text-muted-foreground">{t("Endereços que recebem os avisos de pagamento do seu sistema.")}</p>
          </div>
          {items.length > 1 && (
            <select value={whKey ?? ""} onChange={(e) => setWhKey(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" aria-label={t("Chave")}>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
        </div>
        {whKey ? <ExtWebhooksPanel integrationId={whKey} canManage={canManage && items.find((i) => i.id === whKey)?.status === "active"} /> : <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("Crie uma chave primeiro para cadastrar webhooks.")}</p>}
      </section>

      <Tabs defaultValue="services">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="services">{t("Serviços")}</TabsTrigger>
          <TabsTrigger value="charges">{t("Cobranças")}</TabsTrigger>
          {env === "test" && <TabsTrigger value="sandbox">{t("Simular pagamentos")}</TabsTrigger>}
          <TabsTrigger value="logs">{t("Registros")}</TabsTrigger>
        </TabsList>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="charges"><ChargesTab env={env} /></TabsContent>
        {env === "test" && <TabsContent value="sandbox"><ChargesTab env="test" simulate /></TabsContent>}
        <TabsContent value="logs" className="space-y-4">
          <h3 className="text-sm font-semibold">{t("Chamadas à API")}</h3>
          <RequestLogs env={env} />
          <h3 className="text-sm font-semibold">{t("Entregas de webhooks")}</h3>
          <ExtLogs />
        </TabsContent>
      </Tabs>

      <SecureActionDialog
        open={action?.kind === "create"} onOpenChange={(v) => !v && setAction(null)}
        title={env === "live" ? t("Nova chave de Produção") : t("Nova chave de Teste")}
        description={t("A chave completa aparece uma única vez. Guarde no servidor do seu sistema.")}
        confirmLabel={t("Criar chave")} needsPassword
        canConfirm={name.trim().length >= 2 && chosen.length > 0 && (env !== "live" || liveOk)}
        onConfirm={async ({ password }) => { const r = await create({ data: { name: name.trim(), environment: env, scopes: chosen, financialPassword: password } }); setRevealed(r); setName(""); void refresh(); }}
      >
        <div className="space-y-1.5">
          <label htmlFor="key-name" className="text-sm font-medium">{t("Nome do seu sistema")}</label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Meu SaaS" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("Permissões")} <span className="text-xs font-normal text-muted-foreground">({chosen.length}/{allScopes.length})</span></span>
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setScopes(chosen.length === allScopes.length ? [] : allScopes)}>{chosen.length === allScopes.length ? t("Limpar") : t("Selecionar tudo")}</button>
          </div>
          {(["read", "write"] as const).map((kind) => (
            <div key={kind} className="overflow-hidden rounded-lg border border-border">
              <p className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kind === "read" ? t("Leitura") : t("Escrita")}</p>
              {allScopes.filter((s) => s.endsWith(`:${kind}`)).map((s) => (
                <label key={s} className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm first-of-type:border-t-0 hover:bg-muted/30">
                  <span>{t(SCOPE_LABEL[s] ?? s)}<span className="ml-2 font-mono text-[10px] text-muted-foreground">{s}</span></span>
                  <Checkbox checked={chosen.includes(s)} onCheckedChange={(v) => setScopes(v ? [...chosen, s] : chosen.filter((x) => x !== s))} />
                </label>
              ))}
            </div>
          ))}
        </div>
        {env === "live" && <label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><Checkbox className="mt-0.5" checked={liveOk} onCheckedChange={(v) => setLiveOk(v === true)} />{t("Entendo que esta chave cria cobranças reais.")}</label>}
      </SecureActionDialog>
      <SecureActionDialog
        open={action?.kind === "rotate"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Gerar nova chave")} description={t("A chave atual para de funcionar na hora.")} confirmLabel={t("Gerar nova chave")} needsPassword
        onConfirm={async ({ password }) => { if (action?.kind !== "rotate") return; setRevealed(await rotate({ data: { id: action.id, financialPassword: password } })); void refresh(); }}
      />
      <SecureActionDialog
        open={action?.kind === "revoke"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Revogar chave?")} description={t("Revogar é definitivo. O sistema conectado perde o acesso. Continuar?")} confirmLabel={t("Revogar")} destructive
        needsPassword
        onConfirm={async ({ password }) => { if (action?.kind !== "revoke") return; await setStatus({ data: { id: action.id, status: "revoked", financialPassword: password } }); toast.success(t("Chave revogada.")); setOpenId(null); void refresh(); }}
      />
      <Dialog open={Boolean(opened)} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-lg">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">{opened.name}<StatusPill status={opened.status} label={t(STATUS_LABEL[opened.status] ?? opened.status)} /></DialogTitle>
                <DialogDescription>{opened.environment === "live" ? t("Chave de Produção") : t("Chave de Teste")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {opened.key && <div className="space-y-2"><Field label={t("Chave pública")} value={opened.key.publicKey} onCopy={() => copy(opened.key!.publicKey)} /><Field label={t("Chave secreta")} value={opened.key.masked} /></div>}
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-muted-foreground">{t("Criada em")}</dt><dd>{formatDateTime(opened.created_at)}</dd></div>
                  <div><dt className="text-muted-foreground">{t("Último uso")}</dt><dd>{opened.last_used_at ? formatDateTime(opened.last_used_at) : t("Nunca")}</dd></div>
                </dl>
                <div><p className="mb-2 text-xs font-medium text-muted-foreground">{t("Permissões")}</p><div className="flex flex-wrap gap-1.5">{opened.scopes.map((s) => <span key={s} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px]">{t(SCOPE_LABEL[s] ?? s)}</span>)}</div></div>
                {canManage && (
                  <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
                    <Button variant="outline" onClick={() => setAction({ kind: "rotate", id: opened.id })}><RefreshCw className="size-4" />{t("Nova chave")}</Button>
                    <Button variant="outline" onClick={() => void toggleStatus(opened.id, opened.status === "active" ? "suspended" : "active")}>{opened.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}{opened.status === "active" ? t("Suspender") : t("Reativar")}</Button>
                    <Button variant="outline" className="text-destructive" onClick={() => setAction({ kind: "revoke", id: opened.id })}><Trash2 className="size-4" />{t("Revogar")}</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
      {onCopy && <button type="button" onClick={onCopy} className="text-muted-foreground hover:text-foreground"><Copy className="size-3.5" /></button>}
    </div>
  );
}

function KeyRow({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="flex-1 break-all text-xs">{value}</code>
      <Button size="sm" variant="outline" onClick={() => onCopy(value)}><Copy className="size-3.5" /></Button>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${status === "active" ? "bg-primary" : "bg-muted-foreground"}`} />{label}</span>;
}
