import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bot, Check, CheckCircle2, Circle, Copy, FlaskConical, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { DevEnv } from "@/lib/dev-environment";
import { AI_TOOLS, buildToolPrompt, EXT_API_BASE, EXT_DOCS_SNIPPETS, EXT_ENDPOINTS, EXT_EVENT_NAMES, type AiToolId } from "@/lib/ext-docs";
import { getPortalProgress, listPortalCharges, listPortalRequests, listPortalServices, simulatePortalCharge } from "@/lib/ext-portal.functions";
import type { SandboxAction } from "@/lib/ext-sandbox";

export const envLabel = (env: DevEnv) => (env === "test" ? "Sandbox — Testes" : "Produção — Operações reais");

async function copyText(v: string) {
  try { await navigator.clipboard.writeText(v); return true; } catch { return false; }
}

export function EnvBadge({ env }: { env: DevEnv }) {
  const { t } = useTranslation("ui");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${env === "test" ? "border-warning/50 bg-warning/10" : "border-primary/40 bg-primary/10 text-primary"}`}>
      {env === "test" ? <FlaskConical className="size-3" /> : <Radio className="size-3" />}{t(envLabel(env))}
    </span>
  );
}

export function Code({ children }: { children: string }) {
  const { t } = useTranslation("ui");
  const [ok, setOk] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 pr-16 text-[11.5px] leading-relaxed"><code>{children}</code></pre>
      <button type="button" className="absolute right-2 top-2 rounded border border-border bg-background px-2 py-0.5 text-[11px]" onClick={async () => { if (await copyText(children)) { setOk(true); setTimeout(() => setOk(false), 1500); } else toast.error(t("Não foi possível copiar.")); }}>{ok ? t("Copiado") : t("Copiar")}</button>
    </div>
  );
}

/** Prompts prontos: conteúdo integral copiado, gerado de uma única fonte. */
export function AiPromptCards({ env }: { env: DevEnv }) {
  const { t } = useTranslation("ui");
  const [copied, setCopied] = useState<AiToolId | null>(null);
  const copy = async (id: AiToolId) => {
    if (await copyText(buildToolPrompt(id, env))) { setCopied(id); toast.success(t("Prompt copiado")); setTimeout(() => setCopied(null), 2000); }
    else toast.error(t("Não foi possível copiar. Permita o acesso à área de transferência e tente de novo."));
  };
  return (
    <section className="surface-panel space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Bot className="size-4 text-primary" />{t("Integre a WiizeCore com inteligência artificial")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("Conecte sua aplicação à WiizeCore em minutos. Copie um prompt completo para sua ferramenta de desenvolvimento e implemente o fluxo de cobrança, checkout, assinaturas e webhooks com segurança.")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AI_TOOLS.map((tool) => (
          <div key={tool.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 font-display text-sm font-bold text-primary">{tool.name.slice(0, 1)}</span>
              <div><p className="text-sm font-semibold">{t(tool.name)}</p><p className="text-xs text-muted-foreground">{t(tool.hint)}</p></div>
            </div>
            <Button size="sm" variant={copied === tool.id ? "secondary" : "outline"} onClick={() => copy(tool.id)}>
              {copied === tool.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied === tool.id ? t("Prompt copiado") : t("Copiar prompt de integração")}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("Os prompts não contêm chaves. Eles usam somente os endpoints documentados nesta página.")}</p>
    </section>
  );
}

/** Roteiro de primeiros passos com progresso calculado pelo que realmente aconteceu. */
export function GettingStarted({ env, onGo }: { env: DevEnv; onGo: (tab: string) => void }) {
  const { t } = useTranslation("ui");
  const fn = useServerFn(getPortalProgress);
  const q = useQuery({ queryKey: ["ext-progress", env], queryFn: () => fn({ data: { environment: env } }) });
  const p = q.data;
  const steps: { done: boolean; title: string; text: string; tab: string }[] = [
    { done: Boolean(p?.integration), title: "Criar integração", text: "Dê um nome ao seu sistema SaaS.", tab: "keys" },
    { done: Boolean(p?.key), title: env === "test" ? "Gerar chave de teste" : "Gerar chave de produção", text: "A chave aparece uma única vez. Guarde no gerenciador de segredos do seu projeto.", tab: "keys" },
    { done: false, title: "Selecionar um serviço", text: "Use o ID de um serviço compatível com o checkout externo.", tab: "services" },
    { done: false, title: "Copiar o prompt", text: "Escolha sua ferramenta de desenvolvimento e cole o prompt.", tab: "overview" },
    { done: Boolean(p?.session && p?.paid && p?.delivered), title: "Testar checkout e webhook", text: "Crie a sessão, aprove o pagamento de teste e confirme o aviso.", tab: env === "test" ? "sandbox" : "charges" },
  ];
  const checks = [
    [Boolean(p?.session), "Sessão de checkout criada pela API"],
    [Boolean(p?.paid), env === "test" ? "Pagamento de teste aprovado" : "Pagamento confirmado pelo provedor"],
    [Boolean(p?.endpoint), "Endpoint de webhook cadastrado"],
    [Boolean(p?.delivered), "Webhook entregue com resposta 2xx"],
  ] as const;
  return (
    <div className="space-y-4">
      <ol className="grid gap-3 md:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="surface-panel flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">{s.done ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4" />}{t("Etapa")} {i + 1}</span>
            <p className="text-sm font-semibold">{t(s.title)}</p>
            <p className="flex-1 text-xs text-muted-foreground">{t(s.text)}</p>
            <Button size="sm" variant="ghost" className="justify-start px-0 text-primary" onClick={() => onGo(s.tab)}>{t("Abrir")} →</Button>
          </li>
        ))}
      </ol>
      <section className="surface-panel space-y-2 p-5">
        <h3 className="text-sm font-semibold">{t("Checklist de validação")}</h3>
        {q.isLoading ? <div className="skeleton-shimmer h-16 rounded-lg" /> : checks.map(([ok, label]) => (
          <p key={label} className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}{t(label)}</p>
        ))}
        <p className="text-[11px] text-muted-foreground">{t("A liberação de acesso no seu SaaS é confirmada pelo seu próprio sistema; esta lista mostra apenas o que a Wiize Core consegue verificar.")}</p>
      </section>
      <section className="surface-panel space-y-2 p-5">
        <h3 className="text-sm font-semibold">{t("Primeira chamada")}</h3>
        <Code>{EXT_DOCS_SNIPPETS.curl.replace("sk_test_...", env === "test" ? "sk_test_..." : "sk_live_...")}</Code>
      </section>
    </div>
  );
}

/** Referência gerada a partir dos endpoints reais. */
export function ApiReference() {
  const { t } = useTranslation("ui");
  return (
    <div className="space-y-4 text-sm">
      <section className="surface-panel space-y-2 p-5">
        <h3 className="font-semibold">{t("Introdução e autenticação")}</h3>
        <p className="text-muted-foreground">{t("Base da API")}: <code>{EXT_API_BASE}</code></p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("Envie Authorization: Bearer sk_test_… (testes) ou sk_live_… (produção) em toda chamada, sempre pelo servidor.")}</li>
          <li>{t("A chave de teste nunca acessa dados reais e a de produção nunca acessa dados de teste.")}</li>
          <li>{t("Cada endpoint exige escopos próprios; uma chave só de leitura não altera cobranças ou assinaturas.")}</li>
          <li>{t("Toda resposta traz request_id e o cabeçalho X-Request-Id para diagnóstico.")}</li>
          <li>{t("Criações exigem Idempotency-Key: repetir a mesma chave devolve o mesmo resultado.")}</li>
        </ul>
      </section>
      <section className="surface-panel space-y-3 p-5">
        <h3 className="font-semibold">{t("Endpoints disponíveis")}</h3>
        {EXT_ENDPOINTS.map((e) => (
          <div key={e.path + e.method} className="rounded-lg border border-border p-3">
            <p className="font-mono text-xs"><Badge variant={e.method === "GET" ? "secondary" : "default"} className="mr-2">{e.method}</Badge>{e.path}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(e.summary)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("Escopos")}: {e.scopes.join(", ")}</p>
          </div>
        ))}
      </section>
      <section className="surface-panel space-y-2 p-5"><h3 className="font-semibold">{t("Exemplo em Node.js")}</h3><Code>{EXT_DOCS_SNIPPETS.node}</Code><Code>{EXT_DOCS_SNIPPETS.response}</Code></section>
      <section className="surface-panel space-y-2 p-5">
        <h3 className="font-semibold">{t("Webhooks")}</h3>
        <p className="text-xs text-muted-foreground">{t("Assinatura: HMAC-SHA256 de \"t.corpo\" com o segredo do endpoint, janela de 5 minutos. Guarde event.id para ignorar repetidos; em caso de dúvida, consulte a cobrança pela API.")}</p>
        <Code>{EXT_DOCS_SNIPPETS.verify}</Code>
        <p className="text-xs text-muted-foreground">{t("Eventos")}: {EXT_EVENT_NAMES.join(", ")}</p>
      </section>
      <section className="surface-panel space-y-2 p-5">
        <h3 className="font-semibold">{t("Central do cliente")}</h3>
        <p className="text-xs text-muted-foreground">{t("A consulta da cobrança devolve portal_url. O cliente entra com e-mail e CPF/CNPJ e vê somente as próprias cobranças, recibos, notas, contratos e documentos.")}</p>
      </section>
      <section className="surface-panel space-y-2 p-5"><h3 className="font-semibold">{t("Erros")}</h3><Code>{EXT_DOCS_SNIPPETS.errors}</Code></section>
    </div>
  );
}

const BLOCKER: Record<string, string> = { inactive: "Serviço inativo", custom_amount: "Valor livre não é aceito pela API", no_amount: "Sem valor definido", no_methods: "Sem forma de pagamento" };
const TYPE: Record<string, string> = { one_time: "Pagamento único", installment: "Parcelado", recurring: "Assinatura recorrente" };

export function ServicesTab() {
  const { t } = useTranslation("ui");
  const fn = useServerFn(listPortalServices);
  const q = useQuery({ queryKey: ["ext-services"], queryFn: () => fn() });
  const [copied, setCopied] = useState<string | null>(null);
  if (q.isLoading) return <div className="skeleton-shimmer h-28 rounded-xl" />;
  if (!q.data?.length) return <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Cadastre um serviço para usar no checkout.")}</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("O preço sempre vem do serviço. O sistema integrado não consegue alterar o valor pela API.")}</p>
      <div className="surface-panel divide-y divide-border">
        {q.data.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
            <p className="min-w-40 flex-1 font-medium">{s.name}</p>
            <span className="tabular-nums">{formatBRL(Number(s.amount))}</span>
            <span className="text-xs text-muted-foreground">{t(TYPE[s.type] ?? s.type)}{s.frequency ? ` · ${s.frequency}` : ""}</span>
            {s.blocker ? <Badge variant="secondary">{t(BLOCKER[s.blocker] ?? s.blocker)}</Badge> : <Badge>{t("Compatível")}</Badge>}
            <Button size="sm" variant="outline" disabled={Boolean(s.blocker)} onClick={async () => { if (await copyText(s.id)) { setCopied(s.id); toast.success(t("ID copiado")); } }}>{copied === s.id ? t("Copiado") : t("Copiar ID")}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

const CHARGE_STATUS: Record<string, string> = {
  created: "Criada", awaiting_payment: "Aguardando pagamento", pending: "Pendente", processing: "Processando", paid: "Pago", failed: "Recusado",
  overdue: "Vencida", cancelled: "Cancelada", refunded: "Reembolsada", in_analysis: "Em análise",
};
const SIM: { action: SandboxAction; label: string }[] = [
  { action: "approve", label: "Aprovar" }, { action: "pending", label: "Pendente" }, { action: "decline", label: "Recusar" },
  { action: "overdue", label: "Vencer" }, { action: "cancel", label: "Cancelar" }, { action: "refund", label: "Reembolsar" }, { action: "renew", label: "Abrir novo ciclo" },
];

export function ChargesTab({ env, recurringOnly = false, simulate = false }: { env: DevEnv; recurringOnly?: boolean; simulate?: boolean }) {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const fn = useServerFn(listPortalCharges);
  const sim = useServerFn(simulatePortalCharge);
  const key = ["ext-charges", env, recurringOnly];
  const q = useQuery({ queryKey: key, queryFn: () => fn({ data: { environment: env, recurringOnly } }) });
  const [open, setOpen] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (v: { id: string; action: SandboxAction }) => sim({ data: v }),
    onSuccess: (r) => { toast.success(`${t(r.label)} · ${r.event}`); void qc.invalidateQueries({ queryKey: ["ext-charges"] }); void qc.invalidateQueries({ queryKey: ["ext-progress"] }); },
    onError: (e) => toast.error(e instanceof Error ? t(e.message) : t("Algo deu errado.")),
  });
  if (q.isLoading) return <div className="skeleton-shimmer h-28 rounded-xl" />;
  const rows = q.data?.rows ?? [];
  return (
    <div className="space-y-3">
      {env === "test" ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">{t("Registros de teste do simulador interno. Nada aqui é enviado ao provedor, gera nota fiscal ou movimenta dinheiro.")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("Cobranças reais criadas pela API. O status só muda quando o provedor de pagamentos confirma.")}</p>
      )}
      {!rows.length ? <p className="surface-panel p-5 text-sm text-muted-foreground">{recurringOnly ? t("Nenhuma assinatura criada pela API neste ambiente.") : t("Nenhuma cobrança criada pela API neste ambiente.")}</p> : (
        <div className="surface-panel divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Badge variant={r.status === "paid" ? "default" : ["failed", "overdue", "cancelled"].includes(r.status) ? "destructive" : "secondary"}>{r.sandbox && r.status === "paid" ? t("Pagamento de teste aprovado") : t(CHARGE_STATUS[r.status] ?? r.status)}</Badge>
                <span className="font-medium">{r.service}</span>
                <span className="tabular-nums">{formatBRL(Number(r.amount))}</span>
                <span className="text-xs text-muted-foreground">{r.customer}</span>
                <span className="text-xs text-muted-foreground">{t(TYPE[r.type] ?? r.type)}{r.type === "recurring" ? ` · ${t("ciclos pagos")}: ${r.cyclesPaid}` : ""}</span>
                {r.subscriptionStatus === "cancelled" && <Badge variant="secondary">{t("Assinatura cancelada")}</Badge>}
                <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                <code className="text-[11px] text-muted-foreground">{r.id}</code>
                {r.history.length > 0 && <button className="text-xs text-primary" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? t("Ocultar histórico") : t("Histórico")}</button>}
              </div>
              {simulate && r.sandbox && (
                <div className="flex flex-wrap gap-1.5">
                  {SIM.filter((s) => s.action !== "renew" || r.type === "recurring").map((s) => (
                    <Button key={s.action} size="sm" variant="outline" className="h-7 text-xs" disabled={m.isPending} onClick={() => m.mutate({ id: r.id, action: s.action })}>{t(s.label)}</Button>
                  ))}
                </div>
              )}
              {open === r.id && (
                <ul className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                  {r.history.map((h, i) => <li key={i} className="flex flex-wrap gap-3"><span className="text-muted-foreground">{formatDateTime(h.at)}</span><span>{t(h.label)}</span>{h.event && <code>{h.event}</code>}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestLogs({ env }: { env: DevEnv }) {
  const { t } = useTranslation("ui");
  const fn = useServerFn(listPortalRequests);
  const q = useQuery({ queryKey: ["ext-requests", env], queryFn: () => fn({ data: { environment: env } }) });
  if (q.isLoading) return <div className="skeleton-shimmer h-28 rounded-xl" />;
  if (!q.data?.length) return <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Nenhuma chamada à API registrada neste ambiente.")}</p>;
  return (
    <div className="surface-panel divide-y divide-border">
      {q.data.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
          <Badge variant={r.status >= 500 ? "destructive" : r.status >= 400 ? "secondary" : "default"}>HTTP {r.status}</Badge>
          <code>{r.method} {r.path}</code>
          <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
          <span className="text-muted-foreground">{r.duration_ms} ms</span>
          <span className="text-muted-foreground">{t("Autenticação")}: {r.auth_result}</span>
          {r.error_code && <span className="text-destructive">{r.error_code}</span>}
          <code className="text-muted-foreground">{r.request_id}</code>
        </div>
      ))}
    </div>
  );
}
