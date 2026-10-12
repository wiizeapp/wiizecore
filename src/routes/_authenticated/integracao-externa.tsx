import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";
import { createExtIntegration, listExtIntegrations, rotateExtKey, setExtIntegrationStatus } from "@/lib/ext-integrations.functions";

export const Route = createFileRoute("/_authenticated/integracao-externa")({
  head: () => ({ meta: [{ title: "Integração Externa — WiizePay" }, { name: "description", content: "Conecte seu software à WiizePay com chaves de API." }] }),
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
  const [env, setEnv] = useState<"test" | "live">("test");
  const [scopes, setScopes] = useState<string[]>(["services:read", "customers:write", "charges:write", "charges:read", "checkout_sessions:write"]);
  const [revealed, setRevealed] = useState<{ secret: string; publicKey: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ext-integrations"] });
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : t("Algo deu errado."));

  const createM = useMutation({
    mutationFn: async () => { await step2fa(t); return create({ data: { name, environment: env, scopes } }); },
    onSuccess: (r) => { setRevealed(r); setName(""); void refresh(); }, onError: onErr,
  });
  const rotateM = useMutation({
    mutationFn: async (id: string) => { if (!window.confirm(t("A chave atual para de funcionar na hora. Continuar?"))) throw new Error(t("Cancelado.")); await step2fa(t); return rotate({ data: { id } }); },
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
  const items = q.data?.integrations ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("Integração Externa")} description={t("Conecte seu próprio software ou SaaS à WiizePay para criar cobranças e receber avisos de pagamento.")} />
      <Link to="/integracoes" className="text-xs text-muted-foreground hover:text-foreground">← {t("Integrações")}</Link>

      {revealed && (
        <section className="surface-panel space-y-3 border-primary/40 p-5">
          <h2 className="font-display text-base font-semibold">{t("Copie sua chave secreta agora")}</h2>
          <p className="text-xs text-muted-foreground">{t("Ela aparece só esta vez. Guarde apenas no servidor do seu sistema, nunca no navegador ou no código do site.")}</p>
          <KeyRow label={t("Chave secreta")} value={revealed.secret} onCopy={copy} />
          <KeyRow label={t("Chave pública")} value={revealed.publicKey} onCopy={copy} />
          <Button size="sm" variant="outline" onClick={() => setRevealed(null)}>{t("Já copiei")}</Button>
        </section>
      )}

      <Tabs defaultValue="credentials">
        <TabsList className="flex-wrap">
          <TabsTrigger value="credentials">{t("Credenciais")}</TabsTrigger>
          <TabsTrigger value="overview">{t("Visão geral")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="surface-panel space-y-3 p-5 text-sm">
          <p>{t("Com a Integração Externa, o seu sistema pede à WiizePay para criar clientes e cobranças, e a WiizePay avisa o seu sistema quando o pagamento acontece.")}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t("Chave pública: pode aparecer no site do seu sistema.")}</li>
            <li>{t("Chave secreta: fica só no servidor do seu sistema. Nunca no navegador.")}</li>
            <li>{t("Chaves de teste só funcionam no ambiente de testes; chaves de produção, só com dinheiro real.")}</li>
          </ul>
          <p className="text-xs text-muted-foreground">{t("Próximas etapas: endereços da API, checkout, avisos (webhooks), registros e guia com IA.")}</p>
        </TabsContent>

        <TabsContent value="credentials" className="space-y-4">
          {q.data?.canManage && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="font-display text-base font-semibold">{t("Nova integração")}</h2>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Nome do seu sistema")} maxLength={80} />
                <div className="flex gap-2">
                  {(["test", "live"] as const).map((e) => (
                    <Button key={e} type="button" size="sm" variant={env === e ? "default" : "outline"} onClick={() => setEnv(e)}>{e === "test" ? t("Teste") : t("Produção")}</Button>
                  ))}
                </div>
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
              <Button onClick={() => createM.mutate()} disabled={createM.isPending || name.trim().length < 2 || !scopes.length}>{createM.isPending ? t("Criando…") : t("Criar integração")}</Button>
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
