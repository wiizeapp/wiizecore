import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { listInboundEmails, markInboundEmailRead } from "@/lib/admin-inbox.functions";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export function AdminInbox() {
  const list = useServerFn(listInboundEmails);
  const mark = useServerFn(markInboundEmailRead);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-inbox"], queryFn: () => list() });
  const [open, setOpen] = useState<string | null>(null);
  const read = useMutation({ mutationFn: (id: string) => mark({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-inbox"] }) });

  if (q.isLoading) return <div className="surface-panel p-6 text-sm text-muted-foreground">Carregando mensagens…</div>;
  if (q.error) return <div className="surface-panel p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  const items = q.data ?? [];
  if (!items.length) return <EmptyState title="Nenhuma mensagem recebida" description="Os e-mails enviados pelo parceiro para as contas das empresas aparecem aqui." />;

  return (
    <div className="surface-panel divide-y divide-border">
      {items.map((m) => (
        <div key={m.id} className="p-4">
          <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => { setOpen(open === m.id ? null : m.id); if (!m.read_at) read.mutate(m.id); }}>
            <div className="min-w-0">
              <p className={`truncate text-sm ${m.read_at ? "" : "font-semibold"}`}>{m.subject || "(sem assunto)"}</p>
              <p className="truncate text-xs text-muted-foreground">{m.from_address} · {m.tenant_name ?? "Empresa não identificada"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!m.read_at ? <Badge>Nova</Badge> : null}
              <span className="text-xs text-muted-foreground">{formatDate(m.received_at)}</span>
            </div>
          </button>
          {open === m.id ? (
            <div className="mt-3 space-y-3">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.text_body || "Sem conteúdo em texto."}</p>
              {m.links.length ? (
                <div className="flex flex-wrap gap-2">
                  {m.links.map((l: string) => (
                    <Button key={l} asChild size="sm" variant="outline">
                      <a href={l} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3 w-3" />{new URL(l).hostname}</a>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
