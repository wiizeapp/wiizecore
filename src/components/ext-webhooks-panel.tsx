import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";
import { createExtWebhook, listExtWebhooks, rotateExtWebhookSecret, sendExtWebhook, setExtWebhookStatus } from "@/lib/ext-webhooks.functions";

async function step2fa(t: (k: string) => string) {
  const mfa = await getMfaState();
  const code = mfa.factorId && !mfa.isAal2 ? window.prompt(t("Digite o código do seu app autenticador")) ?? "" : "";
  await ensureTwoFactor(code);
}

const DELIVERY_LABEL: Record<string, string> = { pending: "Aguardando", delivered: "Entregue", failed: "Falhou" };

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
  const [events, setEvents] = useState<string[]>(["payment.confirmed", "payment.overdue", "payment.cancelled", "payment.refunded", "subscription.renewed", "subscription.cancelled"]);
  const [secret, setSecret] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : t("Algo deu errado."));

  const createM = useMutation({ mutationFn: async () => { await step2fa(t); return create({ data: { integrationId, url, events } }); }, onSuccess: (r) => { setSecret(r.secret); setUrl(""); void refresh(); }, onError: onErr });
  const rotateM = useMutation({ mutationFn: async (id: string) => { await step2fa(t); return rotate({ data: { id } }); }, onSuccess: (r) => { setSecret(r.secret); }, onError: onErr });
  const statusM = useMutation({
    mutationFn: async (v: { id: string; action: "enable" | "disable" | "delete" }) => { if (v.action === "delete" && !window.confirm(t("Excluir este endereço?"))) throw new Error(t("Cancelado.")); await step2fa(t); return setStatus({ data: v }); },
    onSuccess: () => void refresh(), onError: onErr,
  });
  const sendM = useMutation({
    mutationFn: async (v: { endpointId: string; deliveryId?: string }) => { await step2fa(t); return send({ data: v }); },
    onSuccess: (r) => { if (r.ok) toast.success(`${t("Entregue")} (HTTP ${r.status})`); else toast.error(`${t("Falhou")}${r.status ? ` (HTTP ${r.status})` : ""}`); void refresh(); }, onError: onErr,
  });

  if (q.isLoading) return <div className="skeleton-shimmer h-24 rounded-xl" />;
  const d = q.data;
  return (
    <div className="space-y-4">
      {secret && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-muted/40 p-3">
          <p className="text-xs font-semibold">{t("Segredo de assinatura (aparece só esta vez)")}</p>
          <code className="block break-all text-xs">{secret}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(secret); toast.success(t("Copiado.")); }}>{t("Copiar")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>{t("Já copiei")}</Button>
          </div>
        </div>
      )}
      {canManage && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-sistema.com/webhooks/wiizepay" />
          <div className="flex flex-wrap gap-2">
            {(d?.allEvents ?? []).map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[11px]">
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents((p) => (e.target.checked ? [...p, ev] : p.filter((x) => x !== ev)))} />{ev}
              </label>
            ))}
          </div>
          <Button size="sm" onClick={() => createM.mutate()} disabled={createM.isPending || !url.startsWith("https://") || !events.length}>{t("Adicionar endereço")}</Button>
        </div>
      )}
      {(d?.endpoints ?? []).length === 0 ? <p className="text-xs text-muted-foreground">{t("Nenhum endereço de aviso cadastrado.")}</p> : d!.endpoints.map((ep) => (
        <div key={ep.id} className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="break-all text-xs">{ep.url}</code>
            <Badge variant={ep.status === "active" ? "default" : "secondary"}>{ep.status === "active" ? t("Ativa") : t("Pausado")}</Badge>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">{ep.events.join(", ")}</p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => sendM.mutate({ endpointId: ep.id })} disabled={sendM.isPending || ep.status !== "active"}>{t("Enviar teste")}</Button>
              <Button size="sm" variant="outline" onClick={() => rotateM.mutate(ep.id)}>{t("Gerar novo segredo")}</Button>
              <Button size="sm" variant="outline" onClick={() => statusM.mutate({ id: ep.id, action: ep.status === "active" ? "disable" : "enable" })}>{ep.status === "active" ? t("Pausar") : t("Reativar")}</Button>
              <Button size="sm" variant="destructive" onClick={() => statusM.mutate({ id: ep.id, action: "delete" })}>{t("Excluir")}</Button>
            </div>
          )}
        </div>
      ))}
      {(d?.deliveries ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
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
                  <td className="p-2">{canManage && x.status !== "delivered" ? <button className="text-primary" onClick={() => sendM.mutate({ endpointId: x.endpoint_id, deliveryId: x.id })}>{t("Reenviar")}</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
