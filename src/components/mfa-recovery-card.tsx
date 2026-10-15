import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMyRecoveryRequest, requestAdminRecovery } from "@/lib/mfa-recovery.functions";
import { formatDate } from "@/lib/format";

/** "Não tenho acesso ao meu autenticador" — recuperação segura, nunca um simples "desativar". */
export function MfaRecoveryCard() {
  const qc = useQueryClient();
  const askAdmin = useServerFn(requestAdminRecovery);
  const getReq = useServerFn(getMyRecoveryRequest);
  const { data: req } = useQuery({ queryKey: ["mfa-recovery-request"], queryFn: () => getReq() });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setOpen(false);
      void qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  if (req?.status === "pending") {
    return (
      <section className="surface-panel p-5 text-sm">
        <p className="font-medium">Pedido de recuperação em análise</p>
        <p className="mt-1 text-muted-foreground">Enviado em {formatDate(req.created_at)}. A equipe Wiize Recebe vai avisar você por aqui.</p>
      </section>
    );
  }

  return (
    <section className="surface-panel p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold tracking-tight">Não tenho acesso ao meu autenticador</h2>
          <p className="mt-1 text-sm text-muted-foreground">O código reserva pode confirmar uma troca de senha ou a desativação do 2FA. Se também perdeu esse código, peça uma análise da equipe Wiize Recebe.</p>
          {!open ? (
            <Button className="mt-4" variant="outline" size="sm" onClick={() => setOpen(true)}>Recuperar acesso</Button>
          ) : (
            <div className="mt-4 space-y-2">
              <Textarea placeholder="Conte o que aconteceu (ex.: perdi o celular em 10/09)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button disabled={busy || reason.trim().length < 10} onClick={() => run(() => askAdmin({ data: { reason } }), "Pedido enviado para análise.")}>Enviar para análise</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
