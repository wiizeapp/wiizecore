import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Copy, Download, ExternalLink, FileCode2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authorizeInvoiceNow, cancelInvoice, getFiscalOverview, syncInvoice } from "@/lib/invoices.functions";
import { INVOICE_ORIGIN_LABEL, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, TIMELINE_LABEL, type InvoiceStatus } from "@/lib/invoice-status";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { confirmAction } from "@/components/confirm-dialog";
import { PageHeader, Panel, StatusBadge, ErrorState, ListSkeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/notas-fiscais/$id")({
  head: () => ({
    meta: [
      { title: "Nota Fiscal — Wiize Core" },
      { name: "description", content: "Detalhes, documentos e histórico da nota fiscal de serviço." },
      { property: "og:title", content: "Nota Fiscal — Wiize Core" },
      { property: "og:description", content: "Detalhes, documentos e histórico da nota fiscal de serviço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotaDetalhe,
});

function copy(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado.`));
}

function NotaDetalhe() {
  const { t: ui } = useTranslation("ui");
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getFiscalOverview);
  const cancel = useServerFn(cancelInvoice);
  const authorize = useServerFn(authorizeInvoiceNow);
  const sync = useServerFn(syncInvoice);
  const overview = useQuery({ queryKey: ["fiscal-overview"], queryFn: () => fetchOverview() });
  const inv = useQuery({
    queryKey: ["invoices", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("*, customers(name, document), fiscal_services(name), payments(description, due_on, gross_amount)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const events = useQuery({
    queryKey: ["invoices", "events", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_events").select("id, event_type, status, message, created_at").eq("invoice_id", id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["invoices"] }); };
  const act = (fn: () => Promise<unknown>, ok: string) => ({ mutationFn: fn, onSuccess: () => { toast.success(ok); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const cancelM = useMutation(act(() => cancel({ data: { id } }), "Cancelamento solicitado."));
  const authM = useMutation(act(() => authorize({ data: { id } }), "Processando emissão."));
  const syncM = useMutation(act(() => sync({ data: { id } }), "Informações atualizadas."));

  if (inv.isLoading) return <div><PageHeader title="Nota Fiscal" /><ListSkeleton rows={5} /></div>;
  if (inv.isError || !inv.data) return <div><PageHeader title="Nota Fiscal" /><ErrorState text="Nota não encontrada." onRetry={() => inv.refetch()} /></div>;
  const n = inv.data;
  const status = n.status as InvoiceStatus;
  const supportsCancel = Boolean(overview.data?.options?.supportsCancellation);
  const canCancel = supportsCancel && ["AUTHORIZED", "CANCELLATION_DENIED", "SCHEDULED"].includes(status);

  return (
    <div>
      <Link to="/notas-fiscais" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Notas fiscais</Link>
      <PageHeader
        title={n.number ? `NFS-e Nº ${n.number}` : "Nota Fiscal"}
        description={`${n.customers?.name ?? "Cliente"} · ${formatBRL(n.value)}`}
        action={<>
          <StatusBadge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</StatusBadge>
          {n.number ? <Button variant="outline" size="sm" onClick={() => copy(n.number, "Número")}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar número</Button> : null}
          {status === "SCHEDULED" ? <Button size="sm" onClick={() => authM.mutate()} disabled={authM.isPending}>Emitir agora</Button> : null}
          {canCancel ? (
            <Button variant="outline" size="sm" disabled={cancelM.isPending} onClick={async () => {
              const ok = await confirmAction({ title: "Tem certeza que deseja solicitar o cancelamento desta NFS-e?", description: "O cancelamento depende das regras do município.", confirmText: "Solicitar cancelamento", destructive: true });
              if (ok) cancelM.mutate();
            }}>Cancelar nota</Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={() => syncM.mutate()} disabled={syncM.isPending || !n.provider_invoice_id} aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${syncM.isPending ? "animate-spin" : ""}`} /></Button>
        </>}
      />

      {status === "ERROR" ? (
        <div className="surface-panel mb-6 flex flex-col gap-3 border-destructive/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/12"><AlertTriangle className="h-4 w-4 text-destructive" /></span>
            <div>
              <p className="font-display text-sm font-semibold">Não foi possível emitir esta nota</p>
              <p className="text-xs text-muted-foreground">{n.error_message ?? "Existe uma inconsistência nos dados fiscais ou na configuração do município."}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild><Link to="/notas-fiscais/configuracoes">Ver configuração fiscal</Link></Button>
            <Button size="sm" asChild><Link to="/notas-fiscais" search={n.payment_id ? { emitir: "payment", cobranca: n.payment_id } : { emitir: "standalone", cliente: n.customer_id ?? undefined }}>{ui("Tentar novamente")}</Link></Button>
          </div>
        </div>
      ) : null}
      {status === "PENDING" || status === "SYNCHRONIZED" ? (
        <p className="surface-panel mb-6 px-5 py-3 text-xs text-muted-foreground">Processando emissão. A nota só aparece como emitida depois que a prefeitura autorizar.</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Panel title="Dados da nota">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Número", n.number ?? "Aguardando autorização"], ["Status", INVOICE_STATUS_LABEL[status]], [ui("Cliente"), n.customers?.name ?? "—"],
                ["Serviço", n.fiscal_services?.name ?? n.municipal_service_name ?? "—"], ["Valor", formatBRL(n.value)], ["Data de emissão", formatDate(n.effective_date)],
                ["Origem", INVOICE_ORIGIN_LABEL[n.origin] ?? n.origin], ["Cobrança relacionada", n.payments ? `${n.payments.description ?? "Cobrança"} · ${formatDate(n.payments.due_on)}` : "—"],
                ["Código de serviço", n.municipal_service_code ?? "Serviço municipal"], ["Ambiente", n.environment === "production" ? "Produção" : "Teste"],
              ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words font-medium">{v}</dd></div>)}
            </dl>
            <div className="mt-4 border-t border-border pt-4 text-sm">
              <p className="text-xs text-muted-foreground">Descrição do serviço</p><p className="mt-1 whitespace-pre-wrap">{n.service_description}</p>
              {n.observations ? <><p className="mt-3 text-xs text-muted-foreground">Observações</p><p className="mt-1 whitespace-pre-wrap">{n.observations}</p></> : null}
            </div>
          </Panel>

          <Panel title="Linha do tempo">
            {events.isLoading ? <ListSkeleton rows={3} /> : (
              <ol className="relative ml-2 space-y-4 border-l border-border pl-5">
                {(events.data ?? []).map((e) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background ${e.event_type === "INVOICE_ERROR" || e.event_type === "INVOICE_CANCELLATION_DENIED" ? "bg-destructive" : e.event_type === "INVOICE_AUTHORIZED" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                    <p className="text-sm font-medium">{TIMELINE_LABEL[e.event_type] ?? "Atualização da nota"}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}{e.message ? ` · ${e.message}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Documentos" subtitle="Disponíveis após a autorização pela prefeitura.">
            <div className="space-y-2">
              {n.pdf_url ? <>
                <Button variant="outline" className="w-full justify-start" asChild><a href={n.pdf_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Visualizar PDF</a></Button>
                <Button variant="outline" className="w-full justify-start" asChild><a href={n.pdf_url} download target="_blank" rel="noopener noreferrer"><Download className="mr-2 h-4 w-4" />Baixar PDF</a></Button>
              </> : <p className="text-xs text-muted-foreground">PDF ainda não disponível.</p>}
              {n.xml_url ? <Button variant="outline" className="w-full justify-start" asChild><a href={n.xml_url} target="_blank" rel="noopener noreferrer"><FileCode2 className="mr-2 h-4 w-4" />Visualizar/baixar XML</a></Button> : <p className="text-xs text-muted-foreground">XML ainda não disponível.</p>}
            </div>
          </Panel>
          {n.validation_code ? (
            <Panel title="Código de validação">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
                <code className="truncate text-xs">{n.validation_code}</code>
                <Button variant="ghost" size="icon" onClick={() => copy(n.validation_code, "Código")} aria-label="Copiar código"><Copy className="h-4 w-4" /></Button>
              </div>
            </Panel>
          ) : null}
          {!supportsCancel && status === "AUTHORIZED" ? <p className="px-1 text-xs text-muted-foreground">O cancelamento automático não está disponível no seu município.</p> : null}
        </div>
      </div>
    </div>
  );
}
