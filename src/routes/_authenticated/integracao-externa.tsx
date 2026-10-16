import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";
import { ExtWebhooksPanel } from "@/components/ext-webhooks-panel";
import { ExtAiGuide, ExtLogs, ExtOverview } from "@/components/ext-insights";
import { AiPromptCards, ApiReference, ChargesTab, EnvBadge, GettingStarted, RequestLogs, ServicesTab } from "@/components/developer/portal-parts";
import { useDevEnv } from "@/lib/dev-environment";
import { BookOpen, CreditCard, FileCode2, KeyRound, Repeat, ScrollText, ShoppingCart, Users, Webhook, FlaskConical } from "lucide-react";
import { createExtIntegration, listExtIntegrations, rotateExtKey, setExtIntegrationStatus } from "@/lib/ext-integrations.functions";

export const Route = createFileRoute("/_authenticated/integracao-externa")({
  head: () => ({ meta: [{ title: "Developer Portal — Wiize Core" }, { name: "description", content: "API de billing da Wiize Core: checkout, cobranças, assinaturas, webhooks e sandbox." }, { property: "og:title", content: "Developer Portal — Wiize Core" }, { property: "og:description", content: "API de billing da Wiize Core: checkout, cobranças, assinaturas, webhooks e sandbox." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },] }),
  component: Page,
});

const SCOPE_LABEL: Record<string, string> = {
  "services:read": "Ver serviços", "customers:read": "Ver clientes", "customers:write": "Cadastrar clientes",
  "charges:read": "Ver cobranças", "charges:write": "Criar cobranças", "subscriptions:read": "Ver assinaturas",
  "subscriptions:write": "Criar assinaturas", "checkout_sessions:write": "Abrir checkout",
};
const STATUS_LABEL: Record<string, string> = { active: "Ativa", suspended: "Suspensa", revoked: "Revogada" };

async function step2fa(t: (k: string) => string) {
  const mfa = await getMfaState();
  const code = mfa.factorId && !mfa.isAal2 ? window.prompt(t("Digite o código do seu app autenticador")) ?? "" : "";
  await ensureTwoFactor(code);
}

