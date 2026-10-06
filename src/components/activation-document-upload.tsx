import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, FileText, FileUp, Image as ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validateActivationDocument, type DocumentQualityResult } from "@/lib/document-quality";

type Props = {
  kind: string;
  sent: boolean;
  busy: boolean;
  onUpload: (file: File) => Promise<void>;
};

export function ActivationDocumentUpload({ kind, sent, busy, onUpload }: Props) {
  const { t: ui } = useTranslation("ui");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [quality, setQuality] = useState<DocumentQualityResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const selfie = kind === "selfie";

  async function choose(file?: File) {
    if (!file) return;
    setChecking(true);
    try {
      const result = await validateActivationDocument(file, kind);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelected(file);
      setQuality(result);
      setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ui("Não foi possível validar este arquivo."));
    } finally {
      setChecking(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirm() {
    if (!selected) return;
    try {
      await onUpload(selected);
      setPreviewOpen(false);
      setSelected(null);
    } catch {
      // The parent displays the upload error and keeps the preview available for retry.
    }
  }

  return <>
    <input ref={cameraRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" capture={selfie ? "user" : "environment"} onChange={(event) => void choose(event.target.files?.[0])} />
    <input ref={fileRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void choose(event.target.files?.[0])} />
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Button type="button" variant="outline" disabled={busy || checking} onClick={() => setGuideOpen(true)}>
        {checking ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{ui("Tirar foto")}
      </Button>
      <Button type="button" variant="outline" disabled={busy || checking} onClick={() => fileRef.current?.click()}>
        <FileUp className="size-4" />{sent ? ui("Substituir arquivo") : ui("Escolher arquivo")}
      </Button>
    </div>

    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{selfie ? ui("Prepare sua selfie") : ui("Enquadre o documento")}</DialogTitle><DialogDescription>{selfie ? ui("Olhe para a câmera e segure o documento ao lado do rosto, sem cobrir seus dados.") : ui("Posicione o documento inteiro dentro da moldura, sem cortar os cantos.")}</DialogDescription></DialogHeader>
        <div className="rounded-lg bg-muted/40 p-4">
          <div className={`relative mx-auto flex items-center justify-center overflow-hidden border-2 border-dashed border-primary/70 bg-background ${selfie ? "aspect-[3/4] max-h-64 rounded-[45%]" : "aspect-[1.58/1] w-full rounded-lg"}`}>
            {selfie ? <ImageIcon className="size-14 text-primary/50" /> : <FileText className="size-14 text-primary/50" />}
            <span className="absolute left-2 top-2 size-5 border-l-2 border-t-2 border-primary" /><span className="absolute right-2 top-2 size-5 border-r-2 border-t-2 border-primary" /><span className="absolute bottom-2 left-2 size-5 border-b-2 border-l-2 border-primary" /><span className="absolute bottom-2 right-2 size-5 border-b-2 border-r-2 border-primary" />
          </div>
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground"><li>• {ui("Use boa iluminação e evite reflexos.")}</li><li>• {ui("Limpe a lente e mantenha o celular firme.")}</li><li>• {ui("Confira se todos os dados estão legíveis.")}</li></ul>
        </div>
        <Button type="button" onClick={() => { setGuideOpen(false); cameraRef.current?.click(); }}><Camera className="size-4" />{ui("Abrir câmera")}</Button>
      </DialogContent>
    </Dialog>

    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{ui("Confira antes de enviar")}</DialogTitle><DialogDescription>{ui("A pré-validação foi concluída. Confirme se a imagem está nítida e todos os dados podem ser lidos.")}</DialogDescription></DialogHeader>
        {previewUrl ? <img src={previewUrl} alt={ui("Prévia do documento")} className="max-h-[52vh] w-full rounded-lg border object-contain" /> : <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border bg-muted/30"><FileText className="size-12 text-primary" /><p className="mt-2 text-sm font-medium">{selected?.name}</p></div>}
        <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm"><CheckCircle2 className="size-5 shrink-0 text-primary" /><span>{quality?.pages ? ui("PDF válido com {{count}} página(s).", { count: quality.pages }) : ui("Resolução e iluminação aprovadas.")}</span></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}><RotateCcw className="size-4" />{ui("Refazer ou trocar")}</Button><Button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}{ui("Confirmar envio")}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}