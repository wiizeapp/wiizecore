import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileCheck, RefreshCw, Upload, Download, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { PageContainer, PageHeader, DataTableShell, EmptyState, ErrorState, ListSkeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { listChargebackCases, getChargebackCase, syncChargebackCase, uploadChargebackEvidence, chargebackEvidenceAction, submitChargebackDefense } from "@/lib/chargeback-center.functions";
const options = (page: number) => queryOptions({ queryKey: ["chargeback-cases", page], queryFn: () => listChargebackCases({ data: { page } }) });
export const Route = createFileRoute("/_authenticated/contestacoes")({
  loader: ({ context }) => context.queryClient.ensureQueryData(options(1)),
  head: () => ({ meta: [
    { title: "Central de Contestações — WiizePay" },
    { name: "description", content: "Contestações, documentos de defesa e acompanhamento oficial do Asaas para sua empresa." },
    { property: "og:title", content: "Central de Contestações — WiizePay" },
    { property: "og:description", content: "Acompanhe contestações e o recebimento de defesas pelo Asaas." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }), component: Page,
});
const STATUS: Record<string, string> = { REQUESTED: "Documentos pendentes", IN_DISPUTE: "Em análise", DISPUTE_LOST: "Disputa perdida", REVERSED: "Revertida pelo Asaas", DONE: "Encerrada" };
const money = (v: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
function Page() {
  const { t: ui } = useTranslation("ui");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [id, setId] = useState<string | null>(null);
  const rows = useQuery(options(page));
  const visible = (rows.data?.cases ?? []).filter((c) => (status === "all" || c.status === status) && `${c.provider_payment_id} ${c.reason ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return <PageContainer>
    <PageHeader title={ui("Central de Contestações")} />
    <DataTableShell toolbar={<><Input aria-label={ui("Buscar contestação nesta página")} placeholder={ui("Buscar contestação nesta página")} value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" /><Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-56" aria-label={ui("Status")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{ui("Todos")}</SelectItem>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{ui(v)}</SelectItem>)}</SelectContent></Select><Button variant="ghost" size="icon" title={ui("Atualizar")} onClick={() => void rows.refetch()}><RefreshCw className="size-4" /></Button></>}>
      {rows.isPending ? <ListSkeleton /> : rows.isError ? <ErrorState onRetry={() => void rows.refetch()} /> : !visible.length ? <EmptyState icon={<FileCheck className="size-6" />} title={ui("Nenhuma contestação encontrada")} /> : <table className="w-full text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr>{["Cobrança", "Valor contestado", "Status", "Prazo Asaas", "Ações"].map((v) => <th className="p-4 font-medium" key={v}>{ui(v)}</th>)}</tr></thead><tbody className="divide-y divide-border">{visible.map((c) => <tr key={c.id}><td className="p-4 font-mono text-xs">{c.provider_payment_id}</td><td className="numeric-tabular whitespace-nowrap p-4">{money(c.amount)}</td><td className="p-4">{ui(c.defense_state === "confirmed" ? "Defesa recebida pelo Asaas" : c.defense_state === "uncertain" || c.defense_state === "sending" ? "Envio aguardando confirmação" : STATUS[c.status] ?? c.status)}</td><td className="whitespace-nowrap p-4">{c.dispute_deadline ?? ui("Não informado pelo Asaas")}</td><td className="p-4"><Button variant="outline" size="sm" onClick={() => setId(c.id)}>{ui("Ver contestação")}</Button></td></tr>)}</tbody></table>}
    </DataTableShell>
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{ui("Página")} {page} · {rows.data?.total ?? "—"} {ui("contestações")}</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={ui("Página anterior")} disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ArrowLeft className="size-4" /></Button><Button variant="outline" size="icon" aria-label={ui("Próxima página")} disabled={!rows.data || page * 20 >= rows.data.total} onClick={() => setPage((p) => p + 1)}><ArrowRight className="size-4" /></Button></div></div>
    {id ? <CaseDialog id={id} close={() => setId(null)} /> : null}
  </PageContainer>;
}
function CaseDialog({ id, close }: { id: string; close: () => void }) {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const get = useServerFn(getChargebackCase);
  const sync = useServerFn(syncChargebackCase);
  const upload = useServerFn(uploadChargebackEvidence);
  const document = useServerFn(chargebackEvidenceAction);
  const send = useServerFn(submitChargebackDefense);
  const detail = useQuery({ queryKey: ["chargeback-case", id], queryFn: () => get({ data: { id } }) });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await Promise.all([qc.invalidateQueries({ queryKey: ["chargeback-case", id] }), qc.invalidateQueries({ queryKey: ["chargeback-cases"] })]); }
    catch (e) { toast.error(ui(e instanceof Error ? e.message : "Não foi possível concluir a operação.")); }
    finally { setBusy(false); }
  };
  const d = detail.data;
  return <Dialog open onOpenChange={(open) => !open && close()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{ui("Contestação")}</DialogTitle><DialogDescription>{d?.customer ?? d?.c.provider_payment_id ?? ui("Carregando")}</DialogDescription></DialogHeader>
    {detail.isPending ? <ListSkeleton /> : detail.isError ? <ErrorState onRetry={() => void detail.refetch()} /> : d ? <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-3">{[["Valor contestado", money(d.c.amount)], ["Status oficial", ui(STATUS[d.c.status] ?? d.c.status)], ["Prazo Asaas", d.c.dispute_deadline ?? ui("Não informado pelo Asaas")], ["Motivo oficial", d.c.reason ?? ui("Não informado pelo Asaas")], ["Defesa", ui(d.c.defense_state === "confirmed" ? "Defesa recebida pelo Asaas" : d.c.defense_state === "idle" ? "Não enviada" : "Envio aguardando confirmação")]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{ui(label ?? "")}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      <Button variant="outline" disabled={busy} onClick={() => void perform(() => sync({ data: { id } }))}><RefreshCw className="size-4" />{ui("Consultar Asaas")}</Button>
      <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">{ui("Documentos de defesa")}</h3><p className="text-sm text-muted-foreground">{ui("Até 11 arquivos. PDF, JPG ou PNG, até 5 MB cada. O envio não garante a reversão da contestação.")}</p>
        {!d.documents.length ? <p className="text-sm text-muted-foreground">{ui("Nenhum documento anexado")}</p> : <ul className="divide-y divide-border">{d.documents.map((f) => <li key={f.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-all text-sm">{f.file_name}</p><p className="text-xs text-muted-foreground">{Math.ceil(f.size_bytes / 1024)} KB · {ui(f.status === "sent" ? "Enviado" : "Pendente")}</p></div><Button size="icon" variant="ghost" title={ui("Baixar documento")} disabled={busy} onClick={() => void perform(async () => { const url = await document({ data: { id, documentId: f.id, remove: false } }); if (url) window.open(url, "_blank", "noopener,noreferrer"); })}><Download className="size-4" /></Button>{d.canEdit ? <Button size="icon" variant="ghost" title={ui("Remover documento")} disabled={busy} onClick={() => void perform(() => document({ data: { id, documentId: f.id, remove: true } }))}><Trash2 className="size-4" /></Button> : null}</li>)}</ul>}
        {d.canEdit && d.documents.length < 11 ? <label className="block space-y-2 text-sm"><span className="flex items-center gap-2 font-medium"><Upload className="size-4" />{ui("Anexar documento")}</span><Input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (file.size > 5 * 1024 * 1024) { toast.error(ui("O arquivo deve ter até 5 MB.")); return; } void perform(async () => { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); await upload({ data: { id, name: file.name, mime: file.type as "application/pdf" | "image/jpeg" | "image/png", base64: btoa(binary) } }); }); }} /></label> : null}
      </section>
      {d.canEdit ? <Button disabled={busy || !d.documents.length || !d.c.provider_chargeback_id} onClick={() => setConfirm(true)}><FileCheck className="size-4" />{ui("Enviar defesa ao Asaas")}</Button> : null}
      {!d.c.provider_chargeback_id ? <p className="text-sm text-muted-foreground">{ui("Consulte o Asaas para conferir os dados antes do envio.")}</p> : null}
      <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">{ui("Histórico da contestação")}</h3>{d.events.map((event) => <div key={event.id} className="border-l-2 border-border pl-3"><p className="text-sm">{ui(event.description)}</p><p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</p></div>)}</section>
    </div> : null}
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>{ui("Confirmar envio da defesa")}</DialogTitle><DialogDescription>{ui("Os documentos serão enviados ao Asaas e não poderão ser alterados após o recebimento. Deseja continuar?")}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>{ui("Cancelar")}</Button><Button disabled={busy} onClick={() => void perform(async () => { await send({ data: { id, confirmed: true } }); setConfirm(false); toast.success(ui("O Asaas confirmou o recebimento da defesa.")); })}>{busy ? ui("Enviando") : ui("Confirmar envio")}</Button></DialogFooter></DialogContent></Dialog>
  </DialogContent></Dialog>;
}