function Page() {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const list = useServerFn(listExtIntegrations);
  const create = useServerFn(createExtIntegration);
  const rotate = useServerFn(rotateExtKey);
  const setStatus = useServerFn(setExtIntegrationStatus);
  const q = useQuery({ queryKey: ["ext-integrations"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [finPass, setFinPass] = useState("");
  const env = useDevEnv();
  const [tab, setTab] = useState("overview");
  const [scopes, setScopes] = useState<string[]>(["services:read", "customers:write", "charges:write", "charges:read", "checkout_sessions:write"]);
  const [revealed, setRevealed] = useState<{ secret: string; publicKey: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ext-integrations"] });
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : t("Algo deu errado."));

  const createM = useMutation({
    mutationFn: async () => { await step2fa(t); return create({ data: { name, environment: env, scopes, financialPassword: finPass } }); },
    onSuccess: (r) => { setRevealed(r); setName(""); setFinPass(""); void refresh(); }, onError: onErr,
  });
  const rotateM = useMutation({
    mutationFn: async (id: string) => { if (!window.confirm(t("A chave atual para de funcionar na hora. Continuar?"))) throw new Error(t("Cancelado.")); const pw = window.prompt(t("Digite sua senha financeira para gerar a nova chave")) ?? ""; if (!pw) throw new Error(t("Cancelado.")); await step2fa(t); return rotate({ data: { id, financialPassword: pw } }); },
    onSuccess: (r) => { setRevealed(r); void refresh(); }, onError: onErr,
  });
  const statusM = useMutation({
    mutationFn: async (v: { id: string; status: "active" | "suspended" | "revoked" }) => {
      if (v.status === "revoked" && !window.confirm(t("Revogar é definitivo. O sistema conectado perde o acesso. Continuar?"))) throw new Error(t("Cancelado."));
      await step2fa(t); return setStatus({ data: v });
    },
    onSuccess: () => { toast.success(t("Integração atualizada.")); void refresh(); }, onError: onErr,
  });

  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success(t("Copiado.")); };
  const allItems = q.data?.integrations ?? [];
  const items = allItems.filter((i) => i.environment === env);
  const activeKeys = items.filter((i) => i.status === "active" && i.key).length;
  const go = (v: string) => { setTab(v); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const QUICK: { tab: string; label: string; icon: typeof KeyRound }[] = [
    { tab: "keys", label: "API e chaves", icon: KeyRound }, { tab: "docs", label: "Documentação", icon: BookOpen },
    { tab: "webhooks", label: "Webhooks", icon: Webhook }, { tab: "services", label: "Checkout", icon: ShoppingCart },
    { tab: "services", label: "Clientes", icon: Users }, { tab: "charges", label: "Cobranças", icon: CreditCard },
    { tab: "subscriptions", label: "Assinaturas", icon: Repeat }, { tab: "sandbox", label: "Sandbox", icon: FlaskConical },
    { tab: "logs", label: "Logs e eventos", icon: ScrollText }, { tab: "start", label: "Exemplos de código", icon: FileCode2 },
  ];

  return (
    <div className="space-y-6">
      <Link to="/integracoes" className="text-xs text-muted-foreground hover:text-foreground">← {t("Integrações")}</Link>
      <section className="surface-panel space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2"><EnvBadge env={env} /><span className="text-xs text-muted-foreground">{t("Troque o ambiente no menu lateral.")}</span></div>
        <div className="max-w-3xl space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("Conecte sua aplicação à WiizeCore.")}</h1>
          <p className="text-sm text-muted-foreground">{t("Pagamentos, cobranças e assinaturas integrados ao seu SaaS. Utilize nossa API para automatizar o faturamento, acompanhar transações e sincronizar o acesso dos seus clientes.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => go("start")}>{t("Começar integração")}</Button>
          <Button variant="outline" onClick={() => go("docs")}>{t("Ver documentação")}</Button>
          <Button variant="ghost" onClick={() => go("webhooks")}>{t("Webhooks e eventos")}</Button>
          <span className="text-xs text-muted-foreground">{t("Chaves ativas neste ambiente")}: {q.isLoading ? "…" : activeKeys}</span>
        </div>
      </section>
      <AiPromptCards env={env} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {QUICK.map((c) => (
          <button key={c.label} type="button" onClick={() => go(c.tab)} className="surface-panel flex items-center gap-2 p-3 text-left text-sm transition-colors hover:border-primary/40">
            <c.icon className="size-4 text-primary" strokeWidth={1.8} />{t(c.label)}
          </button>
        ))}
      </div>

      {revealed && (
        <section className="surface-panel space-y-3 border-primary/40 p-5">
          <h2 className="font-display text-base font-semibold">{t("Copie sua chave secreta agora")}</h2>
          <p className="text-xs text-muted-foreground">{t("Ela aparece só esta vez. Guarde apenas no servidor do seu sistema, nunca no navegador ou no código do site.")}</p>
          <KeyRow label={t("Chave secreta")} value={revealed.secret} onCopy={copy} />
          <KeyRow label={t("Chave pública")} value={revealed.publicKey} onCopy={copy} />
          <Button size="sm" variant="outline" onClick={() => setRevealed(null)}>{t("Já copiei")}</Button>
        </section>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">{t("Visão geral")}</TabsTrigger>
          <TabsTrigger value="start">{t("Primeiros passos")}</TabsTrigger>
          <TabsTrigger value="keys">{t("Chaves de API")}</TabsTrigger>
          <TabsTrigger value="docs">{t("Documentação")}</TabsTrigger>
          <TabsTrigger value="services">{t("Serviços e checkout")}</TabsTrigger>
          <TabsTrigger value="charges">{t("Cobranças")}</TabsTrigger>
          <TabsTrigger value="subscriptions">{t("Assinaturas")}</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
          <TabsTrigger value="logs">{t("Logs e diagnóstico")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {env === "live" ? <ExtOverview /> : <p className="surface-panel p-4 text-xs text-muted-foreground">{t("Os números financeiros aparecem somente no ambiente de Produção.")}</p>}
          <div className="surface-panel space-y-3 p-5 text-sm">
            <p>{t("Com a Integração Externa, o seu sistema pede à Wiize Core para criar clientes e cobranças, e a Wiize Core avisa o seu sistema quando o pagamento acontece.")}</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{t("Chave secreta: fica só no servidor do seu sistema. Nunca no navegador.")}</li>
              <li>{t("Chaves de teste só funcionam no ambiente de testes; chaves de produção, só com dinheiro real.")}</li>
              <li>{t("A senha financeira nunca é usada pela API nem compartilhada com o sistema integrado.")}</li>
              <li>{t("Sem monitoramento público de disponibilidade por enquanto: acompanhe suas chamadas em Logs e diagnóstico.")}</li>
            </ul>
          </div>
          <ExtAiGuide />
        </TabsContent>
        <TabsContent value="start"><GettingStarted env={env} onGo={go} /></TabsContent>
        <TabsContent value="docs"><ApiReference /></TabsContent>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="charges"><ChargesTab env={env} /></TabsContent>
        <TabsContent value="subscriptions"><ChargesTab env={env} recurringOnly simulate={env === "test"} /></TabsContent>
        <TabsContent value="sandbox">
          {env === "test" ? <ChargesTab env="test" simulate /> : <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Mude para Sandbox no menu lateral para simular pagamentos de teste.")}</p>}
        </TabsContent>
        <TabsContent value="logs" className="space-y-4">
          <h3 className="text-sm font-semibold">{t("Chamadas à API")}</h3>
          <RequestLogs env={env} />
          <h3 className="text-sm font-semibold">{t("Entregas de webhooks")}</h3>
          <ExtLogs />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("A Wiize Core avisa o seu sistema quando algo acontece com uma cobrança criada pela API. Cada aviso vem assinado com o cabeçalho WiizePay-Signature.")}</p>
          {items.filter((i) => i.status !== "revoked").length === 0 ? <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Crie uma integração primeiro.")}</p> : items.filter((i) => i.status !== "revoked").map((i) => (
            <section key={i.id} className="surface-panel space-y-3 p-5">
              <p className="font-semibold">{i.name}</p>
              <ExtWebhooksPanel integrationId={i.id} canManage={Boolean(q.data?.canManage)} />
            </section>
          ))}
        </TabsContent>

        <TabsContent value="keys" className="space-y-4">
          {q.data?.canManage && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="font-display text-base font-semibold">{t("Nova integração")}</h2>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Nome do seu sistema")} maxLength={80} />
<EnvBadge env={env} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(q.data.allScopes ?? []).map((s) => (
                  <label key={s} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} />
                    {t(SCOPE_LABEL[s] ?? s)}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("Nenhuma chave dá acesso a saldo, saques, contas bancárias ou configurações da empresa.")}</p>
              <div className="max-w-xs space-y-1">
                <label htmlFor="ext-fin-pass" className="text-xs font-medium">{t("Senha financeira")}</label>
                <Input id="ext-fin-pass" type="password" autoComplete="off" value={finPass} onChange={(e) => setFinPass(e.target.value)} maxLength={128} />
                <p className="text-[11px] text-muted-foreground">{t("Obrigatória para gerar chaves. A chave completa aparece uma única vez.")}</p>
              </div>
              <Button onClick={() => { if (env === "live" && !window.confirm(t("Criar uma chave de PRODUÇÃO? Ela processa cobranças reais."))) return; createM.mutate(); }} disabled={createM.isPending || name.trim().length < 2 || !scopes.length || !finPass}>{createM.isPending ? t("Criando…") : t("Criar integração")}</Button>
            </section>
          )}

          {q.isLoading ? <div className="skeleton-shimmer h-24 rounded-xl" /> : items.length === 0 ? (
            <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Nenhuma integração criada ainda.")}</p>
          ) : items.map((i) => (
            <section key={i.id} className="surface-panel space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{i.name}</p>
                  <Badge variant="secondary">{i.environment === "test" ? t("Teste") : t("Produção")}</Badge>
                  <Badge variant={i.status === "active" ? "default" : "secondary"}>{t(STATUS_LABEL[i.status] ?? i.status)}</Badge>
                </div>
                <code className="text-[11px] text-muted-foreground">{i.id}</code>
              </div>
              {i.key && (
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">{t("Chave pública")}</dt><dd className="flex items-center gap-2 font-mono break-all">{i.key.publicKey}<button className="text-primary" onClick={() => copy(i.key!.publicKey)}>{t("Copiar")}</button></dd></div>
                  <div><dt className="text-muted-foreground">{t("Chave secreta")}</dt><dd className="font-mono">{i.key.masked}</dd></div>
                </dl>
              )}
              <dl className="grid gap-2 text-xs sm:grid-cols-3">
                <div><dt className="text-muted-foreground">{t("Criada em")}</dt><dd>{formatDateTime(i.created_at)}</dd></div>
                <div><dt className="text-muted-foreground">{t("Último uso")}</dt><dd>{i.last_used_at ? formatDateTime(i.last_used_at) : t("Nunca")}</dd></div>
                <div><dt className="text-muted-foreground">{t("Permissões")}</dt><dd>{i.scopes.map((s) => t(SCOPE_LABEL[s] ?? s)).join(", ")}</dd></div>
              </dl>
              {q.data?.canManage && i.status !== "revoked" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => rotateM.mutate(i.id)} disabled={rotateM.isPending}>{t("Gerar nova chave")}</Button>
                  <Button size="sm" variant="outline" onClick={() => statusM.mutate({ id: i.id, status: i.status === "active" ? "suspended" : "active" })}>{i.status === "active" ? t("Suspender") : t("Reativar")}</Button>
                  <Button size="sm" variant="destructive" onClick={() => statusM.mutate({ id: i.id, status: "revoked" })}>{t("Revogar")}</Button>
                </div>
              )}
            </section>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KeyRow({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="flex-1 break-all text-xs">{value}</code>
      <Button size="sm" variant="outline" onClick={() => onCopy(value)}>Copiar</Button>
    </div>
  );
}
