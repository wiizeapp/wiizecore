import { BRAND_CONFIG } from "./brand-config";
import { DEPLOY_CONFIG } from "./deploy-config";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type EmailInput = {
  to: string | string[];
  subject: string;
  title: string;
  intro: string;
  lines?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  footnote?: string;
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return u && d ? `${u.slice(0, 2)}***@${d}` : "***";
}

export function absoluteUrl(path: string) {
  return path.startsWith("http") ? path : `${DEPLOY_CONFIG.publicSiteUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Modelo HTML único da WiizePay: simples, legível e sem dados sensíveis. */
export function renderEmail(i: EmailInput) {
  const brand = BRAND_CONFIG.displayName;
  const rows = (i.lines ?? [])
    .map((l) => `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">${esc(l.label)}</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:14px;color:#111827">${esc(l.value)}</td></tr>`)
    .join("");
  const cta = i.cta
    ? `<p style="margin:28px 0"><a href="${esc(absoluteUrl(i.cta.url))}" style="background:#0f9f6e;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(i.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;font-weight:700;color:#0f9f6e;margin:0 0 24px">${esc(brand)}</p>
<h1 style="font-size:22px;color:#111827;margin:0 0 12px">${esc(i.title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px">${esc(i.intro)}</p>
${rows ? `<table style="width:100%;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin:16px 0" cellpadding="0" cellspacing="0">${rows}</table>` : ""}
${cta}
${i.footnote ? `<p style="font-size:13px;color:#6b7280;line-height:1.5">${esc(i.footnote)}</p>` : ""}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px"/>
<p style="font-size:12px;color:#9ca3af">Mensagem automática da ${esc(brand)}. Nunca pedimos senhas, códigos ou dados de cartão por e-mail.</p>
</div></body></html>`;
}

/**
 * Envia pela API da Resend com a chave própria (RESEND_API_KEY).
 * Idempotente: a mesma dedupeKey nunca envia duas vezes. Falha no e-mail nunca quebra a operação principal.
 */
export async function sendEmail(admin: Admin, opts: { tenantId: string | null; kind: string; dedupeKey: string; email: EmailInput }) {
  const to = (Array.isArray(opts.email.to) ? opts.email.to : [opts.email.to]).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (!to.length) return { skipped: true };
  const { data: row, error } = await admin
    .from("email_outbox" as never)
    .insert({ tenant_id: opts.tenantId, dedupe_key: opts.dedupeKey, kind: opts.kind, recipient_masked: to.map(maskEmail).join(", ") } as never)
    .select("id")
    .single();
  if (error || !row) return { duplicate: true };
  const id = (row as { id: string }).id;
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"] || "WiizePay <notificacoes@wiizepay.com>";
  const mark = (patch: Record<string, unknown>) => admin.from("email_outbox" as never).update(patch as never).eq("id", id);
  if (!key) {
    await mark({ status: "skipped", error_message: "RESEND_API_KEY ausente" });
    return { skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": opts.dedupeKey.slice(0, 256) },
      body: JSON.stringify({ from, to, subject: opts.email.subject, html: renderEmail(opts.email), tags: [{ name: "kind", value: opts.kind.replace(/[^a-zA-Z0-9_-]/g, "_") }] }),
    });
    const body = await res.text();
    if (!res.ok) {
      await mark({ status: "failed", error_message: `${res.status}: ${body.slice(0, 300)}` });
      return { failed: true };
    }
    const providerId = (JSON.parse(body) as { id?: string }).id ?? null;
    await mark({ status: "sent", provider_id: providerId, sent_at: new Date().toISOString() });
    return { sent: true };
  } catch (e) {
    await mark({ status: "failed", error_message: (e instanceof Error ? e.message : "erro").slice(0, 300) });
    return { failed: true };
  }
}
