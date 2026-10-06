import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ReceiptData = {
  number: string;
  provider: { name: string; legalName: string | null; document: string | null; email: string | null; phone: string | null; address: string | null };
  customer: { name: string; document: string | null; email: string | null; phone: string | null; address: string | null };
  description: string;
  amount: number;
  paidAt: string | null;
  method: string | null;
  installment: string | null;
  logoUrl: string | null;
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");
const methodName = (m: string | null) => (m === "pix" ? "Pix" : m === "boleto" ? "Boleto" : m === "credit_card" ? "Cartão de crédito" : m === "debit_card" ? "Cartão de débito" : "—");
function fmtDoc(d: string | null) {
  const s = (d ?? "").replace(/\D/g, "");
  if (s.length === 11) return { label: "CPF", value: s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") };
  if (s.length === 14) return { label: "CNPJ", value: s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") };
  return { label: "CPF/CNPJ", value: d || "—" };
}
function fmtPhone(p: string | null) {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  if (iso.length <= 10 || /T00:00(:00)?/.test(iso)) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
// Fontes padrão do PDF só aceitam o alfabeto latino básico.
const safe = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");

export async function buildReceiptPdf(r: ReceiptData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo ${r.number}`);
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.11, 0.15), muted = rgb(0.42, 0.45, 0.5), line = rgb(0.88, 0.89, 0.91), green = rgb(0.06, 0.6, 0.38);
  const L = 56, R = 539;
  let y = 780;
  const text = (t: string, x: number, yy: number, size = 10, f = font, color = ink) => page.drawText(safe(t), { x, y: yy, size, font: f, color });
  const right = (t: string, yy: number, size = 10, f = font, color = ink) => text(t, R - f.widthOfTextAtSize(safe(t), size), yy, size, f, color);
  const hr = (yy: number) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.7, color: line });

  text("RECIBO DE PAGAMENTO", L, y, 9, bold, muted);
  right(`Nº ${r.number}`, y, 9, font, muted);
  y -= 30;
  text(r.provider.legalName || r.provider.name, L, y, 18, bold);
  y -= 16;
  const pd = fmtDoc(r.provider.document);
  if (r.provider.document) { text(`${pd.label}: ${pd.value}`, L, y, 10, font, muted); y -= 14; }
  y -= 22;
  page.drawRectangle({ x: L, y: y - 62, width: R - L, height: 78, color: rgb(0.96, 0.98, 0.97), borderColor: line, borderWidth: 0.7 });
  text("Valor pago", L + 18, y - 6, 10, font, muted);
  text(brl(r.amount), L + 18, y - 40, 26, bold);
  text("PAGO", R - 18 - bold.widthOfTextAtSize("PAGO", 10), y - 6, 10, bold, green);
  y -= 92;

  const pc = fmtDoc(r.customer.document);
  const amountWords = `${brl(r.amount)}`;
  const para = `Recebemos de ${r.customer.name}, ${pc.label} ${pc.value}, a importância de ${amountWords}, referente a ${r.description}${r.installment ? ` (${r.installment})` : ""}.`;
  // quebra simples de linha
  const words = safe(para).split(" ");
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, 11) > R - L) { text(cur, L, y, 11); y -= 16; cur = w; } else cur = next;
  }
  if (cur) { text(cur, L, y, 11); y -= 16; }
  y -= 20;

  const row = (k: string, v: string) => {
    hr(y + 14);
    text(k, L, y, 10, font, muted);
    let val = safe(v);
    const full = val;
    while (val.length > 3 && font.widthOfTextAtSize(val, 10) > 330) val = val.slice(0, -1);
    if (val !== full) val = `${val.slice(0, -3)}...`;
    right(val, y, 10, bold);
    y -= 20;
  };
  const section = (title: string) => { y -= 6; text(title.toUpperCase(), L, y, 9, bold, green); y -= 22; };
  const opt = (k: string, v: string | null) => { if (v) row(k, v); };

  section("Dados do pagador");
  row("Nome", r.customer.name);
  row(pc.label, pc.value);
  opt("E-mail", r.customer.email);
  opt("Telefone", fmtPhone(r.customer.phone));
  opt("Endereço", r.customer.address);
  hr(y + 14);
  y -= 14;

  section("Dados do recebedor");
  row(r.provider.document && r.provider.document.replace(/\D/g, "").length === 11 ? "Nome" : "Empresa", r.provider.legalName || r.provider.name);
  if (r.provider.legalName && r.provider.legalName !== r.provider.name) row("Nome fantasia", r.provider.name);
  if (r.provider.document) row(pd.label, pd.value);
  opt("E-mail", r.provider.email);
  opt("Telefone", fmtPhone(r.provider.phone));
  opt("Endereço", r.provider.address);
  hr(y + 14);
  y -= 14;

  section("Dados do pagamento");
  row("Descrição", r.description);
  opt("Parcela", r.installment);
  row("Forma de pagamento", methodName(r.method));
  row("Data do pagamento", fmtDate(r.paidAt));
  row("Valor", brl(r.amount));
  hr(y + 14);

  // Rodapé: logo do checkout + "processado por WiizePay"
  let fy = 40;
  if (r.logoUrl) {
    try {
      const res = await fetch(r.logoUrl);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const s = img.scaleToFit(120, 36);
        page.drawImage(img, { x: (595 - s.width) / 2, y: fy + 26, width: s.width, height: s.height });
      }
    } catch { /* logo opcional */ }
  }
  hr(fy + 16);
  const foot = "Pagamento processado por WiizePay";
  text(foot, (595 - font.widthOfTextAtSize(foot, 9)) / 2, fy, 9, font, muted);
  const em = `Emitido em ${fmtDate(new Date().toISOString())}`;
  text(em, (595 - font.widthOfTextAtSize(safe(em), 8)) / 2, fy - 13, 8, font, muted);

  return pdf.save();
}

type ReceiptAdmin = { from: (t: string) => any; storage: any };
type Addr = { address: string | null; address_number: string | null; district: string | null; city: string | null; state: string | null } | null;
const fmtAddr = (x: Addr) => x?.address ? [`${x.address}${x.address_number ? `, ${x.address_number}` : ""}`, x.district, x.city && x.state ? `${x.city}/${x.state}` : x.city].filter(Boolean).join(" - ") : null;

/** Monta o recibo de um pagamento confirmado da empresa. Filtros extras garantem que o pedido só vê o que pode. */
export async function paymentReceipt(admin: ReceiptAdmin, input: { tenantId: string; paymentId: string; chargeGroupId?: string; customerId?: string; fallbackCustomerId?: string | null; fallbackServiceId?: string | null }) {
  let q = admin.from("payments")
    .select("id, customer_id, service_id, description, gross_amount, status, method, paid_at, due_on, installment_number, installment_count, checkout_appearance_version_id")
    .eq("id", input.paymentId).eq("tenant_id", input.tenantId);
  if (input.chargeGroupId) q = q.eq("charge_group_id", input.chargeGroupId);
  if (input.customerId) q = q.eq("customer_id", input.customerId);
  const { data: p } = await q.maybeSingle();
  if (!p || p.status !== "paid") throw new Error("Recibo disponível apenas para pagamentos confirmados.");
  const customerId = p.customer_id ?? input.fallbackCustomerId ?? null;
  const serviceId = p.service_id ?? input.fallbackServiceId ?? null;
  const [{ data: tenant }, { data: customer }, { data: service }, { data: appearanceRow }] = await Promise.all([
    admin.from("tenants").select("name, legal_name, document, email, phone, address, address_number, district, city, state").eq("id", input.tenantId).maybeSingle(),
    customerId ? admin.from("customers").select("name, email, phone, document, address, address_number, district, city, state").eq("id", customerId).eq("tenant_id", input.tenantId).maybeSingle() : Promise.resolve({ data: null }),
    serviceId ? admin.from("services").select("name").eq("id", serviceId).maybeSingle() : Promise.resolve({ data: null }),
    p.checkout_appearance_version_id
      ? admin.from("checkout_appearance_versions").select("settings").eq("id", p.checkout_appearance_version_id).eq("tenant_id", input.tenantId).maybeSingle()
      : admin.from("checkout_appearance_versions").select("settings").eq("tenant_id", input.tenantId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const appearance = await (await import("./checkout-appearance.server")).resolveAppearance(admin as never, appearanceRow?.settings);
  const c = customer as ({ name: string; email: string | null; phone: string | null; document: string | null } & NonNullable<Addr>) | null;
  const bytes = await buildReceiptPdf({
    number: p.id.slice(0, 8).toUpperCase(),
    provider: { name: tenant?.name || "Prestador", legalName: tenant?.legal_name ?? null, document: tenant?.document ?? null, email: tenant?.email ?? null, phone: tenant?.phone ?? null, address: fmtAddr(tenant as Addr) },
    customer: { name: c?.name ?? "Cliente", document: c?.document ?? null, email: c?.email ?? null, phone: c?.phone ?? null, address: fmtAddr(c) },
    description: p.description || service?.name || "Pagamento",
    amount: Number(p.gross_amount),
    paidAt: p.paid_at ?? p.due_on,
    method: p.method,
    installment: p.installment_count ? `${p.installment_number} de ${p.installment_count}` : null,
    logoUrl: appearance.logoUrl,
  });
  return { base64: Buffer.from(bytes).toString("base64"), fileName: `recibo-${p.id.slice(0, 8)}.pdf` };
}
