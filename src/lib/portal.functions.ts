import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const keySchema = z.string().uuid();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const SESSION_MINUTES = 30;
type Admin = { from: (t: string) => any; storage: any };

async function adminClient() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Admin;
}
async function hashToken(t: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(t).digest("hex");
}
function clientIp() {
  return (getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0] || "").trim() || null;
}

/** Respostas do portal nunca podem ficar guardadas em cache de navegador ou proxy. */
function noStore() {
  try { setResponseHeader("Cache-Control", "no-store, private"); setResponseHeader("Referrer-Policy", "no-referrer"); } catch { /* fora de requisição */ }
}

/** Notas fiscais só são buscadas em endereços do provedor fiscal (evita uso do servidor para acessar outros sites). */
function isTrustedInvoiceUrl(raw: string) {
  try { const u = new URL(raw); return u.protocol === "https:" && (u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com")); } catch { return false; }
}

/** Valida a sessão do portal; tudo que o cliente vê é filtrado pela empresa e pelo cliente desta sessão. */
async function session(admin: Admin, key: string, token: string) {
  noStore();
  const { data } = await admin.from("customer_portal_sessions").select("tenant_id, customer_id, expires_at")
    .eq("token_hash", await hashToken(token)).eq("tenant_id", key).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new Error("session_expired");
  // O cliente precisa continuar existindo e ativo na empresa; caso contrário a sessão é encerrada.
  const { data: c } = await admin.from("customers").select("id, status").eq("id", data.customer_id).eq("tenant_id", key).maybeSingle();
  if (!c || c.status === "closed" || c.status === "suspended") {
    await admin.from("customer_portal_sessions").delete().eq("token_hash", await hashToken(token));
    throw new Error("session_expired");
  }
  return data as { tenant_id: string; customer_id: string };
}

async function appearanceFor(admin: Admin, tenantId: string) {
  const { data: row } = await admin.from("checkout_appearance_versions").select("settings").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(1).maybeSingle();
  return (await import("./checkout-appearance.server")).resolveAppearance(admin as never, row?.settings);
}

export const getPortalInfo = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ key: keySchema }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const { data: t } = await admin.from("tenants").select("id, name").eq("id", data.key).maybeSingle();
    if (!t) return { state: "not_found" as const };
    return { state: "ok" as const, providerName: (t.name as string) || "Prestador", appearance: await appearanceFor(admin, t.id) };
  });

export const portalLogin = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, email: z.string().trim().email().max(160), doc: z.string().regex(/^\d{6}$/) }).parse(i))
  .handler(async ({ data }) => {
    noStore();
    const admin = await adminClient();
    const { consumeRateLimit, resetRateLimit, logAudit } = await import("./audit.server");
    const email = data.email.toLowerCase();
    const ip = clientIp();
    const ident = `${data.key}:${email}`;
    const limits = await Promise.all([
      consumeRateLimit(admin as never, { scope: "portal_login", identifier: ident, maxAttempts: 5, windowSeconds: 900, blockSeconds: 900 }),
      ip ? consumeRateLimit(admin as never, { scope: "portal_login_ip", identifier: `${data.key}:${ip}`, maxAttempts: 20, windowSeconds: 900, blockSeconds: 900 }) : Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
    ]);
    const blocked = limits.find((l) => !l.allowed);
    if (blocked) throw new Error(`Muitas tentativas. Tente novamente em ${Math.ceil(blocked.retryAfterSeconds / 60)} minuto(s).`);
    const { data: rows } = await admin.from("customers").select("id, document, status").eq("tenant_id", data.key).ilike("email", email.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(20);
    const match = ((rows ?? []) as { id: string; document: string | null; status?: string; email?: string | null }[]).filter((c) => c.status !== "closed" && c.status !== "suspended").find((c) => (c.document ?? "").replace(/\D/g, "").startsWith(data.doc));
    if (!match) {
      await logAudit(admin as never, { tenantId: data.key, action: "portal.login_failed", resource: "customer_portal_sessions", metadata: { ip } });
      throw new Error("E-mail ou documento não conferem. Use o e-mail e os 6 primeiros números do CPF/CNPJ cadastrados.");
    }
    await resetRateLimit(admin as never, "portal_login", ident);
    // Limpa sessões vencidas e mantém no máximo 5 acessos abertos por cliente.
    await admin.from("customer_portal_sessions").delete().eq("customer_id", match.id).lt("expires_at", new Date().toISOString());
    const { data: open } = await admin.from("customer_portal_sessions").select("id").eq("customer_id", match.id).order("created_at", { ascending: false });
    const extra = ((open ?? []) as { id: string }[]).slice(4).map((r) => r.id);
    if (extra.length) await admin.from("customer_portal_sessions").delete().in("id", extra);
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
    const { error } = await admin.from("customer_portal_sessions").insert({
      tenant_id: data.key, customer_id: match.id, token_hash: await hashToken(token), expires_at: expiresAt, ip_address: ip, user_agent: getRequestHeader("user-agent")?.slice(0, 300) ?? null,
    });
    if (error) throw new Error("Não foi possível entrar agora. Tente novamente.");
    await logAudit(admin as never, { tenantId: data.key, action: "portal.login", resource: "customers", resourceId: match.id, metadata: { ip } });
    return { token, expiresAt };
  });

export const portalLogout = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, token: tokenSchema }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    await admin.from("customer_portal_sessions").delete().eq("token_hash", await hashToken(data.token)).eq("tenant_id", data.key);
    return { ok: true };
  });

