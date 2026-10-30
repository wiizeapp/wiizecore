import { DEPLOY_CONFIG } from "./deploy-config";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createHash } from "node:crypto";

type Admin = { from: (t: string) => any; storage: any };

export const BUCKET = "contract-files";

export function sha256(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const ROLE_LABEL: Record<string, string> = {
  provider: "Contratado",
  customer: "Contratante",
  witness: "Testemunha",
  signer: "Signatário",
  approver: "Aprovador",
};

/** Mantém apenas caracteres suportados pela fonte padrão do PDF (inclui acentos). */
function clean(text: string): string {
  return text
    .replace(/\t/g, "    ")
    .replace(/\r/g, "")
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/ +/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= width) { line = test; continue; }
      if (line) out.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

const A4: [number, number] = [595.28, 841.89];
const M = 56;

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private footer: string) { this.newPage(); }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - M;
    this.page.drawText(clean(this.footer), { x: M, y: 28, size: 7.5, font: this.font, color: rgb(0.45, 0.45, 0.45) });
  }
  text(t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const f = opts.bold ? this.bold : this.font;
    for (const line of wrap(t, f, size, A4[0] - M * 2)) {
      if (this.y < M + 20) this.newPage();
      if (line) this.page.drawText(line, { x: M, y: this.y, size, font: f, color: rgb(...(opts.color ?? [0.1, 0.1, 0.1])) });
      this.y -= size * 1.45;
    }
    this.y -= opts.gap ?? 0;
  }
  rule() {
    if (this.y < M + 20) this.newPage();
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
    this.y -= 14;
  }
  space(n: number) { this.y -= n; if (this.y < M + 20) this.newPage(); }
}

export type SigField = { signerKey: string; page: number; x: number; y: number; w: number; h: number; kind?: "signature" | "initials" };
export type CertSigner = { key?: string; role: string; name: string; document?: string | null; signedAt?: string | null; ip?: string | null; signatureImage?: string | null; initialsImage?: string | null; birthDate?: string | null; authMethod?: string | null; verifiedAt?: string | null; evidenceId?: string | null };

function maskDoc(d?: string | null) {
  const v = (d ?? "").replace(/\D/g, "");
  if (!v) return "";
  return v.length === 11 ? `***.${v.slice(3, 6)}.${v.slice(6, 9)}-**` : `${v.slice(0, 2)}.***.***/${v.slice(8, 12)}-**`;
}

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " (Brasília)";
}

/**
 * Monta o PDF do contrato: usa o PDF original enviado (quando existir) ou
 * converte o texto, e acrescenta a página de assinaturas/certificado.
 */
