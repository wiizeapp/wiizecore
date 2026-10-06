import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, EyeOff, Eye, FileText, FolderOpen, HardDrive, Loader2, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataPagination, SearchField } from "@/components/ds";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { DOC_MAX_BYTES, DOC_MIMES, deleteCustomerDocument, listCustomerDocuments, openCustomerDocument, updateCustomerDocument, uploadCustomerDocument } from "@/lib/customer-documents.functions";
import { getDriveStatus } from "@/lib/google-drive.functions";
import { fileToBase64, openFile } from "@/lib/contract-files-client";
import { formatDate } from "@/lib/format";

const PAGE = 10;
const sizeLabel = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

type Row = Awaited<ReturnType<typeof listCustomerDocuments>>["rows"][number];

/** Documentos do cliente guardados no Google Drive da empresa e mostrados no portal do cliente. */
export function CustomerDocuments({ customerId }: { customerId?: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listCustomerDocuments);
  const status = useServerFn(getDriveStatus);
  const update = useServerFn(updateCustomerDocument);
  const remove = useServerFn(deleteCustomerDocument);
  const open = useServerFn(openCustomerDocument);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const drive = useQuery({ queryKey: ["drive-status"], queryFn: () => status() });
  const q = useQuery({ queryKey: ["customer-docs", customerId ?? "all", page, search], queryFn: () => list({ data: { customerId, search: search || undefined, page: page + 1, pageSize: PAGE } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["customer-docs"] });

  const toggle = useMutation({ mutationFn: (r: Row) => update({ data: { id: r.id, visible: !r.visible } }), onSuccess: () => { void refresh(); toast.success("Visibilidade atualizada."); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: (r: Row) => remove({ data: { id: r.id } }), onSuccess: () => { void refresh(); toast.success("Documento excluído."); }, onError: (e: Error) => toast.error(e.message) });

  const view = async (r: Row) => {
    const viewable = r.mime === "application/pdf" || r.mime.startsWith("image/");
    const w = viewable ? window.open("", "_blank") : null;
    setBusy(r.id);
    try { const f = await open({ data: { id: r.id } }); openFile(f.base64, f.fileName, f.mime, w); }
    catch (e) { try { w?.close(); } catch { /* */ } toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const driveOk = drive.data?.connected;
  const canEdit = q.data?.canEdit ?? false;

  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Arquivos e documentos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Ficam no Google Drive da empresa. Os visíveis aparecem como botões no portal do cliente.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {!customerId ? <SearchField value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Buscar documento" /> : null}
          {customerId && canEdit ? <Button onClick={() => setUploadOpen(true)} disabled={!driveOk}><UploadCloud className="size-4" />Anexar documento</Button> : null}
        </div>
      </div>

      {!drive.isLoading && !driveOk ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 sm:m-5">
          <HardDrive className="size-5 text-warning" />
          <p className="min-w-0 flex-1 text-sm">Conecte o Google Drive da empresa para anexar documentos dos clientes.</p>
          <Button asChild size="sm" variant="outline"><Link to="/integracoes">Conectar Google Drive</Link></Button>
        </div>
      ) : null}

      {q.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : q.error ? <ErrorState onRetry={() => void q.refetch()} /> : !q.data?.rows.length ? (
        <div className="p-6"><EmptyState icon={<FolderOpen className="size-5" />} title={search ? "Nenhum documento encontrado" : "Nenhum documento ainda"} text={customerId ? "Anexe apólices, propostas, laudos ou qualquer arquivo para o cliente baixar no portal." : "Os documentos anexados no Cliente 360 aparecem aqui."} /></div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {q.data.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10"><FileText className="size-4 text-primary" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {!customerId ? <><Link to="/clientes/$id" params={{ id: r.customerId }} search={{ aba: "documentos" } as never} className="text-foreground hover:underline">{r.customerName}</Link> · </> : null}
                    Botão “{r.buttonLabel}” · {DOC_MIMES[r.mime] ?? "Arquivo"} · {sizeLabel(r.size)} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.visible ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{r.visible ? "No portal" : "Oculto"}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Abrir" disabled={busy !== null} onClick={() => void view(r)}>{busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}</Button>
                  {canEdit ? <>
                    <Button size="icon" variant="ghost" aria-label={r.visible ? "Ocultar do portal" : "Mostrar no portal"} onClick={() => toggle.mutate(r)}>{r.visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
                    <Button size="icon" variant="ghost" aria-label="Renomear" onClick={() => setEditing(r)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => { if (window.confirm(`Excluir "${r.title}"? O arquivo vai para a lixeira do Drive.`)) del.mutate(r); }}><Trash2 className="size-4 text-destructive" /></Button>
                  </> : null}
                </div>
              </li>
            ))}
          </ul>
          <DataPagination page={page} pageSize={PAGE} total={q.data.total} onPageChange={setPage} />
        </>
      )}

      {customerId ? <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} customerId={customerId} onDone={() => { void refresh(); }} /> : null}
      <EditDialog row={editing} onClose={() => setEditing(null)} onSave={async (title, buttonLabel) => { if (!editing) return; await update({ data: { id: editing.id, title, buttonLabel } }); toast.success("Documento atualizado."); setEditing(null); void refresh(); }} />
    </section>
  );
}

function UploadDialog({ open, onOpenChange, customerId, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; customerId: string; onDone: () => void }) {
  const upload = useServerFn(uploadCustomerDocument);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  const [visible, setVisible] = useState(true);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = () => { setFile(null); setTitle(""); setLabel(""); setVisible(true); };
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!DOC_MIMES[f.type]) { toast.error("Tipo de arquivo não aceito. Envie PDF, imagem, Word, planilha ou texto."); return; }
    if (f.size > DOC_MAX_BYTES) { toast.error("O arquivo precisa ter até 12 MB."); return; }
    setFile(f);
    const base = f.name.replace(/\.[^.]+$/, "");
    if (!title) setTitle(base.slice(0, 120));
    if (!label) setLabel(`Baixar ${base}`.slice(0, 60));
  };
  const submit = async () => {
    if (!file || title.trim().length < 2 || label.trim().length < 2) { toast.error("Escolha o arquivo e preencha o nome e o texto do botão."); return; }
    setBusy(true);
    try {
      await upload({ data: { customerId, title: title.trim(), buttonLabel: label.trim(), fileName: file.name, mime: file.type, base64: await fileToBase64(file), visible } });
      toast.success("Documento salvo no Google Drive.");
      reset(); onOpenChange(false); onDone();
    } catch (e) {
      const m = (e as Error).message;
      toast.error(m === "drive_required" ? "Conecte o Google Drive em Integrações para anexar documentos." : m);
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Anexar documento</DialogTitle><DialogDescription>O arquivo fica no Google Drive da empresa e pode aparecer como botão no portal do cliente.</DialogDescription></DialogHeader>
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary/10"><FileText className="size-4 text-primary" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{sizeLabel(file.size)}</p></div>
            <Button size="icon" variant="ghost" aria-label="Remover arquivo" onClick={() => setFile(null)} disabled={busy}><X className="size-4" /></Button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
            <UploadCloud className="size-7 text-primary" />
            <span className="text-sm font-medium">Arraste o arquivo aqui ou clique para escolher</span>
            <span className="text-xs text-muted-foreground">PDF, imagem, Word, planilha ou texto · até 12 MB</span>
          </button>
        )}
        <input ref={input} type="file" className="hidden" accept={Object.keys(DOC_MIMES).join(",")} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="doc-title">Nome do documento</Label><Input id="doc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Apólice 2026" /></div>
          <div className="space-y-1.5"><Label htmlFor="doc-label">Texto do botão no portal</Label><Input id="doc-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Baixar apólice" /></div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><span>Mostrar no portal do cliente</span><Switch checked={visible} onCheckedChange={setVisible} /></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={busy || !file}>{busy ? <><Loader2 className="size-4 animate-spin" />Enviando ao Drive…</> : "Salvar documento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ row, onClose, onSave }: { row: Row | null; onClose: () => void; onSave: (title: string, label: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if (row && last !== row.id) { setLast(row.id); setTitle(row.title); setLabel(row.buttonLabel); }
  return (
    <Dialog open={Boolean(row)} onOpenChange={(v) => { if (!v && !busy) { onClose(); setLast(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Renomear documento</DialogTitle><DialogDescription>Altere o nome e o texto do botão exibido no portal.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="edit-title">Nome do documento</Label><Input id="edit-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-label">Texto do botão</Label><Input id="edit-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button disabled={busy || title.trim().length < 2 || label.trim().length < 2} onClick={async () => { setBusy(true); try { await onSave(title.trim(), label.trim()); setLast(null); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
