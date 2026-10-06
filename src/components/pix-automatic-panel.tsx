import { confirmAction } from "@/components/confirm-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listPixAutomatic, cancelPixAutomatic } from "@/lib/pix-automatic.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { useTranslation } from "react-i18next";

const STATUS: Record<string, string> = { pending: "Aguardando autorização", active: "Ativa", refused: "Recusada", cancelled: "Cancelada", expired: "Expirada" };

/** Lista das autorizações de Pix Automático (criação acontece em "Nova cobrança"). */
export function PixAutomaticPanel() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const list = useServerFn(listPixAutomatic);
  const cancel = useServerFn(cancelPixAutomatic);
  const { data } = useQuery({ queryKey: ["pix-automatic"], queryFn: () => list() });
  const cancelM = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pix-automatic"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data?.length) return null;

  return (
    <div className="surface-panel mt-6 space-y-3 p-4">
      <div>
        <h2 className="font-medium">{ui("Pix Automático")}</h2>
        <p className="text-sm text-muted-foreground">Autorizações enviadas aos seus clientes. Quando autorizadas, as cobranças são geradas e pagas sozinhas.</p>
      </div>
      {data.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
          <div>{a.customer} · {formatBRL(a.value)} · início {formatDate(a.startOn)}</div>
          <div className="flex items-center gap-2">
            <Badge variant={a.status === "active" ? "default" : "outline"}>{STATUS[a.status] ?? a.status}</Badge>
            {["pending", "active"].includes(a.status) ? (
              <Button size="sm" variant="ghost" onClick={() => void confirmAction({ title: "Cancelar esta autorização?", description: "As próximas cobranças automáticas deste cliente deixarão de ser feitas.", confirmText: "Cancelar autorização", destructive: true }).then((ok) => ok && cancelM.mutate(a.id))}>Cancelar</Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
