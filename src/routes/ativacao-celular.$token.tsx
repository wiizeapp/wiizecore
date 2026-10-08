import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DOC_LABEL } from "@/components/activation-status";
import { finishActivationHandoff, getMobileActivation, saveMobileActivation, uploadMobileActivationDocument, verifyActivationHandoff } from "@/lib/activation-handoff.functions";
import { activationFormSchema, BRAZIL_STATES, formatBRLInput, REQUIRED_DOCS, validateActivationStep } from "@/lib/activation-validation";
import { compressActivationFile } from "@/lib/image-compression";
import { ActivationDocumentUpload } from "@/components/activation-document-upload";

export const Route = createFileRoute("/ativacao-celular/$token")({
  head: () => ({ meta: [
    { title: "Continuar ativação — WiizePay" },
    { name: "description", content: "Acesso temporário e seguro para continuar a ativação de pagamentos da WiizePay." },
    { property: "og:title", content: "Continuar ativação — WiizePay" },
    { property: "og:description", content: "Acesso temporário e seguro para continuar a ativação de pagamentos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: MobileActivationPage,
});

type Form = Record<string, string>;

function MobileActivationPage() {
  const { token } = Route.useParams();
  const verify = useServerFn(verifyActivationHandoff);
  const load = useServerFn(getMobileActivation);
  const save = useServerFn(saveMobileActivation);
  const upload = useServerFn(uploadMobileActivationDocument);
  const finish = useServerFn(finishActivationHandoff);
  const qc = useQueryClient();
  const storageKey = `wiizepay-activation-${token.slice(0, 12)}`;
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<Form>({});
  const [personType, setPersonType] = useState<"individual" | "company" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  useEffect(() => { setSessionToken(sessionStorage.getItem(storageKey)); setReady(true); }, [storageKey]);
  // Mesmo tema do computador que gerou o QR Code (?tema=light|dark).
  useEffect(() => {
    const tema = new URLSearchParams(window.location.search).get("tema");
    if (tema !== "light" && tema !== "dark") return;
    document.documentElement.classList.toggle("dark", tema === "dark");
    document.documentElement.style.colorScheme = tema;
  }, []);
  // Abre direto pelo QR Code: o próprio link é o acesso, válido por 15 minutos e uma única vez.
  const [verifyFailed, setVerifyFailed] = useState(false);
  useEffect(() => { if (ready && !sessionToken && !verifyFailed) verify({ data: { token } }).then((r) => { sessionStorage.setItem(storageKey, r.sessionToken); setSessionToken(r.sessionToken); }).catch(() => setVerifyFailed(true)); }, [ready, sessionToken, verifyFailed, token, storageKey, verify]);
  const query = useQuery({ queryKey: ["mobile-activation", sessionToken], queryFn: () => load({ data: { sessionToken: sessionToken ?? "" } }), enabled: ready && !!sessionToken, retry: false });
  // Os dados do servidor só preenchem o formulário uma vez; recarregar a lista de documentos não apaga o que foi digitado.
  const hydrated = useRef(false);
  const dirty = useRef(false);
  useEffect(() => { if (query.data && !hydrated.current) { hydrated.current = true; setForm(query.data.form); setPersonType(query.data.personType); } }, [query.data]);
  const verifyM = useMutation({ mutationFn: () => verify({ data: { token } }), onSuccess: (result) => { sessionStorage.setItem(storageKey, result.sessionToken); setSessionToken(result.sessionToken); }, onError: (error: Error) => toast.error(error.message) });
  const saveDraft = useCallback(async () => {
    if (!sessionToken || !hydrated.current) return;
    dirty.current = false;
    await save({ data: { sessionToken, personType: personType ?? "individual", form: activationFormSchema.parse(form) } });
  }, [sessionToken, personType, form, save]);
  // Salva sozinho enquanto a pessoa digita: se o celular recarregar a página ao abrir a câmera, nada se perde.
  useEffect(() => {
    if (!hydrated.current || !dirty.current) return;
    const timer = setTimeout(() => { void saveDraft().catch(() => { dirty.current = true; }); }, 800);
    return () => clearTimeout(timer);
  }, [form, saveDraft]);
  const saveM = useMutation({ mutationFn: () => saveDraft(), onSuccess: () => toast.success("Dados salvos com segurança."), onError: (error: Error) => toast.error(error.message) });
  const finishM = useMutation({ mutationFn: async () => { await saveDraft(); await finish({ data: { sessionToken: sessionToken ?? "" } }); }, onSuccess: () => { sessionStorage.removeItem(storageKey); setCompleted(true); }, onError: (error: Error) => toast.error(error.message) });
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { dirty.current = true; setForm((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const setValue = (key: string, value: string) => { dirty.current = true; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const field = (key: string, label: string, props?: React.ComponentProps<typeof Input>) => <div className="space-y-1.5"><Label htmlFor={key}>{label}</Label><Input id={key} value={form[key] ?? ""} onChange={set(key)} aria-invalid={!!errors[key]} {...props} />{errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null}</div>;
  async function onFile(kind: string, file?: File) {
    if (!file || !sessionToken) return;
    setBusyDoc(kind);
    try { await saveDraft().catch(() => undefined); const prepared = await compressActivationFile(file); if (prepared.size > 8 * 1024 * 1024) throw new Error("O arquivo deve ter até 8 MB."); const bytes = new Uint8Array(await prepared.arrayBuffer()); let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); await upload({ data: { sessionToken, kind: kind as never, mimeType: prepared.type, base64: btoa(binary) } }); await qc.invalidateQueries({ queryKey: ["mobile-activation", sessionToken] }); setErrors((current) => ({ ...current, [kind]: "" })); toast.success("Documento enviado."); } catch (error) { toast.error((error as Error).message); throw error; } finally { setBusyDoc(null); }
  }
  function validateAll() { const parsed = activationFormSchema.parse(form); const next = { ...validateActivationStep(personType, parsed, 0), ...validateActivationStep(personType, parsed, 1), ...validateActivationStep(personType, parsed, 2), ...validateActivationStep(personType, parsed, 3) }; const have = new Set(query.data?.documents.map((document) => document.kind) ?? []); for (const kind of REQUIRED_DOCS[personType === "company" ? "company" : "individual"]) if (!have.has(kind)) next[kind] = "Envie este documento obrigatório."; setErrors(next); if (Object.keys(next).length) toast.error("Confira os campos e documentos obrigatórios."); return !Object.keys(next).length; }

  if (!ready) return null;
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground"><div className="mx-auto w-full max-w-3xl"><Brand /><section className="mt-6 rounded-lg border bg-card p-5 shadow-sm sm:p-7">
    {completed ? <div className="py-12 text-center"><CheckCircle2 className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-xl font-semibold">Dados enviados</h1><p className="mt-2 text-sm text-muted-foreground">Pronto! Este acesso foi encerrado e não pode ser usado novamente. A tela do computador já foi atualizada: volte lá para conferir e enviar para análise.</p></div>
    : !sessionToken ? (verifyFailed ? <div className="mx-auto max-w-sm py-10 text-center"><LockKeyhole className="mx-auto size-10 text-destructive" /><h1 className="mt-4 text-xl font-semibold">QR Code expirado ou já usado</h1><p className="mt-2 text-sm text-muted-foreground">Por segurança, cada QR Code vale 15 minutos e funciona uma única vez. Gere um novo no computador.</p></div> : <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>)
    : query.isLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
    : query.isError ? <div className="py-10 text-center"><h1 className="font-semibold">Este acesso não está mais disponível</h1><p className="mt-2 text-sm text-muted-foreground">Gere um novo acesso no computador.</p></div>
    : <div className="space-y-7"><div><h1 className="text-xl font-semibold">Continue sua ativação</h1><p className="mt-1 text-sm text-muted-foreground">Este acesso vale por 15 minutos e permite somente preencher dados e enviar documentos.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">{field("fullName", personType === "company" ? "Seu nome completo" : "Nome completo")}{field("cpf", "CPF", { inputMode: "numeric" })}{field("birthDate", "Data de nascimento", { type: "date" })}{field("email", "E-mail", { type: "email" })}{field("phone", "Celular com DDD", { inputMode: "tel" })}{personType === "company" ? <>{field("legalName", "Razão social")}{field("tradeName", "Nome fantasia (opcional)")}{field("cnpj", "CNPJ", { inputMode: "numeric" })}{field("companyType", "Tipo de empresa")}{field("openedOn", "Data de abertura", { type: "date" })}{field("legalRepName", "Nome do responsável legal")}{field("legalRepCpf", "CPF do responsável legal", { inputMode: "numeric" })}</> : null}</div>
      <div className="grid gap-4 sm:grid-cols-2">{field("zipCode", "CEP", { inputMode: "numeric" })}{field("address", "Rua / Avenida")}{field("number", "Número")}{field("complement", "Complemento (opcional)")}{field("district", "Bairro")}{field("city", "Cidade")}<div className="space-y-1.5"><Label>Estado</Label><Select value={form['state'] ?? ""} onValueChange={(value) => setValue("state", value)}><SelectTrigger><SelectValue placeholder="Selecione o Estado" /></SelectTrigger><SelectContent>{BRAZIL_STATES.map(([uf, name]) => <SelectItem key={uf} value={uf}>{uf} — {name}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid gap-4 sm:grid-cols-2">{field("monthlyRevenue", "Faturamento mensal aproximado", { inputMode: "numeric", placeholder: "R$ 0,00", onChange: (event) => setValue("monthlyRevenue", formatBRLInput(event.target.value)) })}{field("expectedVolume", "Quanto espera receber por mês", { inputMode: "numeric", placeholder: "R$ 0,00", onChange: (event) => setValue("expectedVolume", formatBRLInput(event.target.value)) })}</div>
      <div className="space-y-1.5"><Label>O que você vende ou qual serviço presta?</Label><Textarea value={form['businessModel'] ?? ""} onChange={set("businessModel")} /></div><div className="space-y-1.5"><Label>Como seus clientes costumam pagar pelos seus serviços?</Label><Textarea value={form['paymentSources'] ?? ""} onChange={set("paymentSources")} placeholder="Ex.: Pix, boleto, cartão ou transferência." /></div>
      <div className="space-y-3"><h2 className="font-semibold">Documentos</h2><p className="text-sm text-muted-foreground">As fotos são verificadas e reduzidas antes do envio. Você também pode escolher um PDF. O comprovante de endereço é opcional.</p>{(["id_front", "id_back", "selfie", "address_proof", ...(personType === "company" ? ["company_doc", "legal_rep_doc"] : [])]).map((kind) => { const sent = query.data?.documents.some((document) => document.kind === kind); const optional = kind === "address_proof"; return <div key={kind} className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${errors[kind] ? "border-destructive" : ""}`}><div><p className="text-sm font-medium">{DOC_LABEL[kind]} {!optional ? <span className="text-destructive">*</span> : null}</p><p className={`text-xs ${errors[kind] ? "text-destructive" : "text-muted-foreground"}`}>{sent ? "Enviado — envie novamente para substituir" : errors[kind] || (optional ? "Opcional" : "Obrigatório")}</p></div><ActivationDocumentUpload kind={kind} sent={!!sent} busy={busyDoc !== null} onUpload={(file) => onFile(kind, file)} /></div>; })}</div>
      <div className="flex flex-col gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" disabled={saveM.isPending} onClick={() => { if (validateAll()) saveM.mutate(); }}>Salvar progresso</Button><Button disabled={finishM.isPending} onClick={() => { if (validateAll()) finishM.mutate(); }}>{finishM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Concluir no celular</Button></div>
    </div>}
  </section></div></main>;
}