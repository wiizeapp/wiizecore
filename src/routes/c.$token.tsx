import { SignaturePad, type SignatureValue } from "@/components/contracts/signature-pad";
import { SigningProgress } from "@/components/contracts/signing-progress";
import { toast } from "sonner";
import { getCustomerPdf } from "@/lib/contract-docs.functions";
import { openPdf } from "@/lib/contract-files-client";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPublicContract, signContractAsCustomer } from "@/lib/contract-links.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { Brand } from "@/components/brand";

export const Route = createFileRoute("/c/$token")({
  head: () => ({
    meta: [
      { title: "Assinatura de contrato — WiizePay" },
      { name: "description", content: "Leia e assine seu contrato de prestação de serviços com segurança." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Assinatura de contrato — WiizePay" },
      { property: "og:description", content: "Leia e assine seu contrato de prestação de serviços com segurança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicContract,
});

function PublicContract() {
  const { token } = Route.useParams();
  const fetchContract = useServerFn(getPublicContract);
  const sign = useServerFn(signContractAsCustomer);
  const pdf = useServerFn(getCustomerPdf);
  const [signerName, setSignerName] = useState("");
  const [signerDocument, setSignerDocument] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [dl, setDl] = useState(false);
  const [signature, setSignature] = useState<SignatureValue | null>(null);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["public-contract", token],
    queryFn: () => fetchContract({ data: { token } }),
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: () => sign({ data: { token, signerName, signerDocument, signature } }),
    onSuccess: (result) => { setDone(result.status); void refetch(); },
    onError: () => setDone(null),
  });

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-3 py-6 sm:px-4 sm:py-10">
      <header className="mb-8 text-center">
        <div className="flex justify-center"><Brand compact /></div>
        <p className="text-sm text-muted-foreground">Assinatura eletrônica de contrato</p>
      </header>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Carregando contrato…</p>
      ) : error || !data ? (
        <div className="surface-panel p-8 text-center">
          <h1 className="text-lg font-semibold">Link indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Não foi possível abrir este contrato."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="surface-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">{data.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.companyName} · versão {data.version} · válido até {formatDate(data.expiresAt)}
                </p>
              </div>
              <Badge variant={data.status === "signed" ? "default" : "secondary"}>
                {data.status === "signed" ? "Assinado" : "Aguardando assinaturas"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Valor</p>
                <p className="numeric-tabular font-medium">{formatBRL(data.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Início</p>
                <p className="font-medium">{data.startsOn ? formatDate(data.startsOn) : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Término</p>
                <p className="font-medium">{data.endsOn ? formatDate(data.endsOn) : "—"}</p>
              </div>
            </div>
          </div>

          <div className="surface-panel p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Texto do contrato
            </h2>
            <Button type="button" variant="outline" size="sm" className="mb-3" onClick={() => void pdf({ data: { token, origin: window.location.origin } }).then((r) => openPdf(r.base64, r.fileName, "view")).catch((e: Error) => toast.error(e.message))}>
              Ler o documento em PDF
            </Button>
            <div className="whitespace-pre-wrap rounded-md border border-border bg-background/60 p-4 text-sm leading-relaxed">
              {data.body}
            </div>
          </div>

          {done ? (
            <div className="surface-panel p-6 text-center">
              <h2 className="text-lg font-semibold text-primary">Assinatura registrada</h2>
            </div>
          ) : null}

          <SigningProgress
            items={data.progress}
            downloading={dl}
            onDownload={() => { setDl(true); void pdf({ data: { token, origin: window.location.origin } }).then((r) => openPdf(r.base64, r.fileName, "download")).catch((e: Error) => toast.error(e.message)).finally(() => setDl(false)); }}
          />

          {done ? null : data.status !== "signed" && !data.signatures.some((s) => s.role === "customer") ? (
            <form
              className="surface-panel space-y-4 p-6"
              onSubmit={(event) => {
                event.preventDefault();
                signMutation.mutate();
              }}
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Assinar como cliente
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="signer-name">Nome completo</Label>
                  <Input
                    id="signer-name"
                    required
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signer-doc">CPF ou CNPJ</Label>
                  <Input
                    id="signer-doc"
                    required
                    inputMode="numeric"
                    placeholder="Somente números"
                    value={signerDocument}
                    onChange={(e) => setSignerDocument(e.target.value)}
                  />
                </div>
              </div>
              <SignaturePad name={signerName} onChange={setSignature} />
              <p className="text-xs text-muted-foreground">
                Ao assinar, registramos data, versão, impressão digital do documento, IP e dispositivo. O CPF/CNPJ
                precisa ser o mesmo informado ao prestador.
              </p>
              {signMutation.error ? (
                <p className="text-sm text-destructive">{signMutation.error.message}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={signMutation.isPending || !signature}>
                {signMutation.isPending ? "Registrando…" : "Assinar contrato"}
              </Button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}
