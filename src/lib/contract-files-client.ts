/** Utilidades do navegador para arquivos de contrato. */
export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function docxToText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

/** Abre uma aba vazia já no clique (evita bloqueio de pop-up enquanto o PDF é gerado). */
export function preparePdfWindow(): Window | null {
  const w = window.open("", "_blank");
  if (w) { try { w.document.title = "Gerando PDF…"; w.document.body.innerHTML = "<p style='font-family:sans-serif;padding:24px'>Gerando PDF…</p>"; } catch { /* ignore */ } }
  return w;
}

export function openPdf(base64: string, fileName: string, mode: "download" | "view" = "download", target?: Window | null) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const download = () => Object.assign(document.createElement("a"), { href: url, download: fileName }).click();
  if (mode === "view") {
    if (target && !target.closed) target.location.href = url;
    else if (!window.open(url, "_blank")) download();
  } else download();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Abre ou baixa qualquer arquivo recebido em base64. Imagens e PDF abrem para visualizar. */
export function openFile(base64: string, fileName: string, mime: string, target?: Window | null) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const viewable = mime === "application/pdf" || mime.startsWith("image/");
  const download = () => Object.assign(document.createElement("a"), { href: url, download: fileName }).click();
  if (viewable && target && !target.closed) target.location.href = url;
  else { try { target?.close(); } catch { /* */ } download(); }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
