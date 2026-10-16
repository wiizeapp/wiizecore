import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BookOpen, Copy, ExternalLink, KeyRound, Pause, Play, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const refresh = () => qc.invalidateQueries({ queryKey: ["ext-integrations"] });
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success(t("Copiado.")); };

  const allScopes = q.data?.allScopes ?? [];
  const chosen = scopes ?? allScopes;
  const canManage = Boolean(q.data?.canManage);
  const items = (q.data?.integrations ?? []).filter((i) => i.environment === env && i.status !== "revoked");
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

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("Suas chaves")}</h2>
        {q.isLoading ? <div className="skeleton-shimmer h-40 rounded-xl" /> : items.length === 0 ? (
          <div className="surface-panel flex flex-col items-center gap-3 p-10 text-center">
            <KeyRound className="size-8 text-primary" />
            <p className="font-semibold">{t("Nenhuma chave neste ambiente")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("Crie a primeira chave para conectar o seu sistema. Depois cadastre o webhook nela.")}</p>
            {canManage ? <Button onClick={() => setAction({ kind: "create" })}><Plus className="size-4" />{t("Nova chave")}</Button> : <p className="text-xs text-muted-foreground">{t("Somente o dono ou administrador pode criar chaves.")}</p>}
          </div>
        ) : items.map((i) => (
          <article key={i.id} className="surface-panel grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold">{i.name}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${i.status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{t(STATUS_LABEL[i.status] ?? i.status)}</span>
              </div>
              {i.key && (
                <div className="space-y-2">
                  <Field label={t("Chave pública")} value={i.key.publicKey} onCopy={() => copy(i.key!.publicKey)} />
                  <Field label={t("Chave secreta")} value={i.key.masked} />
                </div>
              )}
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-muted-foreground">{t("Criada em")}</dt><dd>{formatDateTime(i.created_at)}</dd></div>
                <div><dt className="text-muted-foreground">{t("Último uso")}</dt><dd>{i.last_used_at ? formatDateTime(i.last_used_at) : t("Nunca")}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-1.5">{i.scopes.map((s) => <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-[11px]">{t(SCOPE_LABEL[s] ?? s)}</span>)}</div>
              {canManage && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button size="sm" variant="outline" onClick={() => setAction({ kind: "rotate", id: i.id })}><RefreshCw className="size-4" />{t("Gerar nova chave")}</Button>
                  <Button size="sm" variant="outline" onClick={() => void toggleStatus(i.id, i.status === "active" ? "suspended" : "active")}>{i.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}{i.status === "active" ? t("Suspender") : t("Reativar")}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAction({ kind: "revoke", id: i.id })}><Trash2 className="size-4" />{t("Revogar")}</Button>
                </div>
              )}
            </div>
            <div className="lg:border-l lg:border-border lg:pl-6"><ExtWebhooksPanel integrationId={i.id} canManage={canManage} /></div>
          </article>
        ))}
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
        <details className="rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t("Permissões")} ({chosen.length}/{allScopes.length})</summary>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {allScopes.map((s) => (
              <label key={s} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={chosen.includes(s)} onChange={(e) => setScopes((e.target.checked ? [...chosen, s] : chosen.filter((x) => x !== s)))} />{t(SCOPE_LABEL[s] ?? s)}
              </label>
            ))}
          </div>
        </details>
        {env === "live" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={liveOk} onChange={(e) => setLiveOk(e.target.checked)} />{t("Entendo que esta chave cria cobranças reais.")}</label>}
      </SecureActionDialog>
      <SecureActionDialog
        open={action?.kind === "rotate"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Gerar nova chave")} description={t("A chave atual para de funcionar na hora.")} confirmLabel={t("Gerar nova chave")} needsPassword
        onConfirm={async ({ password }) => { if (action?.kind !== "rotate") return; setRevealed(await rotate({ data: { id: action.id, financialPassword: password } })); void refresh(); }}
      />
      <SecureActionDialog
        open={action?.kind === "revoke"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Revogar chave?")} description={t("Revogar é definitivo. O sistema conectado perde o acesso. Continuar?")} confirmLabel={t("Revogar")} destructive
        onConfirm={async () => { if (action?.kind !== "revoke") return; await setStatus({ data: { id: action.id, status: "revoked" } }); toast.success(t("Integração atualizada.")); void refresh(); }}
      />
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