export async function buildContractPdf(input: {
  title: string;
  companyName: string;
  version: number;
  body: string;
  originalPdf?: Uint8Array | null;
  contentHash: string;
  verificationCode: string;
  verifyUrl: string;
  signers: CertSigner[];
  completedAt?: string | null;
  fields?: SigField[];
  /** Sem assinaturas: só o documento, sem campos nem página de certificado. */
  bare?: boolean;
}): Promise<Uint8Array> {
  const doc = input.originalPdf ? await PDFDocument.load(input.originalPdf, { ignoreEncryption: true }) : await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const footer = `WiizePay · Código de verificação ${input.verificationCode} · ${input.verifyUrl}`;
  const fixed = new Date(input.completedAt ?? "2024-01-01T00:00:00Z");
  doc.setTitle(input.title);
  doc.setProducer("WiizePay");
  doc.setCreator("WiizePay Contratos");
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);

  if (input.originalPdf && input.bare) {
    // Documento original intacto.
  } else if (input.originalPdf) {
    const pages = doc.getPages();
    const total = pages.length;
    // Rodapé em TODAS as páginas: remover ou trocar páginas deixa o documento inconsistente com o código.
    pages.forEach((pg, i) => {
      const { width } = pg.getSize();
      const t = clean(`WiizePay · Código ${input.verificationCode} · Página ${i + 1} de ${total} · SHA-256 ${input.contentHash.slice(0, 16)}…`);
      pg.drawText(t, { x: Math.max(12, (width - font.widthOfTextAtSize(t, 6.5)) / 2), y: 10, size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });
    });
    const byKey = new Map(input.signers.map((s) => [s.key, s]));
    const imgCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
    const img = async (d?: string | null) => {
      if (!d) return null;
      if (!imgCache.has(d)) { try { imgCache.set(d, await doc.embedPng(Buffer.from(d.slice(22), "base64"))); } catch { return null; } }
      return imgCache.get(d) ?? null;
    };
    for (const f of input.fields ?? []) {
      const pg = pages[f.page - 1];
      const s = byKey.get(f.signerKey);
      if (!pg || !s) continue;
      const { width, height } = pg.getSize();
      const bw = f.w * width, bh = f.h * height, bx = f.x * width, by = height - f.y * height - bh;
      const signed = Boolean(s.signedAt);
      const green = rgb(0.06, 0.42, 0.29), amber = rgb(0.76, 0.5, 0.06), ink = rgb(0.12, 0.14, 0.18), grey = rgb(0.45, 0.47, 0.5);
      const initials = f.kind === "initials";
      const size = Math.max(4.2, Math.min(7, bh / (initials ? 5.5 : 6)));
      const fit = (t: string, sz: number, f2 = font) => { let v = clean(t); while (v.length > 3 && f2.widthOfTextAtSize(v, sz) > bw - 8) v = v.slice(0, -2); return v; };
      const image = signed ? await img(initials ? s.initialsImage : s.signatureImage) : null;
      if (!signed) {
        // Campo pendente: moldura tracejada discreta com rótulo.
        pg.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: rgb(1, 0.98, 0.93), opacity: 0.85, borderColor: amber, borderWidth: 0.7, borderDashArray: [2.5, 2] });
        pg.drawRectangle({ x: bx, y: by, width: 2, height: bh, color: amber });
        pg.drawText(fit(initials ? "RUBRICA" : "ASSINATURA", size + 0.5, bold), { x: bx + 6, y: by + bh - size - 4, size: size + 0.5, font: bold, color: amber });
        pg.drawText(fit(`${s.name} · pendente`, size * 0.9), { x: bx + 6, y: by + 4, size: size * 0.9, font, color: grey });
        continue;
      }
      const capH = initials ? Math.min(size * 0.7 + 2, bh * 0.18) : size * 2 + 7;
      const lineY = by + capH;
      if (image) {
        const areaH = Math.max(6, bh - capH - (initials ? 1 : 2)), areaW = bw - (initials ? 2 : 8);
        const k = Math.min(areaW / image.width, areaH / image.height);
        const iw = image.width * k, ih = image.height * k;
        pg.drawImage(image, { x: bx + (bw - iw) / 2, y: lineY + 1 + (areaH - ih) / 2, width: iw, height: ih });
      }
      // Linha de assinatura com marca de verificação à esquerda.
      pg.drawLine({ start: { x: bx + 2, y: lineY }, end: { x: bx + bw - 2, y: lineY }, thickness: 0.5, color: ink, opacity: 0.55 });
      pg.drawCircle({ x: bx + 4.5, y: lineY - size * 0.5 - 2.2, size: Math.max(1.6, size * 0.32), color: green });
      if (initials) {
        pg.drawText(fit(input.verificationCode, size * 0.65), { x: bx + 9, y: by + 1, size: size * 0.65, font, color: grey });
      } else {
        pg.drawText(fit(`${s.name} · ${ROLE_LABEL[s.role] ?? s.role}`, size, bold), { x: bx + 9, y: lineY - size - 1.5, size, font: bold, color: ink });
        pg.drawText(fit(`Assinado digitalmente · ${fmt(s.signedAt!)} · ${input.verificationCode}`, size * 0.8), { x: bx + 9, y: by + 2, size: size * 0.8, font, color: grey });
      }
    }
  } else {
    const w = new Writer(doc, font, bold, footer);
    w.text(input.title, { size: 16, bold: true, gap: 4 });
    w.text(`${input.companyName} · Versão ${input.version}`, { size: 9, color: [0.4, 0.4, 0.4], gap: 10 });
    w.rule();
    w.text(input.body, { size: 10.5 });
  }

  if (!input.bare) await drawCertificate(doc, font, bold, input);

  return await doc.save({ useObjectStreams: false });
}

