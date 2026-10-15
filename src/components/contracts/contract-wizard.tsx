import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, CloudOff, FileText, HardDrive, Loader2, FileType2, Link2, PenLine, Plus, Trash2, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField, isoAddMonths, monthsBetween } from "@/components/ds/date-field";
import { SignaturePlacer, type PlacedField } from "@/components/contracts/signature-placer";
import { createContract } from "@/lib/contracts.functions";
import { addContractSigner, attachContractFile, fetchDriveLinkFile, saveSignatureFields } from "@/lib/contract-docs.functions";
import { getDriveStatus, startDriveConnect } from "@/lib/google-drive.functions";
import { docxToText, fileToBase64 } from "@/lib/contract-files-client";

type Source = "pdf" | "docx" | "gdoc" | "text";
type Extra = { name: string; email: string; document: string; role: "witness" | "signer" | "approver" };
const ROLE: Record<Extra["role"], string> = { witness: "Testemunha", signer: "Signatário", approver: "Aprovador" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_INFO = { title: "", customerId: "", customerEmail: "", amount: "", startsOn: "", endsOn: "", durationMonths: "", mode: "months" as "months" | "range" };

export function ContractWizard({ open, onOpenChange, tenantId }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId?: string | undefined }) {
  const navigate = useNavigate();
  const create = useServerFn(createContract);
  const attach = useServerFn(attachContractFile);
  const addSigner = useServerFn(addContractSigner);
  const importLink = useServerFn(fetchDriveLinkFile);
  const driveStatus = useServerFn(getDriveStatus);
  const driveStart = useServerFn(startDriveConnect);
  const drive = useQuery({ queryKey: ["drive-status"], enabled: open, queryFn: () => driveStatus() });
  const driveOk = Boolean(drive.data?.connected);
  const [connecting, setConnecting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string })?.type !== "wiizepay-drive") return;
      void drive.refetch();
      if (!(e.data as { ok?: boolean }).ok) setConnecting(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [drive]);
  const popupRef = useRef<Window | null>(null);
  useEffect(() => {
    if (!connecting) return;
    let closedTicks = 0;
    const started = Date.now();
    const id = window.setInterval(async () => {
      const r = await drive.refetch();
      if (r.data?.connected) { setConnecting(false); toast.success("Google Drive conectado."); try { popupRef.current?.close(); } catch { /* */ } return; }
      if (popupRef.current?.closed) closedTicks++;
      if (closedTicks >= 2 || Date.now() - started > 5 * 60_000) { setConnecting(false); if (closedTicks >= 2) toast.info("Conexão não concluída. Tente novamente."); }
    }, 2000);
    return () => window.clearInterval(id);
  }, [connecting]);
  const connectDrive = async () => {
    const w = window.open("about:blank", "wiizepay-drive", "width=520,height=660");
    popupRef.current = w;
    setConnecting(true);
    try {
      const { url } = await driveStart({ data: { origin: window.location.origin } });
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) { w?.close(); setConnecting(false); toast.error((e as Error).message); }
  };
  const saveFields = useServerFn(saveSignatureFields);

  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [gdocUrl, setGdocUrl] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(EMPTY_INFO);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [draft, setDraft] = useState<Extra>({ name: "", email: "", document: "", role: "witness" });
  const [fields, setFields] = useState<PlacedField[]>([]);

  const steps = source === "pdf" ? ["Documento", "Informações", "Quem assina", "Posições no PDF", "Revisão"] : ["Documento", "Informações", "Quem assina", "Revisão"];
  const last = steps.length - 1;
  const stepName = steps[step];

  const { data: customers } = useQuery({
    queryKey: ["customers-simple-email", tenantId],
    enabled: Boolean(tenantId && open),
    queryFn: async () => (await supabase.from("customers").select("id, name, email").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });
  const customer = customers?.find((c) => c.id === info.customerId);
  const needCustomerEmail = Boolean(customer && !customer.email);

  const reset = () => { setStep(0); setFile(null); setPdfBytes(null); setBody(""); setGdocUrl(""); setExtras([]); setFields([]); setInfo(EMPTY_INFO); };

  const period = useMemo(() => {
    if (!info.startsOn) return null;
    if (info.mode === "range") return info.endsOn && info.endsOn > info.startsOn ? { endsOn: info.endsOn, months: monthsBetween(info.startsOn, info.endsOn) } : null;
    const m = Number(info.durationMonths);
    return m >= 1 && m <= 120 ? { endsOn: isoAddMonths(info.startsOn, m), months: m } : null;
  }, [info]);

  const signerList = useMemo(() => [
    { key: "provider", label: "Sua empresa", role: "Contratado" },
    ...(customer ? [{ key: "customer", label: customer.name, role: "Contratante" }] : []),
    ...extras.map((e, i) => ({ key: `extra:${i}`, label: e.name, role: ROLE[e.role] })),
  ], [customer, extras]);

  const pickFile = async (f: File | null) => {
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { toast.error("Arquivo maior que 12 MB."); return; }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const isDocx = f.name.toLowerCase().endsWith(".docx");
    if (source === "pdf" && !isPdf) { toast.error("Escolha um arquivo PDF."); return; }
    if (source === "docx" && !isDocx) { toast.error("Escolha um arquivo Word (.docx). Arquivos .doc antigos: salve como .docx antes."); return; }
    setFile(f); setFields([]);
    if (isPdf) setPdfBytes(new Uint8Array(await f.arrayBuffer()));
    if (!info.title) setInfo((i) => ({ ...i, title: f.name.replace(/\.(pdf|docx)$/i, "") }));
    if (isDocx) {
      try { setBody(await docxToText(f)); toast.success("Documento convertido. Confira o texto abaixo."); }
      catch { toast.error("Não conseguimos ler este arquivo Word."); setFile(null); }
    }
  };

  const loadGdoc = async () => {
    setBusy(true);
    try {
      const r = await importLink({ data: { url: gdocUrl } });
      const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const f = new File([bin], r.fileName, { type: "application/pdf" });
      setSource("pdf"); setFile(f); setPdfBytes(bin); setFields([]);
      if (!info.title) setInfo((i) => ({ ...i, title: r.fileName.replace(/\.pdf$/i, "") }));
      toast.success("Arquivo importado do Drive.");
    }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const docReady = source !== "text" && !driveOk ? false : source === "pdf" ? Boolean(file) : body.trim().length >= 20;
  const infoReady = info.title.trim().length >= 3 && Boolean(period) && (!needCustomerEmail || EMAIL.test(info.customerEmail.trim()));
  const placedAll = signerList.every((s) => fields.some((f) => f.signerKey === s.key && f.kind !== "initials"));
  const canNext = stepName === "Documento" ? docReady : stepName === "Informações" ? infoReady : stepName === "Posições no PDF" ? placedAll : true;

  const save = async (asDraft: boolean) => {
    if (!docReady) { toast.error("Escolha ou escreva o documento primeiro."); setStep(0); return; }
    if (info.title.trim().length < 3) { toast.error("Informe o título do contrato."); setStep(1); return; }
    setBusy(true);
    try {
      const finalBody = source === "pdf" ? `Documento em PDF anexado: ${file!.name}. O conteúdo integral está no arquivo PDF deste contrato.` : body;
      const r = await create({ data: {
        title: info.title, customerId: info.customerId || null, customerEmail: info.customerEmail || null,
        amount: Number(info.amount.replace(/\./g, "").replace(",", ".") || 0),
        startsOn: info.startsOn || null, endsOn: period?.endsOn ?? null, durationMonths: period?.months ?? null,
        body: finalBody, draft: asDraft,
      } });
      if (source === "pdf" || source === "docx") {
        await attach({ data: { contractId: r.contractId, fileName: file!.name, format: source, base64: await fileToBase64(file!) } });
      } else if (source === "gdoc") {
        await attach({ data: { contractId: r.contractId, fileName: gdocUrl.slice(0, 150), format: "gdoc" } });
      }
      const idMap = new Map<string, string>();
      for (const [i, e] of extras.entries()) {
        const s = await addSigner({ data: { contractId: r.contractId, ...e } });
        if (s.signerId) idMap.set(`extra:${i}`, `signer:${s.signerId}`);
      }
      if (source === "pdf" && fields.length) {
        const mapped = fields.map((f) => ({ ...f, signerKey: f.signerKey.startsWith("extra:") ? idMap.get(f.signerKey) ?? "" : f.signerKey })).filter((f) => f.signerKey);
        await saveFields({ data: { contractId: r.contractId, fields: mapped } });
      }
      toast.success(asDraft ? "Rascunho salvo." : "Contrato criado. Agora gere os links de assinatura.");
      onOpenChange(false); reset();
      void navigate({ to: "/contratos/$id", params: { id: r.contractId }, search: { aba: asDraft ? "visao" : "assinaturas" } });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const extraValid = draft.name.trim().length >= 3 && EMAIL.test(draft.email.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>

        <ol className="mb-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5">
              <div className={`h-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <span className={`text-xs ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{i + 1}. {s}</span>
            </li>
          ))}
        </ol>

        {stepName === "Documento" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["pdf", "PDF", FileText], ["docx", "Word", FileType2], ["gdoc", "Link do Drive", Link2], ["text", "Escrever", PenLine]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => { setSource(id); setFile(null); setPdfBytes(null); setBody(""); setFields([]); }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors ${source === id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="h-5 w-5" />{label}
                </button>
              ))}
            </div>
            {source !== "text" && !driveOk && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-6 text-center">
                {drive.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <CloudOff className="h-7 w-7 text-muted-foreground" />}
                <div>
                  <p className="font-medium">Conecte o Google Drive para usar arquivos</p>
                  <p className="mt-1 text-xs text-muted-foreground">Os arquivos dos contratos ficam no Drive da sua empresa, numa pasta “WiizePay – Contratos”. Você também pode escrever o contrato aqui mesmo sem conectar.</p>
                </div>
                {drive.data && !drive.data.configured ? (
                  <p className="text-xs text-warning">A conexão com o Google Drive está aguardando configuração da Wiize Recebe.</p>
                ) : drive.data && !drive.data.canManage ? (
                  <p className="text-xs text-muted-foreground">Peça ao proprietário ou administrador da empresa para conectar o Drive.</p>
                ) : (
                  <Button type="button" onClick={() => void connectDrive()} disabled={connecting || drive.isLoading}>
                    {connecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <HardDrive className="mr-1.5 h-4 w-4" />}{connecting ? "Aguardando o Google..." : "Conectar Google Drive"}
                  </Button>
                )}
              </div>
            )}
            {driveOk && source !== "text" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="h-3.5 w-3.5 text-primary" />Salvando no Google Drive{drive.data?.email ? ` de ${drive.data.email}` : ""}.</p>
            )}
            {driveOk && (source === "pdf" || source === "docx") && (
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); void pickFile(e.dataTransfer.files?.[0] ?? null); }}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm transition-colors ${dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary"}`}>
                <Upload className="h-6 w-6 text-primary" />
                <span className="font-medium">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : source === "pdf" ? "Arraste o PDF aqui ou clique para escolher" : "Arraste o Word (.docx) aqui ou clique para escolher"}</span>
                <span className="text-xs text-muted-foreground">Até 12 MB. {source === "pdf" ? "Depois você marca no PDF onde cada pessoa assina." : "Convertemos para PDF na assinatura."}</span>
                <input type="file" className="hidden" accept={source === "pdf" ? "application/pdf,.pdf" : ".docx"} onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
            {driveOk && source === "gdoc" && (
              <div className="space-y-2">
                <Label>Link do Google Drive ou Google Docs</Label>
                <div className="flex gap-2">
                  <Input placeholder="https://drive.google.com/file/d/..." value={gdocUrl} onChange={(e) => setGdocUrl(e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => void loadGdoc()} disabled={busy || !gdocUrl}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar"}</Button>
                </div>
                <p className="text-xs text-muted-foreground">Aceita PDF ou Google Docs (convertido em PDF). O arquivo precisa estar como “Qualquer pessoa com o link”.</p>
              </div>
            )}
            {(source === "text" || (driveOk && source === "docx" && body)) && (
              <div className="space-y-2">
                <Label>{source === "text" ? "Texto do contrato" : "Texto convertido (pode ajustar)"}</Label>
                <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva ou cole o texto do contrato..." />
                <p className="text-xs text-muted-foreground">Em contratos de texto, as assinaturas entram automaticamente no fim do documento.</p>
              </div>
            )}
          </div>
        )}

        {stepName === "Informações" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Título *</Label><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Contratante (cliente)</Label>
              <Select value={info.customerId || "none"} onValueChange={(v) => { setInfo({ ...info, customerId: v === "none" ? "" : v, customerEmail: "" }); setFields((f) => f.filter((x) => x.signerKey !== "customer")); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente (contrato avulso)</SelectItem>
                  {customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              {needCustomerEmail ? (
                <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-3">
                  <Label className="text-xs">Este cliente não tem e-mail. Informe para ele poder assinar *</Label>
                  <Input type="email" placeholder="email@cliente.com" value={info.customerEmail} onChange={(e) => setInfo({ ...info, customerEmail: e.target.value })} />
                </div>
              ) : null}
            </div>
            <div className="space-y-2"><Label>Valor (opcional)</Label><Input inputMode="decimal" placeholder="0,00" value={info.amount} onChange={(e) => setInfo({ ...info, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label>Início *</Label><DateField value={info.startsOn} onChange={(v) => setInfo({ ...info, startsOn: v })} invalid={!info.startsOn} /></div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Duração do contrato *</Label>
              <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                {([["months", "Em meses"], ["range", "Data de fim"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setInfo({ ...info, mode: k })} className={`rounded-md px-3 py-1.5 font-medium ${info.mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {info.mode === "months"
                  ? <Input type="number" min={1} max={120} placeholder="Ex.: 12" value={info.durationMonths} onChange={(e) => setInfo({ ...info, durationMonths: e.target.value })} />
                  : <DateField value={info.endsOn} min={info.startsOn || undefined} onChange={(v) => setInfo({ ...info, endsOn: v })} placeholder="Escolher data de fim" shortcuts={[]} />}
                <div className="flex items-center rounded-md border border-border bg-muted/30 px-3 text-xs">
                  {period && info.startsOn
                    ? <>De {new Date(info.startsOn + "T12:00").toLocaleDateString("pt-BR")} até {new Date(period.endsOn + "T12:00").toLocaleDateString("pt-BR")} · {period.months} {period.months === 1 ? "mês" : "meses"}</>
                    : <span className="text-muted-foreground">Escolha o início e a duração</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {stepName === "Quem assina" && (
          <div className="space-y-4">
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              <li className="flex items-center gap-3 p-3"><Check className="h-4 w-4 text-primary" /><span className="flex-1">Sua empresa</span><span className="text-xs text-muted-foreground">Contratado · assina aqui no sistema</span></li>
              {customer ? <li className="flex items-center gap-3 p-3"><Check className="h-4 w-4 text-primary" /><span className="flex-1">{customer.name}<span className="block text-xs text-muted-foreground">{customer.email || info.customerEmail}</span></span><span className="text-xs text-muted-foreground">Contratante · por link</span></li> : null}
              {extras.map((e, i) => (
                <li key={i} className="flex items-center gap-3 p-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{e.name}<span className="block text-xs text-muted-foreground">{e.email}</span></span>
                  <span className="text-xs text-muted-foreground">{ROLE[e.role]} · por link</span>
                  <Button size="icon" variant="ghost" onClick={() => { setExtras(extras.filter((_, j) => j !== i)); setFields([]); }}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-3 text-sm font-medium">Adicionar testemunha ou outra pessoa</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Nome completo *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as Extra["role"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ROLE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="email" placeholder="E-mail * (recebe o link)" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                <Input placeholder="CPF (opcional, confere na assinatura)" value={draft.document} onChange={(e) => setDraft({ ...draft, document: e.target.value })} />
              </div>
              <Button size="sm" variant="outline" className="mt-3" disabled={!extraValid || extras.length >= 10}
                onClick={() => { setExtras([...extras, { ...draft, email: draft.email.trim() }]); setDraft({ name: "", email: "", document: "", role: "witness" }); }}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        )}

        {stepName === "Posições no PDF" && pdfBytes && (
          <SignaturePlacer pdf={pdfBytes} signers={signerList} value={fields} onChange={setFields} />
        )}

        {stepName === "Revisão" && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Título", info.title],
              ["Documento", source === "pdf" ? `PDF: ${file?.name}` : source === "docx" ? `Word: ${file?.name}` : source === "gdoc" ? "Google Docs" : "Texto escrito aqui"],
              ["Contratante", customer?.name ?? "Nenhum (avulso)"],
              ["Período", period && info.startsOn ? `${new Date(info.startsOn + "T12:00").toLocaleDateString("pt-BR")} a ${new Date(period.endsOn + "T12:00").toLocaleDateString("pt-BR")} (${period.months} meses)` : "—"],
              ["Pessoas que assinam", String(signerList.length)],
              ...(source === "pdf" ? [["Campos de assinatura no PDF", String(fields.length)]] : []),
            ].map(([k, v]) => <div key={k} className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>)}
            <p className="text-xs text-muted-foreground sm:col-span-2">As assinaturas são carimbadas nas posições marcadas e todas as páginas recebem o código de verificação. Se alguém tirar ou trocar uma página, a conferência de autenticidade falha.</p>
          </dl>
        )}

        <div className="mt-2 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : onOpenChange(false))}>{step ? "Voltar" : "Cancelar"}</Button>
          <div className="flex gap-2">
            {step > 0 ? <Button variant="outline" onClick={() => void save(true)} disabled={busy}>Salvar rascunho</Button> : null}
            {step < last
              ? <Button onClick={() => setStep(step + 1)} disabled={!canNext || busy}>Continuar</Button>
              : <Button onClick={() => void save(false)} disabled={busy || !infoReady || (source === "pdf" && !placedAll)}>{busy ? "Criando..." : "Criar contrato"}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
