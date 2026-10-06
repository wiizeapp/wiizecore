import { sendEmail, type EmailInput } from "./email.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** E-mails de quem administra a empresa (proprietário e administradores). */
async function tenantManagerEmails(admin: Admin, tenantId: string) {
  const { data: members } = await admin.from("tenant_members").select("user_id, role").eq("tenant_id", tenantId).in("role", ["owner", "admin"]);
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await admin.from("profiles").select("email").in("id", ids);
  return [...new Set((profiles ?? []).map((p) => p.email).filter((e): e is string => !!e))];
}

/**
 * Aviso para a empresa: sininho + e-mail para proprietário/admins.
 * Nunca lança erro — a operação financeira principal não depende do aviso.
 */
export async function notifyTenant(admin: Admin, input: {
  tenantId: string; kind: string; title: string; body: string; link?: string; dedupeKey: string;
  bell?: boolean; email?: Omit<EmailInput, "to" | "title" | "intro"> & { title?: string; intro?: string };
}) {
  try {
    if (input.bell !== false) {
      await admin.from("notifications").insert({ tenant_id: input.tenantId, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null });
    }
    if (input.email) {
      const to = await tenantManagerEmails(admin, input.tenantId);
      await sendEmail(admin, {
        tenantId: input.tenantId, kind: input.kind, dedupeKey: input.dedupeKey,
        email: { title: input.title, intro: input.body, ...(input.link ? { cta: { label: "Abrir na WiizePay", url: input.link } } : {}), ...input.email, to },
      });
    }
  } catch (e) {
    console.error("notify", input.kind, e instanceof Error ? e.message : "falhou");
  }
}

/** Aviso para a equipe interna da WiizePay (painel administrativo). */
export async function notifyPlatform(admin: Admin, input: { tenantId: string | null; kind: string; title: string; body: string; link?: string }) {
  try {
    await admin.from("platform_notifications").insert({ tenant_id: input.tenantId, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null });
  } catch { /* não bloqueia */ }
}

/** E-mail direto para uma pessoa de fora (cliente pagador, contratante, testemunha). */
export async function emailPerson(admin: Admin, input: { tenantId: string; kind: string; dedupeKey: string; email: EmailInput }) {
  try {
    await sendEmail(admin, input);
  } catch (e) {
    console.error("email", input.kind, e instanceof Error ? e.message : "falhou");
  }
}

export async function tenantName(admin: Admin, tenantId: string) {
  const { data } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  return data?.name ?? "WiizePay";
}
