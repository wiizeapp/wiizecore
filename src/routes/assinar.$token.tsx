import { SealFooter } from "@/components/financial-provider";
import { SigningProgress } from "@/components/contracts/signing-progress";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Eye, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSignerPdf, getSignerView, signAsExtraSigner } from "@/lib/contract-docs.functions";
import { SignaturePad, type SignatureValue } from "@/components/contracts/signature-pad";
import { openPdf } from "@/lib/contract-files-client";
import { formatDateTime } from "@/lib/format";

const ROLE: Record<string, string> = { witness: "testemunha", signer: "signatário", approver: "aprovador" };

export const Route = createFileRoute("/assinar/$token")({
  head: () => ({
    meta: [
      { title: "Assinar contrato — Wiize Core" },
      { name: "description", content: "Leia e assine eletronicamente o contrato enviado para você." },
      { property: "og:title", content: "Assinar contrato — Wiize Core" },
      { property: "og:description", content: "Leia e assine eletronicamente o contrato enviado para você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssinarPage,
});

function AssinarPage() {
  const { token } = Route.useParams();
  const view = useServerFn(getSignerView);
  const pdf = useServerFn(getSignerPdf);
  const sign = useServerFn(signAsExtraSigner);
  const q = useQuery({ queryKey: ["signer", token], queryFn: () => view({ data: { token } }), retry: false });
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [ok, setOk] = useState(false);
  const [signature, setSignature] = useState<SignatureValue | null>(null);

  const pdfM = useMutation({
    mutationFn: () => pdf({ data: { token, origin: window.location.origin } }),
    onSuccess: (r) => openPdf(r.base64, r.fileName, "view"),
    onError: (e: Error) => toast.error(e.message),
  });
  const dlM = useMutation({
    mutationFn: () => pdf({ data: { token, origin: window.location.origin } }),
    onSuccess: (r) => openPdf(r.base64, r.fileName, "download"),
    onError: (e: Error) => toast.error(e.message),
  });
  const signM = useMutation({
    mutationFn: () => sign({ data: { token, signerName: name, signerDocument: doc, accepted: ok, signature } }),
    onSuccess: () => { toast.success("Assinatura registrada."); void q.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="min-h-screen bg-background px-3 py-6 text-foreground sm:px-4 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <p className="text-sm font-semibold text-primary">Wiize Core · Assinatura eletrônica</p>
        {q.isLoading ? <div className="skeleton-shimmer h-40 rounded-xl" /> : q.isError ? (
          <div className="surface-panel p-6 text-sm">{(q.error as Error).message}</div>
        ) : q.data ? (
          <>
            <div className="surface-panel p-6">
              <h1 className="font-display text-2xl font-semibold">{q.data.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Enviado por {q.data.companyName}. Você foi convidado(a) como {ROLE[q.data.role] ?? "signatário"}.</p>
              <Button variant="outline" className="mt-4" onClick={() => pdfM.mutate()} disabled={pdfM.isPending}>
                <Eye className="mr-1.5 h-4 w-4" /> {pdfM.isPending ? "Abrindo..." : "Ler o documento em PDF"}
              </Button>
              {q.data.body ? <div className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed">{q.data.body}</div> : null}
            </div>
            {q.data.signedAt ? (
              <div className="surface-panel flex items-center gap-3 p-4 text-sm sm:p-6">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" />
                <span>Você assinou em {formatDateTime(q.data.signedAt)}.</span>
              </div>
            ) : null}
            <SigningProgress items={q.data.progress} downloading={dlM.isPending} onDownload={() => dlM.mutate()} />
            {q.data.signedAt ? null : (
              <form className="surface-panel space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); signM.mutate(); }}>
                <div className="space-y-2"><Label htmlFor="n">Nome completo</Label><Input id="n" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="d">CPF ou CNPJ</Label><Input id="d" required inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
                <SignaturePad name={name || q.data.name} onChange={setSignature} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 accent-primary" checked={ok} onChange={(e) => setOk(e.target.checked)} />
                  Li o documento e concordo em assiná-lo eletronicamente.
                </label>
                <Button type="submit" className="w-full" disabled={!ok || !signature || signM.isPending}>{signM.isPending ? "Assinando..." : "Assinar"}</Button>
                <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />Registramos data, hora, IP, dispositivo e a impressão digital do documento.</p>
              </form>
            )}
          </>
        ) : null}
      </div>
      <SealFooter className="mt-10" />
    </main>
  );
}
