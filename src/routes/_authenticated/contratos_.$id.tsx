import { BirthDateField } from "@/components/contracts/birth-date-field";
import { SignaturePad, type SignatureValue } from "@/components/contracts/signature-pad";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Circle, Copy, Download, ExternalLink, Eye, FileText, FileType, PenLine, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader, Panel, StatusBadge, ErrorState, ListSkeleton } from "@/components/ds";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createContractVersion, signContractAsProvider } from "@/lib/contracts.functions";
import { createContractLink, revokeContractLinks } from "@/lib/contract-links.functions";
import { addContractSigner, attachContractFile, createSignerLink, deleteContractDraft, downloadContractPdf, getOriginalContractPdf, removeContractSigner, saveSignatureFields } from "@/lib/contract-docs.functions";
import { SignaturePlacer, type PlacedField } from "@/components/contracts/signature-placer";
import { docxToText, fileToBase64, openPdf, preparePdfWindow } from "@/lib/contract-files-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { contractStatusLabels, paymentStatusLabels } from "@/lib/labels";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { durationLabel } from "@/lib/contract-display";
import { useTranslation } from "react-i18next";

const TABS = [
  { id: "visao", label: "Visão geral" },
  { id: "documento", label: "Documento" },
  { id: "assinaturas", label: "Assinaturas" },
  { id: "auditoria", label: "Auditoria" },
  { id: "cobrancas", label: "Cobranças" },
  { id: "historico", label: "Histórico" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const EVENT_LABELS: Record<string, string> = {
  confirmation_sent: "Código de assinatura enviado",
  confirmation_send_failed: "Falha no envio da confirmação",
  confirmation_rejected: "Confirmação de assinatura recusada",
  signature_confirmed: "Assinatura confirmada",
  created: "Contrato criado",
  version_created: "Nova versão do documento",
  link_created: "Enviado para assinatura (link gerado)",
  links_revoked: "Links de assinatura cancelados",
  signed_provider: "Prestador assinou",
  signed_customer: "Contratante assinou",
  completed: "Contrato concluído",
  file_attached: "Arquivo do contrato enviado",
  signer_added: "Pessoa adicionada para assinar",
  signer_removed: "Pessoa removida",
  signer_link_created: "Link de assinatura gerado",
  signed_extra: "Testemunha/signatário assinou",
  archived: "Contrato arquivado",
  restored: "Contrato restaurado",
};

export const Route = createFileRoute("/_authenticated/contratos_/$id")({
  validateSearch: (s: Record<string, unknown>): { aba?: Tab } =>
    TABS.some((t) => t.id === s["aba"]) ? { aba: s["aba"] as Tab } : {},
  head: () => ({
    meta: [
      { title: "Contrato — WiizePay" },
      { name: "description", content: "Documento, assinaturas, auditoria e cobranças do contrato." },
      { property: "og:title", content: "Contrato — WiizePay" },
      { property: "og:description", content: "Documento, assinaturas, auditoria e cobranças do contrato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContratoDetalhe,
});

function ContratoDetalhe() {
  const { t: ui } = useTranslation("ui");
  const { id } = Route.useParams();
  const { aba = "visao" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: workspace } = useWorkspace();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data: contract, error } = await supabase
        .from("contracts")
        .select("*, customers(id, name, email), contract_services(services(id, name))")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!contract) return null;
      const [versions, sigs, events, payments, extras, files, sfields] = await Promise.all([
        supabase.from("contract_versions").select("id, version, body, content_hash, created_at").eq("contract_id", id).order("version", { ascending: false }),
        supabase.from("contract_signatures").select("id, contract_version_id, signer_role, signer_name, signer_document, signed_at, ip_address").eq("contract_id", id),
        supabase.from("contract_events").select("id, event, actor, created_at, metadata").eq("contract_id", id).order("created_at", { ascending: false }),
        supabase.from("payments").select("id, gross_amount, due_on, status, description, paid_at, services(id, name)").eq("contract_id", id).order("due_on"),
        supabase.from("contract_signers").select("id, name, email, role, token_expires_at").eq("contract_id", id).is("removed_at", null).order("created_at"),
        supabase.from("contract_files").select("version, kind, source_format, file_name, sha256, drive_file_id").eq("contract_id", id),
        supabase.from("contract_signature_fields").select("signer_key, page, x, y, w, h, version, kind").eq("contract_id", id),
      ]);
      return { contract, versions: versions.data ?? [], sigs: sigs.data ?? [], events: events.data ?? [], payments: payments.data ?? [], extras: extras.data ?? [], files: files.data ?? [], sfields: sfields.data ?? [] };
    },
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["contract", id] });
  const createLink = useServerFn(createContractLink);
  const revoke = useServerFn(revokeContractLinks);
  const newVersion = useServerFn(createContractVersion);
  const sign = useServerFn(signContractAsProvider);
  const [link, setLink] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [signerDocument, setSignerDocument] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("Link de assinatura do cliente");
  const [person, setPerson] = useState({ name: "", email: "", document: "", role: "witness" as "witness" | "signer" | "approver" });
  const pdfFn = useServerFn(downloadContractPdf);
  const addFn = useServerFn(addContractSigner);
  const removeFn = useServerFn(removeContractSigner);
  const signerLinkFn = useServerFn(createSignerLink);
  const pdfM = useMutation({
    mutationFn: (mode: "download" | "view" | "bare") => {
      const win = mode === "view" ? preparePdfWindow() : null;
      return pdfFn({ data: { contractId: id, origin: window.location.origin, bare: mode === "bare" } })
        .then((r) => ({ ...r, mode, win }))
        .catch((e) => { win?.close(); throw e; });
    },
    onSuccess: (r) => { openPdf(r.base64, r.fileName, r.mode === "view" ? "view" : "download", r.win); if (r.mode === "bare") toast.success("PDF sem assinaturas baixado e salvo no Google Drive."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addM = useMutation({
    mutationFn: () => addFn({ data: { contractId: id, ...person } }),
    onSuccess: () => { toast.success("Pessoa adicionada."); setPerson({ name: "", email: "", document: "", role: "witness" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (signerId: string) => removeFn({ data: { signerId } }),
    onSuccess: () => { toast.success("Pessoa removida."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const origFn = useServerFn(getOriginalContractPdf);
  const saveFieldsFn = useServerFn(saveSignatureFields);
  const delFn = useServerFn(deleteContractDraft);
  const [pendingLink, setPendingLink] = useState(false);
  const [placer, setPlacer] = useState<{ pdf: Uint8Array; fields: PlacedField[] } | null>(null);
  const openPlacerM = useMutation({
    mutationFn: () => origFn({ data: { contractId: id } }),
    onSuccess: (r) => {
      if (!r.base64) { toast.error("Este contrato não tem PDF original."); return; }
      const bin = atob(r.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const cur = q.data!.contract.current_version;
      setPlacer({ pdf: u, fields: q.data!.sfields.filter((f) => f.version === cur).map((f) => ({ signerKey: f.signer_key, page: f.page, x: Number(f.x), y: Number(f.y), w: Number(f.w), h: Number(f.h), kind: (f.kind === "initials" ? "initials" : "signature") as "signature" | "initials" })) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveFieldsM = useMutation({
    mutationFn: (fields: PlacedField[]) => saveFieldsFn({ data: { contractId: id, fields } }),
    onSuccess: () => { toast.success("Posições das assinaturas salvas."); setPlacer(null); refresh(); if (pendingLink) { setPendingLink(false); linkM.mutate(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: () => delFn({ data: { contractId: id } }),
    onSuccess: () => { toast.success("Rascunho excluído."); void qc.invalidateQueries({ queryKey: ["contracts"] }); void navigate({ to: "/contratos" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const signerLinkM = useMutation({
    mutationFn: (s: { id: string; name: string }) => signerLinkFn({ data: { signerId: s.id } }).then((r) => ({ ...r, name: s.name })),
    onSuccess: (r) => { setLinkTitle(`Link de assinatura de ${r.name}`); setLink(`${window.location.origin}/assinar/${r.token}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkM = useMutation({
    mutationFn: () => createLink({ data: { contractId: id } }),
    onSuccess: (r) => { setLinkTitle("Link de assinatura do cliente"); setLink(`${window.location.origin}/c/${r.token}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeM = useMutation({
    mutationFn: () => revoke({ data: { contractId: id } }),
    onSuccess: () => { toast.success("Links cancelados."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const attachFn = useServerFn(attachContractFile);
  const [verOpen, setVerOpen] = useState(false);
  const [verSource, setVerSource] = useState<"pdf" | "docx" | "text">("pdf");
  const [verFile, setVerFile] = useState<File | null>(null);
  const versionM = useMutation({
    mutationFn: async () => {
      let body = draft ?? "";
      if (verSource === "pdf") {
        if (!verFile) throw new Error("Escolha o arquivo PDF da nova versão.");
        body = `Documento em PDF anexado: ${verFile.name}. O conteúdo integral está no arquivo PDF deste contrato.`;
      } else if (verSource === "docx") {
        if (!verFile) throw new Error("Escolha o arquivo Word (.docx) da nova versão.");
        if (!body.trim()) body = await docxToText(verFile);
      }
      const r = await newVersion({ data: { contractId: id, body } });
      if (verFile && verSource !== "text") {
        await attachFn({ data: { contractId: id, fileName: verFile.name, format: verSource, base64: await fileToBase64(verFile) } });
      }
      return r;
    },
    onSuccess: async (r) => {
      toast.success(`Versão ${r.version} salva no Google Drive.`);
      setVerOpen(false); setDraft(null); setVerFile(null);
      await qc.invalidateQueries({ queryKey: ["contract", id] });
      void navigate({ search: { aba: "assinaturas" } });
      if (verSource === "pdf") { setPendingLink(true); openPlacerM.mutate(); toast.info("Marque onde cada pessoa assina; em seguida liberamos o link de assinatura."); }
      else linkM.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const signM = useMutation({
    mutationFn: () => sign({ data: { contractId: id, financialPassword: pwd, birthDate, signerDocument, signerName: workspace?.fullName ?? workspace?.email ?? "Prestador", signature } }),
    onSuccess: () => { toast.success("Assinatura registrada."); setSignOpen(false); setPwd(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <EmptyState title="Contrato não encontrado" action={<Button asChild variant="outline"><Link to="/contratos">Voltar</Link></Button>} />;

  const { contract, versions, sigs, events, payments, extras, files, sfields } = q.data;
  const EXTRA_ROLE: Record<string, string> = { witness: "Testemunha", signer: "Signatário", approver: "Aprovador" };
  const current = versions.find((v) => v.version === contract.current_version);
  const currentSigs = sigs.filter((s) => s.contract_version_id === current?.id);
  const customer = contract.customers as { id: string; name: string; email: string | null } | null;
  const services = ((contract.contract_services ?? []) as { services: { id: string; name: string } | null }[]).map((s) => s.services).filter(Boolean) as { id: string; name: string }[];
  const isOpen = !["signed", "cancelled", "expired"].includes(contract.status);
  const signers = [
    { role: "provider", title: "Contratado", fallback: workspace?.fullName ?? "Sua empresa" },
    ...(customer ? [{ role: "customer", title: "Contratante", fallback: customer.name }] : []),
    ...extras.map((e) => ({ role: `signer:${e.id}`, title: EXTRA_ROLE[e.role] ?? "Signatário", fallback: e.name, extraId: e.id })),
  ].map((s) => ({ ...s, extraId: (s as { extraId?: string }).extraId, sig: currentSigs.find((x) => x.signer_role === s.role) }));
  const original = files.find((f) => f.kind === "original" && f.version === contract.current_version);
  const signedFile = files.find((f) => f.kind === "signed" && f.version === contract.current_version);
  const verifyUrl = typeof window !== "undefined" ? `${window.location.origin}/verificar/${contract.verification_code}` : "";
  const done = signers.filter((s) => s.sig).length;
  // Valor atualizado: cobranças válidas ligadas ao contrato (canceladas/estornadas não contam).
  const activePays = (payments as any[]).filter((p) => !["cancelled", "refunded", "failed"].includes(p.status));
  const chargedValue = activePays.reduce((t, p) => t + Number(p.gross_amount ?? 0), 0);
  const paidValue = activePays.filter((p) => p.status === "paid").reduce((t, p) => t + Number(p.gross_amount ?? 0), 0);
  const contractValue = Math.max(Number(contract.amount ?? 0), chargedValue);
  const allServices = Array.from(new Set([...services.map((s) => s.name), ...activePays.map((p) => p.services?.name).filter(Boolean)]));


  const tone = contract.status === "signed" ? "success" : contract.status === "cancelled" ? "danger" : "warning";

  return (
    <div>
      <Link to="/contratos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />  {ui("Contratos")}
      </Link>
      <PageHeader
        title={contract.title}
        description={`${customer?.name ?? "Contrato avulso"} · versão ${contract.current_version}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={contract.archived_at ? "neutral" : tone}>{contract.archived_at ? "Arquivado" : contractStatusLabels[contract.status]}</StatusBadge>
            {contract.status === "draft" ? <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm("Excluir este rascunho?")) delM.mutate(); }} disabled={delM.isPending}><Trash2 className="mr-1.5 h-4 w-4" /> Excluir rascunho</Button> : null}
            {isOpen ? <Button onClick={() => navigate({ search: { aba: "assinaturas" } })}>Enviar para assinatura</Button> : null}
          </div>
        }
      />

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => navigate({ search: { aba: t.id } })}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${aba === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === "visao" && (
        <Panel title="Visão geral">
          <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              [ui("Cliente"), customer?.name ?? "Nenhum (avulso)"],
              [ui("Serviços"), allServices.length ? allServices.join(", ") : "—"],
              ["Duração", durationLabel(contract)],
              ["Valor do contrato", contractValue > 0 ? formatBRL(contractValue) : "—"],
              ["Recebido", formatBRL(paidValue)],
              ["Falta receber", formatBRL(Math.max(0, contractValue - paidValue))],
              ["Assinaturas", `${done} de ${signers.length}`],
              ["Início", contract.starts_on ? formatDate(contract.starts_on) : "—"],
              ["Criado em", formatDateTime(contract.created_at)],
              ["Última atualização", formatDateTime(contract.updated_at)],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>
            ))}
          </dl>
        </Panel>
      )}

      {aba === "documento" && (
        <Panel title="Documento">
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusBadge tone="neutral">Original: v1</StatusBadge>
            <StatusBadge tone={contract.sent_at || contract.status !== "draft" ? "warning" : "neutral"}>Enviado para assinatura: v{contract.current_version}</StatusBadge>
            <StatusBadge tone={contract.status === "signed" ? "success" : "neutral"}>{contract.status === "signed" ? `Assinado: v${contract.current_version}` : "Assinado: pendente"}</StatusBadge>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => pdfM.mutate("view")} disabled={pdfM.isPending}><Eye className="mr-1.5 h-4 w-4" /> Visualizar PDF</Button>
            <Button size="sm" variant="outline" onClick={() => pdfM.mutate("download")} disabled={pdfM.isPending}><Download className="mr-1.5 h-4 w-4" /> {contract.status === "signed" ? "Baixar PDF assinado" : "Baixar PDF"}</Button>
            <Button size="sm" variant="outline" onClick={() => pdfM.mutate("bare")} disabled={pdfM.isPending}><FileText className="mr-1.5 h-4 w-4" /> Baixar sem assinaturas</Button>
            {(() => {
              const cur = (files as any[]).filter((f) => f.version === contract.current_version && f.drive_file_id);
              const f = cur.find((x) => x.kind === "signed") ?? cur.find((x) => x.kind === "original");
              return f ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://drive.google.com/file/d/${encodeURIComponent(f.drive_file_id)}/view`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" /> Abrir no Google Drive</a>
                </Button>
              ) : null;
            })()}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Os arquivos deste contrato ficam no Google Drive da sua empresa. “Visualizar PDF” só monta o documento na hora para você ver, sem guardar cópia na WiizePay.</p>
          {original ? <p className="mb-3 text-xs text-muted-foreground">Arquivo original: {original.source_format === "pdf" ? "PDF" : original.source_format === "docx" ? "Word, convertido para PDF" : "Google Docs, convertido para PDF"} — {original.file_name}</p> : null}
          {original?.source_format === "pdf"
            ? <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground">Este contrato foi enviado em PDF. Use “Visualizar PDF” para ver o documento completo com a página de assinaturas.</div>
            : <div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-5 font-serif text-sm leading-relaxed">{current?.body}</div>}
          <details className="mt-3 rounded-lg border border-border px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Dados de verificação do documento</summary>
          <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Código de verificação: <strong>{contract.verification_code}</strong> · qualquer pessoa confere em <a className="text-primary underline" href={verifyUrl} target="_blank" rel="noreferrer">{verifyUrl}</a>. Impressão digital do conteúdo: <code className="break-all">{current?.content_hash}</code>{signedFile ? <> · PDF assinado: <code className="break-all">{signedFile.sha256}</code></> : null}</span>
          </p>
          </details>
        </Panel>
      )}

      {aba === "assinaturas" && (
        <Panel title="Assinaturas">
          <p className="text-sm font-medium">{done} de {signers.length} concluídas</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / signers.length) * 100}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">Ordem sugerida: contratante, testemunhas/outros e, por último, sua empresa. O contrato só fica “Assinado” quando todos assinarem.</p>
          {original?.source_format === "pdf" ? (() => {
            const cur = sfields.filter((f) => f.version === contract.current_version);
            const missing = signers.filter((s) => !cur.some((f) => f.signer_key === s.role));
            return (
              <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${missing.length ? "border-warning/40 bg-warning/10" : "border-border"}`}>
                <span>{missing.length ? `Marque no PDF onde assinam: ${missing.map((m) => m.fallback).join(", ")}. Sem isso os links não são liberados.` : `${cur.length} campo(s) de assinatura posicionados no PDF.`}</span>
                {isOpen && !currentSigs.length ? <Button size="sm" variant="outline" onClick={() => openPlacerM.mutate()} disabled={openPlacerM.isPending}>Posicionar assinaturas</Button> : null}
              </div>
            );
          })() : null}
          <ul className="mt-5 divide-y divide-border">
            {signers.map((s) => (
              <li key={s.role} className="flex items-center gap-3 py-3">
                {s.sig ? <Check className="h-5 w-5 text-primary" /> : <Circle className="h-4 w-4 fill-warning text-warning" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.sig?.signer_name ?? s.fallback}</p>
                  <p className="text-xs text-muted-foreground">{s.title} · {s.sig ? `Assinado em ${formatDateTime(s.sig.signed_at)}` : "Aguardando assinatura"}</p>
                </div>
                {!s.sig && isOpen && s.role === "provider" ? <Button size="sm" variant="outline" onClick={() => setSignOpen(true)}>Assinar</Button> : null}
                {!s.sig && isOpen && s.role === "customer" ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => linkM.mutate()} disabled={linkM.isPending}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar link / WhatsApp</Button>
                    <Button size="sm" variant="ghost" onClick={() => revokeM.mutate()} disabled={revokeM.isPending}>Cancelar link</Button>
                  </div>
                ) : null}
                {!s.sig && isOpen && s.extraId ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => signerLinkM.mutate({ id: s.extraId!, name: s.fallback })} disabled={signerLinkM.isPending}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar link / WhatsApp</Button>
                    <Button size="icon" variant="ghost" aria-label={ui("Remover")} onClick={() => removeM.mutate(s.extraId!)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {isOpen ? (
            <form className="mt-5 rounded-lg border border-border p-4" onSubmit={(e) => { e.preventDefault(); addM.mutate(); }}>
              <p className="mb-3 text-sm font-medium">Adicionar testemunha ou outro signatário</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input placeholder="Nome completo" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
                <Input type="email" placeholder="E-mail * (recebe o link)" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
                <Input placeholder="CPF (opcional)" value={person.document} onChange={(e) => setPerson({ ...person, document: e.target.value })} />
                <Select value={person.role} onValueChange={(v) => setPerson({ ...person, role: v as typeof person.role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(EXTRA_ROLE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button size="sm" type="submit" variant="outline" className="mt-3" disabled={addM.isPending || person.name.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
            </form>
          ) : null}
        </Panel>
      )}

      {aba === "auditoria" && (
        <Panel title="Auditoria">
          {events.length ? (
            <ol className="relative ml-2 border-l border-border">
              {events.map((e) => (
                <li key={e.id} className="mb-4 ml-5">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-medium">{EVENT_LABELS[e.event] ?? e.event}{e.actor ? ` — ${e.actor}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="Sem eventos registrados" />}
        </Panel>
      )}

      {aba === "cobrancas" && (
        <Panel title="Cobranças relacionadas">
          <div className="mb-3 flex justify-end">
            <Button size="sm" asChild><Link to="/cobrancas" search={{ nova: true, cliente: customer?.id, contrato: contract.id, servico: services[0]?.id }}>+ Criar cobrança</Link></Button>
          </div>
          {payments.length ? (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div><p className="font-medium">{p.description ?? "Cobrança"}</p><p className="text-xs text-muted-foreground">Vencimento {formatDate(p.due_on)}</p></div>
                  <div className="text-right"><p className="numeric-tabular font-medium">{formatBRL(p.gross_amount)}</p><StatusBadge tone={p.status === "paid" ? "success" : p.status === "overdue" ? "danger" : "neutral"}>{paymentStatusLabels[p.status]}</StatusBadge></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nenhuma cobrança ligada a este contrato" />}
        </Panel>
      )}

      {aba === "historico" && (
        <Panel title="Histórico de versões">
          <Button size="sm" className="mb-4" onClick={() => { setVerSource("pdf"); setVerFile(null); setDraft(""); setVerOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Nova versão</Button>
          <ul className="divide-y divide-border">
            {versions.map((v) => {
              const n = sigs.filter((s) => s.contract_version_id === v.id).length;
              return (
                <li key={v.id} className="flex items-center justify-between py-3 text-sm">
                  <div><p className="font-medium">Versão {v.version}{v.version === contract.current_version ? " (atual)" : ""}</p><p className="text-xs text-muted-foreground">{formatDateTime(v.created_at)}</p></div>
                  <StatusBadge tone={v.version === contract.current_version && contract.status === "signed" ? "success" : "neutral"}>{n} assinatura{n === 1 ? "" : "s"}</StatusBadge>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Dialog open={Boolean(link)} onOpenChange={(v) => !v && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{linkTitle}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Copie e envie por WhatsApp ou e-mail. O link é pessoal e vale por 7 dias.</p>
          <Input readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(link ?? ""); toast.success("Link copiado."); }}><Copy className="mr-1.5 h-4 w-4" />Copiar link</Button>
            <Button asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Olá! Segue o contrato para assinatura: ${link ?? ""}`)}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Enviar pelo WhatsApp</a></Button>
          </div>
          <p className="text-xs text-muted-foreground">Gerar um novo link cancela o anterior dessa pessoa.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={verOpen} onOpenChange={(v) => { if (!versionM.isPending) setVerOpen(v); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Nova versão do contrato</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Cria a versão {contract.current_version + 1}, salva no Google Drive e libera um novo link de assinatura. As assinaturas anteriores continuam registradas.</p>
          <div className="grid grid-cols-3 gap-2">
            {([["pdf", FileType, "PDF"], ["docx", Upload, "Word"], ["text", PenLine, "Escrever"]] as const).map(([k, Icon, l]) => (
              <button key={k} type="button" onClick={() => { setVerSource(k); setVerFile(null); setDraft(k === "text" ? current?.body ?? "" : ""); }}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors ${verSource === k ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-5 w-5" />{l}
              </button>
            ))}
          </div>
          {verSource !== "text" ? (
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border p-6 text-center text-sm hover:border-primary">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{verFile ? verFile.name : verSource === "pdf" ? "Clique para escolher o PDF" : "Clique para escolher o Word (.docx)"}</span>
              <span className="text-xs text-muted-foreground">Até 12 MB.</span>
              <input type="file" className="hidden" accept={verSource === "pdf" ? "application/pdf,.pdf" : ".docx"}
                onChange={async (e) => { const f = e.target.files?.[0] ?? null; setVerFile(f); if (f && verSource === "docx") { try { setDraft(await docxToText(f)); } catch { toast.error("Não foi possível ler este Word."); } } }} />
            </label>
          ) : null}
          {verSource === "text" || (verSource === "docx" && draft) ? (
            <div className="space-y-1.5"><Label>{verSource === "text" ? "Texto do contrato" : "Texto convertido (pode ajustar)"}</Label><Textarea rows={10} value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} /></div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVerOpen(false)} disabled={versionM.isPending}>Cancelar</Button>
            <Button onClick={() => versionM.mutate()} disabled={versionM.isPending || (verSource !== "text" ? !verFile : (draft ?? "").trim().length < 20)}>{versionM.isPending ? "Salvando..." : "Salvar e liberar assinatura"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assinar como prestador</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); signM.mutate(); }}>
            <p className="text-sm text-muted-foreground">Registramos data, versão, código do documento, IP e dispositivo.</p>
            <div className="space-y-2"><Label htmlFor="provider-document">CPF/CNPJ</Label><Input id="provider-document" required inputMode="numeric" value={signerDocument} onChange={(e) => setSignerDocument(e.target.value)} /></div>
            <BirthDateField value={birthDate} onChange={setBirthDate} />
            <SignaturePad name={workspace?.fullName ?? ""} onChange={setSignature} />
            <div className="space-y-2"><Label htmlFor="pwd">Senha financeira</Label><Input id="pwd" type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={signM.isPending || !signature || !birthDate || !signerDocument}>Confirmar assinatura</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(placer)} onOpenChange={(v) => { if (!v) setPlacer(null); }}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Onde cada pessoa assina</DialogTitle></DialogHeader>
          {placer ? <SignaturePlacer pdf={placer.pdf} signers={signers.map((s) => ({ key: s.role, label: s.fallback, role: s.title }))} value={placer.fields} onChange={(f) => setPlacer({ ...placer, fields: f })} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPlacer(null)}>Cancelar</Button>
            <Button onClick={() => placer && saveFieldsM.mutate(placer.fields)} disabled={saveFieldsM.isPending}>Salvar posições</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
