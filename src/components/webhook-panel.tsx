import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listWebhookEvents, reprocessWebhookEvent, syncAsaasWebhook } from "@/lib/charges.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

const statusLabels: Record<string, string> = {
  received: "Recebido",
  processing: "Processando",
  processed: "Processado",
  failed: "Falhou",
  discarded: "Ignorado",
};

export function WebhookPanel({ webhookUrl }: { webhookUrl: string | null }) {
  const queryClient = useQueryClient();
  const sync = useServerFn(syncAsaasWebhook);
  const list = useServerFn(listWebhookEvents);
  const reprocess = useServerFn(reprocessWebhookEvent);

  const { data: events } = useQuery({ queryKey: ["webhook-events"], queryFn: () => list() });

  const syncMutation = useMutation({
    mutationFn: () => sync(),
    onSuccess: () => {
      toast.success("Avisos automáticos de pagamento ativados.");
      void queryClient.invalidateQueries({ queryKey: ["provider"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reprocessMutation = useMutation({
    mutationFn: (eventId: string) => reprocess({ data: { eventId } }),
    onSuccess: (r) => {
      toast[r.status === "processed" ? "success" : "error"](
        r.status === "processed" ? "Evento processado." : "O evento ainda não pôde ser processado.",
      );
      void queryClient.invalidateQueries({ queryKey: ["webhook-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Avisos automáticos de pagamento</h3>
          <p className="text-muted-foreground">
            {webhookUrl ? `Ativo em ${webhookUrl}` : "Ainda não ativado. Sem isso, os pagamentos não são confirmados."}
          </p>
        </div>
        <Button variant={webhookUrl ? "outline" : "default"} onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          {webhookUrl ? "Registrar novamente" : "Ativar avisos"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {events && events.length > 0 ? (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div>
                  <p className="font-mono text-xs">{e.event_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.received_at)}
                    {e.error_message ? ` · ${e.error_message}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={e.processing_status === "failed" ? "destructive" : "secondary"}>
                    {statusLabels[e.processing_status] ?? e.processing_status}
                  </Badge>
                  {e.processing_status === "failed" || e.processing_status === "received" ? (
                    <Button size="sm" variant="outline" onClick={() => reprocessMutation.mutate(e.id)} disabled={reprocessMutation.isPending}>
                      Reprocessar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-muted-foreground">Nenhum aviso recebido ainda.</p>
        )}
      </div>
    </div>
  );
}
