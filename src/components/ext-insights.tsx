import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/format";
import { getExtOverview, listExtLogs } from "@/lib/ext-insights.functions";
import { buildExtAiPrompt, EXT_API_BASE, EXT_DOCS_SNIPPETS, EXT_EVENT_NAMES as EXT_EVENTS } from "@/lib/ext-docs";

export function ExtOverview() {
  const { t } = useTranslation("ui");
  const fn = useServerFn(getExtOverview);
  const q = useQuery({ queryKey: ["ext-overview"], queryFn: () => fn() });
  if (q.isLoading) return <div className="skeleton-shimmer h-28 rounded-xl" />;
  if (q.error || !q.data) return <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Não foi possível carregar os números.")}</p>;
  const d = q.data;
  const cards = [
    [t("Cobranças criadas pela API"), String(d.sessions)],
    [t("Parcelas pagas"), String(d.paidCount)],
    [t("Recebido"), formatBRL(d.received)],
    [t("A receber"), formatBRL(d.receivable)],
    [t("Em atraso"), `${formatBRL(d.overdue)} · ${d.overdueCount}`],
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([l, v]) => (
          <div key={l} className="surface-panel p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 font-display text-lg font-semibold">{v}</p></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("Última cobrança pela API")}: {d.lastActivity ? formatDateTime(d.lastActivity) : t("Nunca")}</p>
      {d.failedDeliveries > 0 && <p className="surface-panel border-destructive/40 p-4 text-sm text-destructive">{t("Há avisos que não chegaram ao seu sistema. Veja em Registros.")} ({d.failedDeliveries})</p>}
    </div>
  );
}

const STATUS: Record<string, string> = { pending: "Na fila", delivered: "Entregue", failed: "Falhou" };

export function ExtLogs() {
  const { t } = useTranslation("ui");
  const fn = useServerFn(listExtLogs);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<"all" | "pending" | "delivered" | "failed">("all");
  const [type, setType] = useState("all");
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["ext-logs", page, status, type, days], queryFn: () => fn({ data: { page, status, type, days } }) });
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(0); }}>
          {[1, 7, 30, 90].map((n) => <option key={n} value={n}>{t("Últimos")} {n} {t("dias")}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}>
          <option value="all">{t("Todas as situações")}</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
        <select className={sel} value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}>
          <option value="all">{t("Todos os eventos")}</option>
          {[...EXT_EVENTS, "webhook.test"].map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      {q.isLoading ? <div className="skeleton-shimmer h-28 rounded-xl" /> : !q.data?.rows.length ? (
        <p className="surface-panel p-5 text-sm text-muted-foreground">{t("Nenhum registro no período.")}</p>
      ) : (
        <div className="surface-panel divide-y divide-border">
          {q.data.rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
              <Badge variant={r.status === "failed" ? "destructive" : r.status === "delivered" ? "default" : "secondary"}>{t(STATUS[r.status] ?? r.status)}</Badge>
              <code>{r.type}</code>
              <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
              <span className="text-muted-foreground">{t("Tentativas")}: {r.attempts}{r.last_status ? ` · HTTP ${r.last_status}` : ""}</span>
              {r.charge_group_id && <code className="text-muted-foreground">{r.charge_group_id.slice(0, 8)}</code>}
              {r.last_error && <span className="w-full text-destructive">{r.last_error}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("Anterior")}</Button>
        <span>{page + 1} / {pages}</span>
        <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t("Próxima")}</Button>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  const { t } = useTranslation("ui");
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed"><code>{children}</code></pre>
      <Button size="sm" variant="outline" className="absolute right-2 top-2 h-7" onClick={() => { void navigator.clipboard.writeText(children); toast.success(t("Copiado.")); }}>{t("Copiar")}</Button>
    </div>
  );
}

export function ExtDocs() {
  const { t } = useTranslation("ui");
  return (
    <div className="surface-panel space-y-5 p-5 text-sm">
      <section className="space-y-2">
        <h3 className="font-display font-semibold">{t("1. Criar uma cobrança e abrir o checkout")}</h3>
        <p className="text-muted-foreground">{t("Chame do servidor do seu sistema, com a chave secreta e uma chave de repetição única por pedido.")}</p>
        <Code>{EXT_DOCS_SNIPPETS.curl}</Code>
        <Code>{EXT_DOCS_SNIPPETS.node}</Code>
      </section>
      <section className="space-y-2">
        <h3 className="font-display font-semibold">{t("2. Resposta")}</h3>
        <Code>{EXT_DOCS_SNIPPETS.response}</Code>
        <p className="text-muted-foreground">{t("Mande o comprador para o endereço em url. Repetir o pedido com a mesma chave de repetição devolve a mesma cobrança, sem duplicar.")}</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-display font-semibold">{t("3. Receber avisos (webhooks)")}</h3>
        <p className="text-muted-foreground">{t("Confira a assinatura antes de confiar no aviso e ignore avisos com id repetido.")}</p>
        <Code>{EXT_DOCS_SNIPPETS.verify}</Code>
        <p className="text-muted-foreground">{t("Eventos")}: {EXT_EVENTS.join(", ")}</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-display font-semibold">{t("4. Erros")}</h3>
        <Code>{EXT_DOCS_SNIPPETS.errors}</Code>
      </section>
      <section className="space-y-1">
        <h3 className="font-display font-semibold">{t("Checklist de segurança")}</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("A chave secreta fica só no servidor; nunca no navegador ou no aplicativo.")}</li>
          <li>{t("Só considere pago quando chegar o aviso payment.confirmed assinado. O retorno ao site não confirma pagamento.")}</li>
          <li>{t("Use chaves de teste até tudo funcionar, depois troque pelas de produção.")}</li>
          <li>{t("Se uma chave vazar, gere uma nova na aba Credenciais na hora.")}</li>
          <li>{t("Cartão é digitado sempre no checkout da Wiize Recebe; seu sistema nunca recebe dados do cartão.")}</li>
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">{t("Endereço base")}: <code>{EXT_API_BASE}</code></p>
    </div>
  );
}

export function ExtAiGuide() {
  const { t } = useTranslation("ui");
  const [f, setF] = useState({ saas: "", language: "Node.js / TypeScript", database: "PostgreSQL", hosting: "", services: "", methods: "Pix, boleto e cartão" });
  const prompt = buildExtAiPrompt(f);
  const field = (k: keyof typeof f, label: string) => (
    <label className="space-y-1 text-xs"><span className="text-muted-foreground">{label}</span><Input value={f[k]} maxLength={200} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} /></label>
  );
  return (
    <div className="surface-panel space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{t("Preencha e copie o texto. Cole numa IA de programação para ela montar a integração no seu sistema. O texto não contém nenhuma chave.")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("saas", t("Nome do seu sistema"))}
        {field("language", t("Linguagem"))}
        {field("database", t("Banco de dados"))}
        {field("hosting", t("Hospedagem"))}
        {field("services", t("O que você vende"))}
        {field("methods", t("Formas de pagamento"))}
      </div>
      <Code>{prompt}</Code>
    </div>
  );
}