const OPEN = ["created", "awaiting_payment", "overdue", "processing"];

export const getPortalData = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, token: tokenSchema }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const s = await session(admin, data.key, data.token);
    const [{ data: customer }, { data: payments }, { data: contracts }, { data: docs }] = await Promise.all([
      admin.from("customers").select("name, email").eq("id", s.customer_id).eq("tenant_id", s.tenant_id).maybeSingle(),
      admin.from("payments").select("id, description, status, method, gross_amount, due_on, paid_at, installment_number, installment_count, charge_group_id")
        .eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).not("status", "in", "(cancelled,failed)").order("due_on", { ascending: true }).limit(300),
      admin.from("contracts").select("id, title, status, current_version, signed_at")
        .eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).in("status", ["signed", "awaiting_customer", "awaiting_provider"]).order("created_at", { ascending: false }),
      admin.from("customer_documents").select("id, title, button_label, mime, size_bytes, created_at")
        .eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).eq("visible_in_portal", true).order("created_at", { ascending: false }),
    ]);
    const pay = (payments ?? []) as any[];
    const upcoming = pay.filter((p) => OPEN.includes(p.status)).slice(0, 12);
    const groups = [...new Set(upcoming.map((p) => p.charge_group_id).filter(Boolean))] as string[];
    const tokens = new Map<string, string>();
    if (groups.length) {
      const { data: links } = await admin.from("payment_links").select("charge_group_id, token_ciphertext, created_at").eq("tenant_id", s.tenant_id).in("charge_group_id", groups).is("revoked_at", null).order("created_at", { ascending: false });
      const { decryptSecret } = await import("./crypto.server");
      for (const l of (links ?? []) as any[]) {
        if (!l.token_ciphertext || tokens.has(l.charge_group_id)) continue;
        try { tokens.set(l.charge_group_id, decryptSecret(l.token_ciphertext)); } catch { /* ignora link antigo */ }
      }
    }
    const paidIds = pay.filter((p) => p.status === "paid").map((p) => p.id as string);
    const { data: invs } = paidIds.length
      ? await admin.from("invoices").select("id, payment_id, number").eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).eq("status", "AUTHORIZED").not("pdf_url", "is", null).in("payment_id", paidIds)
      : { data: [] };
    const invoiceByPayment = new Map(((invs ?? []) as any[]).map((i) => [i.payment_id as string, { id: i.id as string, number: (i.number ?? null) as string | null }]));
    const contractIds = ((contracts ?? []) as any[]).map((c) => c.id);
    const { data: files } = contractIds.length
      ? await admin.from("contract_files").select("contract_id, version, kind").eq("tenant_id", s.tenant_id).in("contract_id", contractIds).in("kind", ["signed", "original"])
      : { data: [] };
    const fileRows = (files ?? []) as { contract_id: string; version: number; kind: string }[];
    const mapP = (p: any) => ({ id: p.id as string, description: (p.description ?? "Pagamento") as string, status: p.status as string, method: p.method as string | null, amount: Number(p.gross_amount), dueOn: p.due_on as string, paidAt: p.paid_at as string | null, installmentNumber: p.installment_number as number | null, installmentCount: p.installment_count as number | null });
    return {
      customerName: (customer?.name ?? "Cliente") as string,
      email: (customer?.email ?? null) as string | null,
      upcoming: upcoming.map((p) => ({ ...mapP(p), payToken: p.charge_group_id ? tokens.get(p.charge_group_id) ?? null : null })),
      paid: pay.filter((p) => p.status === "paid").sort((a, b) => String(b.paid_at ?? b.due_on).localeCompare(String(a.paid_at ?? a.due_on))).map((p) => ({ ...mapP(p), invoice: invoiceByPayment.get(p.id) ?? null })),
      contracts: ((contracts ?? []) as any[]).map((c) => {
        const versions = Array.from({ length: c.current_version }, (_, i) => c.current_version - i).map((v: number) => {
          const has = (k: string) => fileRows.some((f) => f.contract_id === c.id && f.version === v && f.kind === k);
          return { version: v, signed: has("signed") || (v === c.current_version && c.status === "signed"), original: has("original") };
        }).filter((v) => v.signed || v.original);
        return { id: c.id as string, title: c.title as string, status: c.status as string, signedAt: c.signed_at as string | null, currentVersion: c.current_version as number, versions };
      }),
      documents: ((docs ?? []) as any[]).map((d) => ({ id: d.id as string, title: d.title as string, buttonLabel: d.button_label as string, mime: d.mime as string, size: Number(d.size_bytes), createdAt: d.created_at as string })),
    };
  });