/** Página de assinaturas e certificado — layout premium com marca, resumo, cartões por signatário e bloco de verificação. */
async function drawCertificate(
  doc: PDFDocument, font: PDFFont, bold: PDFFont,
  input: { title: string; companyName: string; version: number; contentHash: string; verificationCode: string; verifyUrl: string; signers: CertSigner[]; completedAt?: string | null },
) {
  const [W, H] = A4;
  const brand = rgb(0.05, 0.36, 0.25), brandSoft = rgb(0.9, 0.96, 0.93), ink = rgb(0.11, 0.13, 0.16), grey = rgb(0.43, 0.46, 0.5), line = rgb(0.86, 0.88, 0.9), amber = rgb(0.76, 0.5, 0.06), amberSoft = rgb(1, 0.96, 0.88);
  const done = Boolean(input.completedAt);
  const fitT = (t: string, sz: number, maxW: number, f = font) => { let v = clean(t); while (v.length > 3 && f.widthOfTextAtSize(v, sz) > maxW) v = v.slice(0, -2); return v === clean(t) ? v : `${v}…`; };
  const signedCount = input.signers.filter((s) => s.signedAt).length;
  let page!: PDFPage; let pageNo = 0; let y = 0;
  const { WIIZEPAY_LOGO_PNG_BASE64 } = await import("./pdf-logo.server");
  const logo = await doc.embedPng(Buffer.from(WIIZEPAY_LOGO_PNG_BASE64, "base64")).catch(() => null);

  const header = (first: boolean) => {
    page = doc.addPage(A4); pageNo++;
    page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: brand });
    page.drawRectangle({ x: 0, y: H - 95, width: W, height: 3, color: rgb(0.35, 0.8, 0.55) });
    if (logo) {
      page.drawRectangle({ x: M - 1.5, y: H - 67.5, width: 37, height: 37, color: rgb(1, 1, 1) });
      page.drawImage(logo, { x: M, y: H - 66, width: 34, height: 34 });
    } else {
      page.drawText("W", { x: M + 17 - bold.widthOfTextAtSize("W", 20) / 2, y: H - 56, size: 20, font: bold, color: rgb(1, 1, 1) });
    }
    page.drawText("WiizePay", { x: M + 44, y: H - 47, size: 16, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Assinatura eletrônica", { x: M + 44, y: H - 61, size: 8.5, font, color: rgb(0.8, 0.93, 0.86) });
    const lbl = first ? "CERTIFICADO DE ASSINATURAS" : "CERTIFICADO · CONTINUAÇÃO";
    page.drawText(lbl, { x: W - M - bold.widthOfTextAtSize(lbl, 8.5), y: H - 47, size: 8.5, font: bold, color: rgb(1, 1, 1) });
    const cd = `Código ${input.verificationCode}`;
    page.drawText(cd, { x: W - M - font.widthOfTextAtSize(cd, 8.5), y: H - 61, size: 8.5, font, color: rgb(0.8, 0.93, 0.86) });
    // Rodapé
    page.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: line });
    page.drawText(fitT(`Verifique a autenticidade em ${input.verifyUrl}`, 7.5, W - M * 2 - 60), { x: M, y: 30, size: 7.5, font, color: grey });
    const pn = `Certificado ${pageNo}`;
    page.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7.5), y: 30, size: 7.5, font, color: grey });
    y = H - 125;
  };

  header(true);
  // Título + status
  page.drawText(fitT("Página de assinaturas e certificado", 18, W - M * 2, bold), { x: M, y, size: 18, font: bold, color: ink });
  y -= 26;
  const st = done ? `Concluído · assinado por todas as partes em ${fmt(input.completedAt!)}` : `Aguardando assinaturas · ${signedCount} de ${input.signers.length} concluídas`;
  const stW = font.widthOfTextAtSize(clean(st), 8.5) + 22;
  page.drawRectangle({ x: M, y: y - 5, width: stW, height: 18, color: done ? brandSoft : amberSoft, borderColor: done ? brand : amber, borderWidth: 0.6 });
  page.drawCircle({ x: M + 9, y: y + 4, size: 2.6, color: done ? brand : amber });
  page.drawText(clean(st), { x: M + 16, y: y + 1, size: 8.5, font, color: done ? brand : amber });
  y -= 30;

  // Resumo do documento (grade 2x2)
  const boxH = 96;
  page.drawRectangle({ x: M, y: y - boxH, width: W - M * 2, height: boxH, color: rgb(0.975, 0.98, 0.985), borderColor: line, borderWidth: 0.6 });
  const colW = (W - M * 2) / 2;
  const cell = (cx: number, cy: number, k: string, v: string, b = false) => {
    page.drawText(k.toUpperCase(), { x: cx, y: cy, size: 7, font: bold, color: grey });
    page.drawText(fitT(v, 10, colW - 28, b ? bold : font), { x: cx, y: cy - 14, size: 10, font: b ? bold : font, color: ink });
  };
  cell(M + 16, y - 20, "Contrato", input.title, true);
  cell(M + colW + 8, y - 20, "Emitente", input.companyName);
  cell(M + 16, y - 58, "Versão", `v${input.version}`);
  cell(M + colW + 8, y - 58, "Código de verificação", input.verificationCode, true);
  y -= boxH + 12;
  page.drawText("IMPRESSÃO DIGITAL DO CONTEÚDO (SHA-256)", { x: M, y, size: 7, font: bold, color: grey });
  y -= 12;
  page.drawText(clean(input.contentHash), { x: M, y, size: 7.6, font, color: ink });
  y -= 28;

  page.drawText("Signatários", { x: M, y, size: 12, font: bold, color: ink });
  y -= 14;

  // Cartões em duas colunas
  const gap = 12, cw = (W - M * 2 - gap) / 2, ch = 178;
  for (let i = 0; i < input.signers.length; i++) {
    const col = i % 2;
    if (col === 0 && y - ch < 64) { header(false); }
    const s = input.signers[i]!;
    const x = M + col * (cw + gap), top = y;
    const signed = Boolean(s.signedAt);
    page.drawRectangle({ x, y: top - ch, width: cw, height: ch, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.7 });
    page.drawRectangle({ x, y: top - 3, width: cw, height: 3, color: signed ? brand : amber });
    const role = (ROLE_LABEL[s.role] ?? s.role).toUpperCase();
    page.drawText(role, { x: x + 12, y: top - 18, size: 7, font: bold, color: grey });
    const badge = signed ? "ASSINADO" : "PENDENTE";
    const bw2 = bold.widthOfTextAtSize(badge, 6.5) + 12;
    page.drawRectangle({ x: x + cw - bw2 - 10, y: top - 22, width: bw2, height: 12, color: signed ? brandSoft : amberSoft });
    page.drawText(badge, { x: x + cw - bw2 - 4, y: top - 18.5, size: 6.5, font: bold, color: signed ? brand : amber });
    // Área da assinatura
    const areaTop = top - 28, areaH = 46;
    const im = signed && s.signatureImage ? await (async () => { try { return await doc.embedPng(Buffer.from(s.signatureImage!.slice(22), "base64")); } catch { return null; } })() : null;
    if (im) {
      const k = Math.min((cw - 24) / im.width, areaH / im.height);
      page.drawImage(im, { x: x + (cw - im.width * k) / 2, y: areaTop - areaH + (areaH - im.height * k) / 2, width: im.width * k, height: im.height * k });
    } else if (!signed) {
      const t = "Aguardando assinatura";
      page.drawText(t, { x: x + (cw - font.widthOfTextAtSize(t, 8.5)) / 2, y: areaTop - areaH / 2 - 3, size: 8.5, font, color: amber });
    }
    const ly = areaTop - areaH - 4;
    page.drawLine({ start: { x: x + 12, y: ly }, end: { x: x + cw - 12, y: ly }, thickness: 0.5, color: rgb(0.6, 0.62, 0.65) });
    page.drawText(fitT(s.name, 10, cw - 24, bold), { x: x + 12, y: ly - 14, size: 10, font: bold, color: ink });
    const docStr = maskDoc(s.document);
    page.drawText(fitT(docStr ? `Documento ${docStr}` : "Documento não informado", 7.8, cw - 24), { x: x + 12, y: ly - 26, size: 7.8, font, color: grey });
    page.drawText(fitT(signed ? `Assinado em ${fmt(s.signedAt!)}` : "Assinatura pendente", 7.8, cw - 24), { x: x + 12, y: ly - 37, size: 7.8, font, color: signed ? brand : amber });
    if (signed && s.ip) page.drawText(fitT(`IP ${s.ip}`, 7.3, cw - 24), { x: x + 12, y: ly - 47, size: 7.3, font, color: grey });
    if (signed && s.birthDate) page.drawText(`Nascimento informado: ${s.birthDate.split("-").reverse().join("/")}`, { x: x + 12, y: ly - 59, size: 7.3, font, color: grey });
    if (signed) page.drawText(fitT(s.authMethod === "email_otp" ? "Confirmação: código por e-mail" : s.authMethod === "financial_password" ? "Confirmação: senha financeira" : "Registro anterior à confirmação adicional", 7.3, cw - 24), { x: x + 12, y: ly - 71, size: 7.3, font, color: grey });
    if (signed && s.verifiedAt) page.drawText(fitT(`Confirmado: ${fmt(s.verifiedAt)}`, 7.3, cw - 24), { x: x + 12, y: ly - 83, size: 7.3, font, color: grey });
    if (signed && s.evidenceId) page.drawText(fitT(`Evidência: ${s.evidenceId}`, 6.5, cw - 24), { x: x + 12, y: ly - 95, size: 6.5, font, color: grey });
    if (col === 1 || i === input.signers.length - 1) y -= ch + gap;
  }

  // Bloco de verificação + nota legal
  if (y - 82 < 64) header(false);
  y -= 4;
  page.drawRectangle({ x: M, y: y - 62, width: W - M * 2, height: 62, color: brandSoft, borderColor: brand, borderWidth: 0.6, borderOpacity: 0.4 });
  page.drawText("Como verificar este documento", { x: M + 14, y: y - 18, size: 9.5, font: bold, color: brand });
  page.drawText(fitT(`Acesse ${input.verifyUrl} e informe o código ${input.verificationCode}.`, 8.5, W - M * 2 - 28), { x: M + 14, y: y - 32, size: 8.5, font, color: ink });
  page.drawText(fitT("Qualquer alteração no arquivo muda a impressão digital e invalida a verificação.", 7.8, W - M * 2 - 28), { x: M + 14, y: y - 46, size: 7.8, font, color: grey });
  y -= 78;
  for (const l of wrap("Assinaturas eletrônicas registradas pela WiizePay com data, hora, IP, dispositivo e impressão digital do documento, nos termos da MP 2.200-2/2001 e da Lei 14.063/2020.", font, 7.5, W - M * 2)) {
    page.drawText(l, { x: M, y, size: 7.5, font, color: grey }); y -= 11;
  }
}

