import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectDrive, getDriveStatus, startDriveConnect } from "@/lib/google-drive.functions";
import { formatDateTime } from "@/lib/format";
import driveLogo from "@/assets/integrations/google-drive.png";

/** Card do Google Drive: cada empresa conecta o próprio Drive para guardar os arquivos dos contratos. */
export function DriveIntegrationCard() {
  const status = useServerFn(getDriveStatus);
  const start = useServerFn(startDriveConnect);
  const disc = useServerFn(disconnectDrive);
  const q = useQuery({ queryKey: ["drive-status"], queryFn: () => status() });
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string })?.type !== "wiizepay-drive") return;
      void q.refetch();
      if (!(e.data as { ok?: boolean }).ok) setWaiting(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [q]);

  // O Google corta a comunicação com a janela; então conferimos o status a cada 2s enquanto espera.
  const popupRef = useRef<Window | null>(null);
  useEffect(() => {
    if (!waiting) return;
    let closedTicks = 0;
    const started = Date.now();
    const id = window.setInterval(async () => {
      const r = await q.refetch();
      if (r.data?.connected) { setWaiting(false); toast.success("Google Drive conectado."); try { popupRef.current?.close(); } catch { /* */ } return; }
      if (popupRef.current?.closed) closedTicks++;
      if (closedTicks >= 2 || Date.now() - started > 5 * 60_000) { setWaiting(false); if (closedTicks >= 2) toast.info("Conexão não concluída. Tente novamente."); }
    }, 2000);
    return () => window.clearInterval(id);
  }, [waiting]);

  const connect = async () => {
    const w = window.open("about:blank", "wiizepay-drive", "width=520,height=660");
    popupRef.current = w;
    setWaiting(true);
    try { const { url } = await start({ data: { origin: window.location.origin } }); if (w) w.location.href = url; else window.location.href = url; }
    catch (e) { w?.close(); setWaiting(false); toast.error((e as Error).message); }
  };
  const discM = useMutation({ mutationFn: () => disc(), onSuccess: () => { toast.success("Google Drive desconectado."); void q.refetch(); }, onError: (e: Error) => toast.error(e.message) });
  const d = q.data;

  return (
    <section className="surface-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <img src={driveLogo} alt="Google Drive" className="size-12 shrink-0 rounded-lg bg-white p-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold tracking-tight">Google Drive</h2>
            {q.isLoading ? <span className="skeleton-shimmer h-5 w-20 rounded-full" /> : d?.connected ? (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Conectado</span>
            ) : d && !d.configured ? (
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-warning">Aguardando configuração</span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Não conectado</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Os arquivos dos contratos (original, assinado e comprovante) ficam no Drive da sua empresa, na pasta “WiizePay – Contratos”. A WiizePay só acessa os arquivos que ela mesma cria.</p>
          {d?.connected ? <p className="mt-2 text-xs">Conta: <span className="font-medium">{d.email ?? "—"}</span>{d.since ? ` · desde ${formatDateTime(d.since)}` : ""}</p> : null}
        </div>
        {d?.canManage && d.configured ? (
          d.connected ? (
            <Button variant="outline" onClick={() => discM.mutate()} disabled={discM.isPending}>{discM.isPending ? "Desconectando..." : "Desconectar"}</Button>
          ) : (
            <Button onClick={() => void connect()} disabled={waiting}>{waiting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Aguardando...</> : "Conectar"}</Button>
          )
        ) : null}
      </div>
    </section>
  );
}