export const getPortalReceipt = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, token: tokenSchema, paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const s = await session(admin, data.key, data.token);
    const { paymentReceipt } = await import("./receipt.server");
    return paymentReceipt(admin, { tenantId: s.tenant_id, paymentId: data.paymentId, customerId: s.customer_id });
  });

export const getPortalInvoice = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, token: tokenSchema, invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const s = await session(admin, data.key, data.token);
    const { data: inv } = await admin.from("invoices").select("id, number, pdf_url, status").eq("id", data.invoiceId).eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).maybeSingle();
    if (!inv || inv.status !== "AUTHORIZED" || !inv.pdf_url || !isTrustedInvoiceUrl(inv.pdf_url)) throw new Error("Nota fiscal indisponível no momento.");
    const res = await fetch(inv.pdf_url, { redirect: "error" });
    if (!res.ok) throw new Error("Não foi possível abrir a nota fiscal agora. Tente novamente em instantes.");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) throw new Error("Nota fiscal indisponível no momento.");
    const { logAudit } = await import("./audit.server");
    await logAudit(admin as never, { tenantId: s.tenant_id, action: "portal.download", resource: "invoices", resourceId: inv.id });
    return { base64: buf.toString("base64"), fileName: `nota-fiscal-${inv.number ?? inv.id.slice(0, 8)}.pdf`, mime: "application/pdf" };
  });

export const getPortalContractFile = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, token: tokenSchema, contractId: z.string().uuid(), version: z.number().int().min(1).max(10_000), kind: z.enum(["signed", "original"]) }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const s = await session(admin, data.key, data.token);
    const { data: c } = await admin.from("contracts").select("id, title, status, current_version").eq("id", data.contractId).eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado.");
    const docs = await import("./contract-docs.server");
    const { logAudit } = await import("./audit.server");
    await logAudit(admin as never, { tenantId: s.tenant_id, action: "portal.download", resource: "contracts", resourceId: c.id, metadata: { version: data.version, kind: data.kind } });
    const { data: row } = await admin.from("contract_files").select("storage_path, storage_backend, drive_file_id, file_name").eq("contract_id", c.id).eq("version", data.version).eq("kind", data.kind).maybeSingle();
    if (row) {
      const bytes = await docs.readContractFile(admin, s.tenant_id, row).catch(() => null);
      if (bytes) return { base64: Buffer.from(bytes).toString("base64"), fileName: (row.file_name as string) || `contrato_v${data.version}.pdf`, mime: "application/pdf" };
    }
    if (data.kind === "signed" && data.version === c.current_version && c.status === "signed") {
      const origin = docs.safeOrigin(new URL(getRequest().url).origin);
      const r = await docs.contractPdf(admin, c.id, origin);
      return { base64: Buffer.from(r.bytes).toString("base64"), fileName: r.fileName, mime: "application/pdf" };
    }
    throw new Error("Arquivo indisponível no momento.");
  });

export const getPortalDocument = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ key: keySchema, token: tokenSchema, id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await adminClient();
    const s = await session(admin, data.key, data.token);
    const { data: d } = await admin.from("customer_documents").select("id, drive_file_id, file_name, mime").eq("id", data.id).eq("tenant_id", s.tenant_id).eq("customer_id", s.customer_id).eq("visible_in_portal", true).maybeSingle();
    if (!d) throw new Error("Documento não encontrado.");
    const bytes = await (await import("./google-drive.server")).downloadFromDrive(admin, s.tenant_id, d.drive_file_id);
    const { logAudit } = await import("./audit.server");
    await logAudit(admin as never, { tenantId: s.tenant_id, action: "portal.download", resource: "customer_documents", resourceId: d.id });
    return { base64: Buffer.from(bytes).toString("base64"), fileName: d.file_name as string, mime: d.mime as string };
  });