/** Pessoas que precisam assinar a versão atual. */
export async function requiredSigners(admin: Admin, contractId: string) {
  const { data: contract } = await admin.from("contracts").select("customer_id").eq("id", contractId).maybeSingle();
  const { data: extra } = await admin
    .from("contract_signers")
    .select("id, name, email, document, role")
    .eq("contract_id", contractId)
    .is("removed_at", null)
    .order("created_at");
  const roles = ["provider", ...(contract?.customer_id ? ["customer"] : []), ...((extra ?? []) as { id: string }[]).map((s) => `signer:${s.id}`)];
  return { roles, extra: (extra ?? []) as { id: string; name: string; email: string | null; document: string | null; role: string }[] };
}

/** Lista pública de quem já assinou e quem falta (sem e-mail/documento). */
export async function signingProgress(admin: Admin, contractId: string, versionId: string) {
  const { roles, extra } = await requiredSigners(admin, contractId);
  const { data: c } = await admin.from("contracts").select("customers(name), tenants(name)").eq("id", contractId).maybeSingle();
  const { data: sigs } = await admin.from("contract_signatures").select("signer_role, signer_name, signed_at").eq("contract_version_id", versionId);
  const byRole = new Map(((sigs ?? []) as { signer_role: string; signer_name: string; signed_at: string }[]).map((s) => [s.signer_role, s]));
  const EX: Record<string, string> = { witness: "Testemunha", signer: "Signatário", approver: "Aprovador" };
  return roles.map((r) => {
    const s = byRole.get(r);
    let label = "Contratado"; let name = (c?.tenants as { name?: string } | null)?.name ?? "Prestador";
    if (r === "customer") { label = "Contratante"; name = (c?.customers as { name?: string } | null)?.name ?? "Cliente"; }
    else if (r.startsWith("signer:")) { const e = extra.find((x) => `signer:${x.id}` === r); label = EX[e?.role ?? ""] ?? "Signatário"; name = e?.name ?? ""; }
    return { key: r, label, name: s?.signer_name ?? name, signedAt: s?.signed_at ?? null };
  });
}

