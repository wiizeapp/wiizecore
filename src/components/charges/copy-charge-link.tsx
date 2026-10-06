import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getChargeLink } from "@/lib/charges.functions";
import { Button } from "@/components/ui/button";

async function copyText(url: string) {
  try { await navigator.clipboard.writeText(url); toast.success("Link da cobrança copiado."); }
  catch { window.prompt("Copie o link da cobrança:", url); }
}

/** Botão compacto da tabela: busca o link fixo e copia. */
export function CopyChargeLinkButton({ chargeGroupId }: { chargeGroupId: string }) {
  const fetchLink = useServerFn(getChargeLink);
  const { t: ui } = useTranslation("ui");
  const [done, setDone] = useState(false);
  const m = useMutation({
    mutationFn: () => fetchLink({ data: { chargeGroupId } }),
    onSuccess: async ({ token }) => {
      await copyText(`${window.location.origin}/pagar/${token}`);
      setDone(true); setTimeout(() => setDone(false), 1800);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button type="button" disabled={m.isPending} onClick={() => m.mutate()} aria-label="Copiar link da cobrança"
      className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-muted/40 pl-2.5 pr-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
      <Link2 className="size-3.5 shrink-0" />
      <span>{ui("Copiar link")}</span>
      <span className="grid size-6 place-items-center rounded-md bg-background text-foreground shadow-sm">
        {m.isPending ? <Loader2 className="size-3.5 animate-spin" /> : done ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      </span>
    </button>
  );
}

/** Campo completo para o painel de detalhes. */
export function ChargeLinkField({ chargeGroupId }: { chargeGroupId: string }) {
  const fetchLink = useServerFn(getChargeLink);
  const q = useQuery({ queryKey: ["charge-link", chargeGroupId], queryFn: () => fetchLink({ data: { chargeGroupId } }), staleTime: Infinity, retry: false });
  const url = q.data && typeof window !== "undefined" ? `${window.location.origin}/pagar/${q.data.token}` : "";
  const pretty = q.data && typeof window !== "undefined" ? `${window.location.host}/pagar/${q.data.token.slice(0, 6)}…` : "";
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Link fixo da cobrança</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2.5 py-2 text-xs font-medium" title={url}>{q.isLoading ? "Carregando…" : q.isError ? "Não foi possível carregar o link." : pretty}</div>
        <Button type="button" size="sm" variant="outline" disabled={!url} onClick={() => void copyText(url)}><Copy className="size-3.5" />Copiar</Button>
        <Button type="button" size="icon" variant="ghost" disabled={!url} asChild={Boolean(url)} aria-label="Abrir link">
          {url ? <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a> : <ExternalLink className="size-4" />}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">O cliente usa sempre este mesmo link para pagar, ver o andamento e os comprovantes.</p>
    </div>
  );
}
