import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import wiizeLogo from "@/assets/integrations/wiize.png";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectWiizeCrm, getIntegrations } from "@/lib/integrations.functions";

const SCOPE_LABEL: Record<string, string> = {
  "charges:read": "Ver cobranças", "charges:write": "Criar cobranças", "charges:cancel": "Cancelar cobranças",
  "customers:read": "Ver clientes", "customers:write": "Cadastrar clientes", "webhooks:read": "Receber avisos de pagamento",
};

export function IntegrationsCard() {
  const qc = useQueryClient();
  const fetchIt = useServerFn(getIntegrations);
  const disconnect = useServerFn(disconnectWiizeCrm);
  const q = useQuery({ queryKey: ["integrations"], queryFn: () => fetchIt() });
  const m = useMutation({
    mutationFn: async () => {
      if (!window.confirm("Cancelar a conexão com o Wiize? O Wiize perde o acesso às cobranças desta empresa na hora.")) throw new Error("cancel");
      return disconnect();
    },
    onSuccess: () => { toast.success("Conexão com o Wiize cancelada."); void qc.invalidateQueries({ queryKey: ["integrations"] }); },
    onError: (e) => { if (e instanceof Error && e.message !== "cancel") toast.error(e.message); },
  });
  const w = q.data?.wiize;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

  return (
    <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">Integrações</h2>
        <p className="mt-1 text-xs text-muted-foreground">Sistemas que você autorizou a usar sua conta Wiize Recebe.</p>
      </div>
      <div className="min-w-0">
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={wiizeLogo} alt="Wiize" className="size-10 rounded-lg" />
              <div>
                <p className="text-sm font-semibold">Wiize CRM</p>
                <p className="text-xs text-muted-foreground">Cria cobranças e acompanha pagamentos direto do Wiize.</p>
              </div>
            </div>
            {q.isLoading ? <span className="skeleton-shimmer h-6 w-20 rounded-full" /> : (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${w?.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                {w?.active ? "Ativo" : "Não conectado"}
              </span>
            )}
          </div>
          {w?.active ? (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Conectado desde</dt><dd className="font-medium">{fmt(w.connectedAt)}</dd></div>
                <div><dt className="text-muted-foreground">Última renovação de acesso</dt><dd className="font-medium">{fmt(w.lastActivity)}</dd></div>
              </dl>
              {w.scopes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {w.scopes.map((s) => <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-xs">{SCOPE_LABEL[s] ?? s}</span>)}
                </div>
              )}
              {q.data?.canManage ? (
                <Button variant="destructive" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
                  {m.isPending ? "Cancelando…" : "Cancelar conexão"}
                </Button>
              ) : <p className="text-xs text-muted-foreground">Somente o dono ou administrador pode cancelar a conexão.</p>}
            </div>
          ) : !q.isLoading && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              <p className="font-semibold text-foreground">A conexão é feita pelo Wiize</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>Entre na sua conta do Wiize.</li>
                <li>Vá em Integrações e clique em “Conectar Wiize Recebe”.</li>
                <li>Você volta para cá só para confirmar o acesso.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
