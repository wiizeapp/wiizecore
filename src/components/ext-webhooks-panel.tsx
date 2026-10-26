import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Copy, Pause, Play, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { SecureActionDialog } from "@/components/developer/secure-action-dialog";
import { createExtWebhook, listExtWebhooks, rotateExtWebhookSecret, sendExtWebhook, setExtWebhookStatus } from "@/lib/ext-webhooks.functions";

const DELIVERY_LABEL: Record<string, string> = { pending: "Aguardando", delivered: "Entregue", failed: "Falhou" };
type Action = { kind: "create" } | { kind: "rotate"; id: string } | { kind: "delete"; id: string } | null;

export function ExtWebhooksPanel({ integrationId, canManage }: { integrationId: string; canManage: boolean }) {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const list = useServerFn(listExtWebhooks);
  const create = useServerFn(createExtWebhook);
  const rotate = useServerFn(rotateExtWebhookSecret);
  const setStatus = useServerFn(setExtWebhookStatus);
  const send = useServerFn(sendExtWebhook);
  const key = ["ext-webhooks", integrationId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { integrationId } }) });
  const [url, setUrl] = useState("");
  const [allEvents, setAllEvents] = useState(true);
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const d = q.data;
  const chosen = allEvents ? [...(d?.allEvents ?? [])] : events;

  const quick = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : t("Algo deu errado.")); } finally { setBusyId(null); void refresh(); }
  };
  const test = (endpointId: string, deliveryId?: string) => quick(deliveryId ?? endpointId, async () => {
    const r = await send({ data: { endpointId, deliveryId } });
    if (r.ok) toast.success(`${t("Entregue")} (HTTP ${r.status})`); else toast.error(`${t("Falhou")}${r.status ? ` (HTTP ${r.status})` : ""}`);
  });

  if (q.isLoading) return <div className="skeleton-shimmer h-20 rounded-xl" />;
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
        {t("Atenção: no seu sistema, libere o acesso somente depois de verificar a assinatura do aviso com o segredo. Sem essa verificação, qualquer pessoa que descobrir o endereço pode fingir um pagamento aprovado e usar o seu sistema sem pagar.")}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{(d?.endpoints ?? []).length} {t("endereço(s)")}</p>
        {canManage && <Button size="sm" variant="outline" onClick={() => setAction({ kind: "create" })}><Plus className="size-4" />{t("Adicionar endereço")}</Button>}
      </div>

      {secret && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-semibold">{t("Segredo de assinatura (aparece só esta vez)")}</p>
          <code className="block break-all rounded bg-background p-2 text-xs">{secret}</code>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { void navigator.clipboard.writeText(secret); toast.success(t("Copiado.")); }}><Copy className="size-3.5" />{t("Copiar")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>{t("Já copiei")}</Button>
          </div>
        </div>
      )}

      {(d?.endpoints ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t("Nenhum endereço de aviso cadastrado.")}</p>
      ) : d!.endpoints.map((ep) => (
        <div key={ep.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${ep.status === "active" ? "bg-primary" : "bg-muted-foreground"}`} />
              <code className="truncate text-xs">{ep.url}</code>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{ep.events.length === (d?.allEvents.length ?? 0) ? t("Todos os eventos") : `${ep.events.length} ${t("eventos")}`} · {ep.status === "active" ? t("Ativo") : t("Pausado")}</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" title={t("Enviar teste")} onClick={() => void test(ep.id)} disabled={busyId === ep.id || ep.status !== "active"}><Send className="size-4" /></Button>
              <Button size="sm" variant="ghost" title={t("Gerar novo segredo")} onClick={() => setAction({ kind: "rotate", id: ep.id })}><RefreshCw className="size-4" /></Button>
              <Button size="sm" variant="ghost" title={ep.status === "active" ? t("Pausar") : t("Reativar")} onClick={() => void quick(ep.id, () => setStatus({ data: { id: ep.id, action: ep.status === "active" ? "disable" : "enable" } }))}>{ep.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
              <Button size="sm" variant="ghost" title={t("Excluir")} onClick={() => setAction({ kind: "delete", id: ep.id })}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          )}
        </div>
      ))}

      {(d?.deliveries ?? []).length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">{t("Últimas entregas")} ({d!.deliveries.length})</summary>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="p-2">{t("Evento")}</th><th className="p-2">{t("Situação")}</th><th className="p-2">HTTP</th><th className="p-2">{t("Tentativas")}</th><th className="p-2">{t("Data")}</th><th className="p-2" /></tr></thead>
              <tbody>
                {d!.deliveries.map((x) => (
                  <tr key={x.id} className="border-t border-border">
                    <td className="p-2 font-mono">{x.type}</td>
                    <td className="p-2">{t(DELIVERY_LABEL[x.status] ?? x.status)}{x.last_error ? ` · ${x.last_error}` : ""}</td>
                    <td className="p-2">{x.last_status ?? "—"}</td>
                    <td className="p-2">{x.attempts}</td>
                    <td className="p-2">{formatDateTime(x.created_at)}</td>
                    <td className="p-2">{canManage && x.status !== "delivered" ? <button className="text-primary" onClick={() => void test(x.endpoint_id, x.id)}>{t("Reenviar")}</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <SecureActionDialog
        open={action?.kind === "create"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Novo endereço de webhook")} description={t("A WiizePay vai avisar este endereço quando uma cobrança mudar.")}
        confirmLabel={t("Criar webhook")} needsPassword canConfirm={url.startsWith("https://") && chosen.length > 0}
        onConfirm={async ({ password }) => { const r = await create({ data: { integrationId, url, events: chosen, financialPassword: password } }); setSecret(r.secret); setUrl(""); toast.success(t("Webhook criado.")); void refresh(); }}
      >
        <div className="space-y-1.5">
          <label htmlFor="wh-url" className="text-sm font-medium">{t("Endereço (https)")}</label>
          <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://seu-sistema.com/webhooks/wiize" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} />{t("Receber todos os eventos (recomendado)")}</label>
        {!allEvents && (
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {(d?.allEvents ?? []).map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[11px]">
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents((p) => (e.target.checked ? [...p, ev] : p.filter((x) => x !== ev)))} />{ev}
              </label>
            ))}
          </div>
        )}
      </SecureActionDialog>

      <SecureActionDialog
        open={action?.kind === "rotate"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Gerar novo segredo")} description={t("O segredo atual para de valer na hora. Atualize o seu sistema com o novo.")}
        confirmLabel={t("Gerar novo segredo")} needsPassword
        onConfirm={async ({ password }) => { if (action?.kind !== "rotate") return; const r = await rotate({ data: { id: action.id, financialPassword: password } }); setSecret(r.secret); }}
      />
      <SecureActionDialog
        open={action?.kind === "delete"} onOpenChange={(v) => !v && setAction(null)}
        title={t("Excluir este endereço?")} description={t("Os avisos param de ser enviados para ele.")} confirmLabel={t("Excluir")} destructive
        onConfirm={async () => { if (action?.kind !== "delete") return; await setStatus({ data: { id: action.id, action: "delete" } }); void refresh(); }}
      />
    </div>
  );
}
