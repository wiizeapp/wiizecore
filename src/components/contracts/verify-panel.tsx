import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileSearch, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyContract } from "@/lib/contract-docs.functions";
import { sha256File } from "@/lib/contract-files-client";
import { formatDateTime } from "@/lib/format";

const STATUS: Record<string, string> = { signed: "Assinado por todas as partes", draft: "Rascunho", awaiting_customer: "Aguardando assinaturas", awaiting_provider: "Aguardando assinatura do prestador", cancelled: "Cancelado", expired: "Expirado" };

export function VerifyPanel({ initialCode }: { initialCode?: string }) {
  const verify = useServerFn(verifyContract);
  const [code, setCode] = useState(initialCode ?? "");
  const m = useMutation({ mutationFn: (input: { code?: string; sha256?: string }) => verify({ data: input }) });
  useEffect(() => { if (initialCode) m.mutate({ code: initialCode }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialCode]);

  const r = m.data;
  return (
    <div className="space-y-5">
      <form className="surface-panel space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); m.mutate({ code }); }}>
        <label className="text-sm font-medium" htmlFor="code">Código de verificação</label>
        <div className="flex gap-2">
          <Input id="code" placeholder="Ex.: 3F9A1C0B7D2E" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" disabled={m.isPending || code.length < 6}>Verificar</Button>
        </div>
        <div className="relative py-2 text-center text-xs text-muted-foreground">ou</div>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm hover:border-primary">
          <FileSearch className="h-5 w-5 text-primary" /> Enviar o PDF para conferir se é o original
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            m.mutate({ sha256: await sha256File(f) });
          }} />
        </label>
        <p className="text-xs text-muted-foreground">O arquivo não sai do seu aparelho: calculamos apenas sua impressão digital para comparar.</p>
      </form>

      {m.isError ? <div className="surface-panel p-5 text-sm">{(m.error as Error).message}</div> : null}
      {r && !r.found ? (
        <div className="surface-panel flex items-start gap-3 p-5 text-sm"><XCircle className="h-6 w-6 shrink-0 text-destructive" />
          <div><p className="font-medium">Documento não encontrado</p><p className="text-muted-foreground">O código não existe ou o arquivo foi alterado depois de gerado pela Wiize Core.</p></div></div>
      ) : null}
      {r && r.found ? (
        <div className="surface-panel overflow-hidden text-sm">
          <div className={`flex items-start gap-3 border-b border-border p-6 ${r.status === "signed" ? "bg-primary/10" : "bg-warning/10"}`}>
            {r.status === "signed" ? <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" /> : <ShieldCheck className="h-8 w-8 shrink-0 text-warning" />}
            <div className="min-w-0">
              <p className={`text-xs font-semibold uppercase tracking-wider ${r.status === "signed" ? "text-primary" : "text-warning"}`}>{r.status === "signed" ? "Documento autêntico" : "Documento em andamento"}</p>
              <p className="mt-1 text-lg font-semibold">{r.title}</p>
              <p className="font-medium">{STATUS[r.status] ?? r.status}{r.signedAt ? ` em ${formatDateTime(r.signedAt)}` : ""}</p>
              {r.fileMatch === "signed" ? <p className="mt-1 text-primary">O arquivo enviado é idêntico ao PDF assinado original.</p> : null}
              {r.fileMatch === "original" ? <p className="mt-1 text-muted-foreground">O arquivo enviado é o documento original (antes das assinaturas).</p> : null}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-b border-border p-6 sm:grid-cols-3">
            <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Emitente</dt><dd className="mt-1 font-medium">{r.company}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Versão</dt><dd className="mt-1 font-medium">v{r.version}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Código</dt><dd className="mt-1 font-mono font-medium">{r.code}</dd></div>
          </dl>
          <div className="p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signatários</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {r.signatures.length ? r.signatures.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 p-3">
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><span>{s.name} <span className="text-muted-foreground">· {s.role}</span></span></span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(s.at)}</span>
                </li>
              )) : <li className="p-3 text-muted-foreground">Nenhuma assinatura ainda.</li>}
            </ul>
            <div className="mt-4 rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Impressão digital do conteúdo (SHA-256)</p>
              <p className="mt-1 break-all font-mono text-xs">{r.contentHash}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
