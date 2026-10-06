export type DocumentQualityResult = {
  width?: number;
  height?: number;
  pages?: number;
};

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler esta imagem.")); };
    image.src = url;
  });
}

async function validateImage(file: File, kind: string): Promise<DocumentQualityResult> {
  const image = await loadImage(file);
  const minSide = kind === "selfie" ? 640 : 720;
  if (Math.min(image.naturalWidth, image.naturalHeight) < minSide) {
    throw new Error("A imagem tem baixa resolução. Aproxime a câmera e tire outra foto.");
  }
  const ratio = image.naturalWidth / image.naturalHeight;
  if (kind !== "selfie" && (ratio < 0.5 || ratio > 2.2)) {
    throw new Error("O documento parece cortado. Enquadre os quatro cantos e tente novamente.");
  }

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 420 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível analisar a qualidade da imagem.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let brightness = 0;
  let edges = 0;
  let samples = 0;
  const luminance = (index: number) => (pixels[index] ?? 0) * 0.299 + (pixels[index + 1] ?? 0) * 0.587 + (pixels[index + 2] ?? 0) * 0.114;
  for (let y = 1; y < canvas.height - 1; y += 2) {
    for (let x = 1; x < canvas.width - 1; x += 2) {
      const index = (y * canvas.width + x) * 4;
      const current = luminance(index);
      brightness += current;
      edges += Math.abs(current - luminance(index + 4)) + Math.abs(current - luminance(index + canvas.width * 4));
      samples++;
    }
  }
  const averageBrightness = brightness / Math.max(1, samples);
  const edgeScore = edges / Math.max(1, samples);
  if (averageBrightness < 38) throw new Error("A foto está muito escura. Use um local mais iluminado e tente novamente.");
  if (averageBrightness > 238) throw new Error("A foto está clara demais ou com reflexo. Mude o ângulo e tente novamente.");
  if (edgeScore < 7) throw new Error("A foto parece desfocada. Limpe a lente, mantenha o celular firme e tente novamente.");
  return { width: image.naturalWidth, height: image.naturalHeight };
}

async function validatePdf(file: File): Promise<DocumentQualityResult> {
  if (file.size < 10_000) throw new Error("Este PDF parece vazio ou incompleto.");
  const header = new TextDecoder().decode((await file.slice(0, 5).arrayBuffer()));
  if (header !== "%PDF-") throw new Error("O arquivo selecionado não é um PDF válido.");
  const { PDFDocument } = await import("pdf-lib");
  let pages = 0;
  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
    pages = pdf.getPageCount();
  } catch {
    throw new Error("Não foi possível abrir o PDF. Verifique se ele não está protegido ou corrompido.");
  }
  if (pages < 1) throw new Error("Este PDF não possui páginas.");
  if (pages > 20) throw new Error("O PDF deve ter no máximo 20 páginas.");
  return { pages };
}

export async function validateActivationDocument(file: File, kind: string): Promise<DocumentQualityResult> {
  if (file.size === 0) throw new Error("O arquivo selecionado está vazio.");
  if (file.size > 8 * 1024 * 1024) throw new Error("O arquivo deve ter até 8 MB.");
  if (file.type === "application/pdf") return validatePdf(file);
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return validateImage(file, kind);
  throw new Error("Use uma foto JPG, PNG, WEBP ou um arquivo PDF.");
}