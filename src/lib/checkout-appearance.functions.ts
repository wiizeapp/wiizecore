import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { appearanceSchema, contrastIssues } from "./checkout-appearance";

type Ctx = { supabase: any; userId: string };
const EDITORS = ["owner", "admin"];

async function membership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).limit(1).maybeSingle();
  if (!data) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

export const getCheckoutAppearance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const [{ data: row }, { data: tenant }] = await Promise.all([
      admin.from("checkout_appearance_versions").select("version, settings, created_at").eq("tenant_id", m.tenant_id).order("version", { ascending: false }).limit(1).maybeSingle(),
      admin.from("tenants").select("name").eq("id", m.tenant_id).maybeSingle(),
    ]);
    const { resolveAppearance } = await import("./checkout-appearance.server");
    return {
      canEdit: EDITORS.includes(m.role),
      version: row?.version ?? 0,
      updatedAt: row?.created_at ?? null,
      companyName: (tenant as { name?: string } | null)?.name ?? "Sua empresa",
      appearance: await resolveAppearance(admin, row?.settings),
    };
  });

/** Cada salvamento cria uma nova versão; cobranças antigas mantêm a versão em que foram criadas. */
export const saveCheckoutAppearance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => appearanceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const m = await membership(ctx);
    if (!EDITORS.includes(m.role)) throw new Error("Somente dono ou administrador pode alterar o checkout.");
    if (contrastIssues(data).length) throw new Error("Esta combinação possui baixo contraste. Escolha uma cor mais legível.");
    if (data.logoPath && !data.logoPath.startsWith(`${m.tenant_id}/`)) throw new Error("Logo inválida.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const settings = { ...data, logoUrl: null };
    for (let i = 0; i < 3; i++) {
      const { data: last } = await admin.from("checkout_appearance_versions").select("version").eq("tenant_id", m.tenant_id).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = (last?.version ?? 0) + 1;
      const { error } = await admin.from("checkout_appearance_versions").insert({ tenant_id: m.tenant_id, version, settings: settings as never, created_by: ctx.userId });
      if (!error) {
        const { logAudit } = await import("./audit.server");
        await logAudit(admin, { tenantId: m.tenant_id, userId: ctx.userId, action: "checkout_appearance.saved", resource: "checkout_appearance_versions", metadata: { version } } as never);
        return { version };
      }
    }
    throw new Error("Não foi possível salvar agora. Tente novamente.");
  });

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function checkedImage(bytes: Uint8Array, declaredType: string) {
  if (bytes.length > MAX_BYTES) throw new Error("A logo otimizada deve ter no máximo 2 MB.");
  const sig = Array.from(bytes.slice(0, 12));
  const detected = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47
    ? "image/png"
    : sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff
      ? "image/jpeg"
      : sig[0] === 0x52 && sig[1] === 0x49 && sig[8] === 0x57 && sig[9] === 0x45
        ? "image/webp"
        : null;
  if (!detected || detected !== declaredType) throw new Error("Arquivo de imagem inválido.");
  return { contentType: detected, ext: TYPES[detected] };
}

async function storeLogo(admin: any, tenantId: string, bytes: Uint8Array, contentType: string) {
  const { ext } = checkedImage(bytes, contentType);
  const path = `${tenantId}/logo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await admin.storage.from("checkout-logos").upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error("Não foi possível enviar a logo.");
  const { data: signed } = await admin.storage.from("checkout-logos").createSignedUrl(path, 60 * 60);
  return { logoPath: path, logoUrl: signed?.signedUrl ?? null };
}

async function auditLogo(admin: any, tenantId: string, userId: string, action: string, logoPath: string) {
  const { logAudit } = await import("./audit.server");
  await logAudit(admin, { tenantId, userId, action, resource: "checkout_logo", metadata: { logoPath } } as never);
}

/** Recebe a logo já otimizada, confere o conteúdo real e guarda em armazenamento privado. */
export const uploadCheckoutLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ contentType: z.string(), base64: z.string().max(Math.ceil(MAX_BYTES * 1.4)) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const m = await membership(ctx);
    if (!EDITORS.includes(m.role)) throw new Error("Somente dono ou administrador pode alterar o checkout.");
    if (!TYPES[data.contentType]) throw new Error("Envie uma imagem PNG, JPG ou WebP.");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const stored = await storeLogo(admin, m.tenant_id, bytes, data.contentType);
    await auditLogo(admin, m.tenant_id, ctx.userId, "checkout_logo.uploaded", stored.logoPath);
    return stored;
  });

function allowedRemoteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Use um endereço HTTPS para a logo.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    throw new Error("Este endereço de logo não é permitido.");
  }
  return url;
}

/** Importa uma logo HTTPS para o armazenamento privado; o checkout não depende do endereço externo. */
export const importCheckoutLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ url: z.string().url().max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const m = await membership(ctx);
    if (!EDITORS.includes(m.role)) throw new Error("Somente dono ou administrador pode alterar o checkout.");
    const url = allowedRemoteUrl(data.url);
    const response = await fetch(url, { redirect: "error", headers: { accept: "image/png,image/jpeg,image/webp" } });
    if (!response.ok) throw new Error("Não foi possível baixar a logo desse endereço.");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) throw new Error("A imagem desse endereço é maior que 2 MB.");
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0] ?? "";
    if (!TYPES[contentType]) throw new Error("O endereço deve apontar para PNG, JPG ou WebP.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const stored = await storeLogo(admin, m.tenant_id, bytes, contentType);
    await auditLogo(admin, m.tenant_id, ctx.userId, "checkout_logo.imported", stored.logoPath);
    return stored;
  });

/** Remove somente uploads ainda não usados por nenhuma versão salva. */
export const discardCheckoutLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ logoPath: z.string().max(160) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const m = await membership(ctx);
    if (!EDITORS.includes(m.role) || !data.logoPath.startsWith(`${m.tenant_id}/`)) throw new Error("Logo inválida.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: versions } = await admin.from("checkout_appearance_versions").select("settings").eq("tenant_id", m.tenant_id);
    const inUse = (versions ?? []).some((row) => {
      const settings = row.settings;
      return Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && "logoPath" in settings && settings["logoPath"] === data.logoPath);
    });
    if (inUse) return { removed: false };
    const { error } = await admin.storage.from("checkout-logos").remove([data.logoPath]);
    if (error) throw new Error("Não foi possível remover a logo anterior.");
    await auditLogo(admin, m.tenant_id, ctx.userId, "checkout_logo.discarded", data.logoPath);
    return { removed: true };
  });