/** Recalcula a situação do contrato a partir das assinaturas da versão atual. */
export async function recomputeContractStatus(admin: Admin, contractId: string, versionId: string) {
  const { roles } = await requiredSigners(admin, contractId);
  const { data: sigs } = await admin.from("contract_signatures").select("signer_role").eq("contract_version_id", versionId);
  const signed = new Set(((sigs ?? []) as { signer_role: string }[]).map((s) => s.signer_role));
  const fullySigned = roles.every((r) => signed.has(r));
  const status = fullySigned ? "signed" : !signed.has("provider") ? "awaiting_provider" : "awaiting_customer";
  await admin
    .from("contracts")
    .update({ status, signed_at: fullySigned ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", contractId);
  return { fullySigned, status };
}

/** Gera (ou reaproveita) o PDF do contrato para a versão atual. */
export async function contractPdf(admin: Admin, contractId: string, origin: string, opts: { bare?: boolean } = {}) {
  const { data: contract } = await admin
    .from("contracts")
    .select("id, tenant_id, title, status, current_version, signed_at, verification_code, customers(name, document), tenants(name, legal_name)")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) throw new Error("Contrato não encontrado.");
  const verifyUrl = `${origin}/verificar/${contract.verification_code}`;
  const fileName = `${String(contract.title).replace(/[^\wÀ-ÿ\-]+/g, "_")}_v${contract.current_version}${opts.bare ? "_sem_assinaturas" : contract.status === "signed" ? "_assinado" : ""}.pdf`;

  if (contract.status === "signed" && !opts.bare) {
    const { data: stored } = await admin.from("contract_files").select("storage_path, storage_backend, drive_file_id, sha256")
      .eq("contract_id", contractId).eq("version", contract.current_version).eq("kind", "signed").maybeSingle();
    if (stored) {
      const bytes = await readContractFile(admin, contract.tenant_id, stored).catch(() => null);
      if (bytes) return { bytes, fileName, sha256: stored.sha256 as string };
    }
  }

  const { data: version } = await admin.from("contract_versions").select("id, body, content_hash, version")
    .eq("tenant_id", contract.tenant_id).eq("contract_id", contractId).eq("version", contract.current_version).maybeSingle();
  if (!version) throw new Error("Versão do contrato não encontrada.");

  let originalPdf: Uint8Array | null = null;
  const { data: original } = await admin.from("contract_files").select("storage_path, storage_backend, drive_file_id, source_format, sha256")
    .eq("tenant_id", contract.tenant_id).eq("contract_id", contractId).eq("version", contract.current_version).eq("kind", "original").maybeSingle();
  if (original?.source_format === "pdf") {
    originalPdf = await readContractFile(admin, contract.tenant_id, original);
    if (!originalPdf) throw new Error("Não foi possível abrir o arquivo original do contrato.");
    if (sha256(originalPdf) !== version.content_hash || original.sha256 !== version.content_hash) throw new Error("Não foi possível abrir o arquivo original do contrato.");
  }

  const { extra } = await requiredSigners(admin, contractId);
  const { data: rawFields } = await admin.from("contract_signature_fields").select("signer_key, page, x, y, w, h, kind").eq("contract_id", contractId).eq("version", contract.current_version);
  const fieldRows: SigField[] = ((rawFields ?? []) as any[]).map((f) => ({ signerKey: f.signer_key, page: f.page, x: Number(f.x), y: Number(f.y), w: Number(f.w), h: Number(f.h), kind: f.kind === "initials" ? "initials" : "signature" }));
  const { data: sigs } = await admin.from("contract_signatures").select("signer_role, signer_name, signer_document, signed_at, ip_address, signature_image, initials_image, identity_enc, auth_method, verified_at, evidence_id").eq("contract_version_id", version.id).eq("tenant_id", contract.tenant_id).eq("content_hash", version.content_hash);
  const byRole = new Map(((sigs ?? []) as any[]).map((s) => [s.signer_role, s]));
  const tenantRow = contract.tenants as { name?: string; legal_name?: string | null } | null;
  const tenant = { company_name: tenantRow?.legal_name || tenantRow?.name };
  const customer = contract.customers as { name?: string; document?: string } | null;
  const certSigners: CertSigner[] = [
    { key: "provider", role: "provider", name: byRole.get("provider")?.signer_name ?? tenant?.company_name ?? "Prestador", document: byRole.get("provider")?.signer_document, signedAt: byRole.get("provider")?.signed_at, ip: byRole.get("provider")?.ip_address, signatureImage: byRole.get("provider")?.signature_image, initialsImage: byRole.get("provider")?.initials_image },
    ...(customer ? [{ key: "customer", role: "customer", name: byRole.get("customer")?.signer_name ?? customer.name ?? "Contratante", document: byRole.get("customer")?.signer_document ?? customer.document, signedAt: byRole.get("customer")?.signed_at, ip: byRole.get("customer")?.ip_address, signatureImage: byRole.get("customer")?.signature_image, initialsImage: byRole.get("customer")?.initials_image }] : []),
    ...extra.map((e) => { const s = byRole.get(`signer:${e.id}`); return { key: `signer:${e.id}`, role: e.role, name: s?.signer_name ?? e.name, document: s?.signer_document ?? e.document, signedAt: s?.signed_at, ip: s?.ip_address, signatureImage: s?.signature_image, initialsImage: s?.initials_image }; }),
  ];

  const { decryptSecret } = await import("./crypto.server");
  for (const signer of certSigners) {
    const record = byRole.get(signer.key);
    if (!record) continue;
    signer.authMethod = record.auth_method;
    signer.verifiedAt = record.verified_at;
    signer.evidenceId = record.evidence_id;
    if (record.identity_enc) {
      // Private PDF only; never included in public authenticity/progress responses.
      const identity = JSON.parse(decryptSecret(record.identity_enc)) as { birthDate?: string };
      signer.birthDate = identity.birthDate ?? null;
    }
  }

  const bytes = await buildContractPdf({
    title: contract.title,
    companyName: tenant?.company_name ?? "Prestador",
    version: version.version,
    body: version.body,
    originalPdf,
    contentHash: version.content_hash,
    verificationCode: contract.verification_code,
    verifyUrl,
    signers: certSigners,
    completedAt: contract.status === "signed" ? contract.signed_at : null,
    fields: fieldRows,
    bare: Boolean(opts.bare),
  });
  const hash = sha256(bytes);

  if (opts.bare) {
    try {
      await writeContractFile(admin, { tenantId: contract.tenant_id, contractId, title: contract.title, version: contract.current_version, kind: "unsigned", sourceFormat: "pdf", fileName, mime: "application/pdf", bytes });
    } catch (e) { console.error("unsigned pdf store", e instanceof Error ? e.message : e); }
  } else if (contract.status === "signed") {
    try {
      await writeContractFile(admin, { tenantId: contract.tenant_id, contractId, title: contract.title, version: contract.current_version, kind: "signed", sourceFormat: "pdf", fileName, mime: "application/pdf", bytes });
    } catch (e) { console.error("signed pdf store", e instanceof Error ? e.message : e); }
  }
  return { bytes, fileName, sha256: hash };
}

export function safeOrigin(origin: string | undefined): string {
  try {
    const u = new URL(origin ?? "");
    if (u.protocol === "https:" || u.hostname === "localhost") return u.origin;
  } catch { /* ignore */ }
  return DEPLOY_CONFIG.publicSiteUrl;
}

/** Confere se o contrato pode sair do rascunho: datas, e-mails e posições de assinatura. */
export async function assertReadyToSend(admin: Admin, contractId: string) {
  const { data: c } = await admin.from("contracts").select("id, starts_on, ends_on, current_version, customer_id, customers(email)").eq("id", contractId).maybeSingle();
  if (!c) throw new Error("Contrato não encontrado.");
  if (!c.starts_on || !c.ends_on) throw new Error("Informe o início e o fim (ou a duração) do contrato antes de enviar.");
  const customer = c.customers as { email?: string | null } | null;
  if (c.customer_id && !customer?.email) throw new Error("O contratante precisa ter e-mail cadastrado para assinar.");
  const { extra } = await requiredSigners(admin, contractId);
  if (extra.some((e) => !e.email)) throw new Error("Todas as pessoas que assinam precisam ter e-mail.");
  const { data: f } = await admin.from("contract_files").select("source_format").eq("contract_id", contractId).eq("version", c.current_version).eq("kind", "original").maybeSingle();
  if (f?.source_format === "pdf") {
    const { data: fields } = await admin.from("contract_signature_fields").select("signer_key, kind").eq("contract_id", contractId).eq("version", c.current_version);
    const placed = new Set(((fields ?? []) as { signer_key: string; kind: string }[]).filter((x) => x.kind !== "initials").map((x) => x.signer_key));
    const need = ["provider", ...(c.customer_id ? ["customer"] : []), ...extra.map((e) => `signer:${e.id}`)];
    if (need.some((k) => !placed.has(k))) throw new Error("Posicione no PDF ao menos um campo de assinatura para cada pessoa antes de enviar.");
  }
}

export type SignatureInput = { mode: "typed" | "drawn"; signatureImage: string; initialsImage: string };

/** Confere a imagem da assinatura/rubrica enviada pela tela (PNG pequeno em base64). */
export function parseSignatureInput(input: unknown): SignatureInput {
  const v = (input ?? {}) as Partial<SignatureInput>;
  if (v.mode !== "typed" && v.mode !== "drawn") throw new Error("Escolha como deseja assinar.");
  const png = (s: unknown, label: string) => {
    if (typeof s !== "string" || !s.startsWith("data:image/png;base64,")) throw new Error(`${label} inválida.`);
    const b64 = s.slice(22);
    if (b64.length < 200 || b64.length > 400_000) throw new Error(`${label} inválida ou muito grande.`);
    const head = Buffer.from(b64.slice(0, 12), "base64");
    if (head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) throw new Error(`${label} inválida.`);
    return s;
  };
  return { mode: v.mode, signatureImage: png(v.signatureImage, "Assinatura"), initialsImage: png(v.initialsImage, "Rubrica") };
}

export function signatureColumns(s: SignatureInput) {
  return { signature_mode: s.mode, signature_image: s.signatureImage, initials_image: s.initialsImage };
}

type FileRow = { storage_path: string; storage_backend?: string | null; drive_file_id?: string | null; tenant_id?: string };

/** Lê um arquivo do contrato, do Google Drive da empresa ou do armazenamento antigo. */
export async function readContractFile(admin: Admin, tenantId: string, row: FileRow): Promise<Uint8Array | null> {
  if (row.storage_backend === "drive" && row.drive_file_id) {
    const { downloadFromDrive } = await import("./google-drive.server");
    return downloadFromDrive(admin, tenantId, row.drive_file_id);
  }
  const { data: blob } = await admin.storage.from(BUCKET).download(row.storage_path);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** Guarda um arquivo do contrato. Com Drive conectado vai para a pasta do contrato no Drive. */
export async function writeContractFile(admin: Admin, input: {
  tenantId: string; contractId: string; title: string; version: number; kind: "original" | "signed" | "unsigned";
  sourceFormat: string; fileName: string; mime: string; bytes: Uint8Array; requireDrive?: boolean;
}) {
  const { getConnection, uploadToDrive } = await import("./google-drive.server");
  const hash = sha256(input.bytes);
  const conn = await getConnection(admin, input.tenantId);
  // Arquivos de contrato ficam somente no Google Drive da empresa.
  if (!conn) throw new Error("Conecte o Google Drive da empresa para guardar os arquivos do contrato.");
  if (input.kind === "original") {
    const { data: signed, error } = await admin.from("contract_signatures").select("id").eq("tenant_id", input.tenantId).eq("contract_id", input.contractId).limit(1);
    if (error || signed?.length) throw new Error("Contrato já assinado.");
  }
  const id = await uploadToDrive(admin, input.tenantId, {
    folderName: `${input.title} (${input.contractId.slice(0, 8)})`, fileName: input.fileName, mime: input.mime, bytes: input.bytes, replaceId: null,
  });
  const row: Record<string, unknown> = { storage_backend: "drive", drive_file_id: id, storage_path: `drive:${id}` };
  const { error } = await admin.from("contract_files").upsert({
    tenant_id: input.tenantId, contract_id: input.contractId, version: input.version, kind: input.kind,
    source_format: input.sourceFormat, file_name: input.fileName, sha256: hash, ...row,
  }, { onConflict: "contract_id,version,kind" });
  if (error) throw new Error("Não foi possível registrar o arquivo.");
  return { sha256: hash };
}

/** Sininho para a empresa a cada assinatura; ao concluir, e-mail para todas as partes. */
export async function notifyContractSigned(admin: Admin, tenantId: string, contractId: string, signerName: string, fullySigned: boolean) {
  try {
    const { notifyTenant, emailPerson, tenantName } = await import("./notify.server");
    const { data: c } = await admin.from("contracts").select("title, customers(name, email)").eq("id", contractId).maybeSingle();
    const title = c?.title ?? "Contrato";
    await notifyTenant(admin as never, {
      tenantId, kind: fullySigned ? "contract.completed" : "contract.signed", link: `/contratos/${contractId}`,
      dedupeKey: `contract.${fullySigned ? "completed" : "signed"}:${contractId}:${signerName}`,
      title: fullySigned ? "Contrato assinado por todos" : "Nova assinatura no contrato",
      body: fullySigned ? `“${title}” foi assinado por todas as partes.` : `${signerName} assinou “${title}”.`,
      ...(fullySigned ? { email: { subject: `Contrato concluído — ${title}` } } : {}),
    });
    if (!fullySigned) return;
    const company = await tenantName(admin as never, tenantId);
    const cust = c?.customers as { email?: string | null } | null;
    const { data: signers } = await admin.from("contract_signers").select("email").eq("contract_id", contractId).is("removed_at", null);
    const to = [cust?.email, ...((signers ?? []) as { email: string | null }[]).map((s) => s.email)].filter((e): e is string => !!e);
    for (const e of new Set(to)) {
      await emailPerson(admin as never, {
        tenantId, kind: "contract.completed_party", dedupeKey: `contract.completed_party:${contractId}:${e}`,
        email: { to: e, subject: `Contrato concluído — ${title}`, title: "Contrato assinado por todas as partes", intro: `O documento “${title}” de ${company} foi assinado por todos. Você pode conferir a autenticidade a qualquer momento.`, cta: { label: "Verificar documento", url: "/verificar" } },
      });
    }
  } catch (e) {
    console.error("contract notify", e instanceof Error ? e.message : "falhou");
  }
}
