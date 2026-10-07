import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

export const DOC_MAX_BYTES = 12 * 1024 * 1024;
export const DOC_MIMES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "Imagem",
  "image/jpeg": "Imagem",
  "image/webp": "Imagem",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Planilha",
  "application/vnd.ms-excel": "Planilha",
  "text/plain": "Texto",
  "text/csv": "Planilha",
};

async function member(supabase: { from: (t: string) => any }, userId: string, roles: string[]) {
  const { data } = await supabase.from("tenant_members").select("tenant_id, role").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(userId, "documents.view");
  if (!data) throw new Error("Empresa não encontrada.");
  if (!roles.includes(data.role)) throw new Error("Você não tem permissão para esta ação.");
  return data as { tenant_id: string; role: string };
}
const WRITE = ["owner", "admin", "finance"];
const READ = [...WRITE, "viewer"];

export const listCustomerDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ customerId: z.string().uuid().optional(), search: z.string().max(80).optional(), page: z.number().int().min(1).max(10_000).default(1), pageSize: z.number().int().min(5).max(50).default(10) }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await member(context.supabase, context.userId, READ);
    const from = (data.page - 1) * data.pageSize;
    let q = context.supabase.from("customer_documents")
      .select("id, customer_id, title, button_label, file_name, mime, size_bytes, visible_in_portal, created_at, customers(name)", { count: "exact" })
      .eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (data.customerId) q = q.eq("customer_id", data.customerId);
    const s = data.search?.trim().replace(/[%,()]/g, "");
    if (s) q = q.or(`title.ilike.%${s}%,button_label.ilike.%${s}%,file_name.ilike.%${s}%`);
    const { data: rows, count, error } = await q;
    if (error) throw new Error("Não foi possível carregar os documentos.");
    return {
      total: count ?? 0,
      canEdit: WRITE.includes(m.role),
      rows: ((rows ?? []) as any[]).map((r) => ({
        id: r.id as string, customerId: r.customer_id as string, customerName: (r.customers?.name ?? "Cliente") as string,
        title: r.title as string, buttonLabel: r.button_label as string, fileName: r.file_name as string, mime: r.mime as string,
        size: Number(r.size_bytes), visible: Boolean(r.visible_in_portal), createdAt: r.created_at as string,
      })),
    };
  });

export const uploadCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    customerId: z.string().uuid(), title: z.string().trim().min(2).max(120), buttonLabel: z.string().trim().min(2).max(60),
    fileName: z.string().trim().min(1).max(180), mime: z.string().max(120), base64: z.string().min(4).max(17_000_000), visible: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await member(context.supabase, context.userId, WRITE);
    if (!DOC_MIMES[data.mime]) throw new Error("Tipo de arquivo não aceito. Envie PDF, imagem, Word, planilha ou texto.");
    const bytes = new Uint8Array(Buffer.from(data.base64, "base64"));
    if (!bytes.length || bytes.length > DOC_MAX_BYTES) throw new Error("O arquivo precisa ter até 12 MB.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: customer } = await admin.from("customers").select("id, name").eq("id", data.customerId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!customer) throw new Error("Cliente não encontrado.");
    const d = await import("./google-drive.server");
    if (!(await d.getConnection(admin, m.tenant_id))) throw new Error("drive_required");
    const { sha256 } = await import("./contract-docs.server");
    const driveId = await d.uploadToDrive(admin, m.tenant_id, {
      rootName: "WiizePay – Clientes", folderName: `${customer.name} (${customer.id.slice(0, 8)})`,
      fileName: data.fileName.replace(/[\\/]+/g, "-"), mime: data.mime, bytes,
    });
    const { data: row, error } = await admin.from("customer_documents").insert({
      tenant_id: m.tenant_id, customer_id: customer.id, title: data.title, button_label: data.buttonLabel, file_name: data.fileName,
      drive_file_id: driveId, mime: data.mime, size_bytes: bytes.length, sha256: sha256(bytes), visible_in_portal: data.visible, created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error("Não foi possível registrar o documento.");
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "customer_document.created", resource: "customer_documents", resourceId: row.id, metadata: { customer_id: customer.id, size: bytes.length } });
    return { id: row.id as string };
  });

export const updateCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), title: z.string().trim().min(2).max(120).optional(), buttonLabel: z.string().trim().min(2).max(60).optional(), visible: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await member(context.supabase, context.userId, WRITE);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.buttonLabel !== undefined) patch["button_label"] = data.buttonLabel;
    if (data.visible !== undefined) patch["visible_in_portal"] = data.visible;
    const { data: row, error } = await admin.from("customer_documents").update(patch as never).eq("id", data.id).eq("tenant_id", m.tenant_id).select("id").maybeSingle();
    if (error || !row) throw new Error("Documento não encontrado.");
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "customer_document.updated", resource: "customer_documents", resourceId: data.id, metadata: patch });
    return { ok: true };
  });

export const deleteCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await member(context.supabase, context.userId, WRITE);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await admin.from("customer_documents").select("id, drive_file_id").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!row) throw new Error("Documento não encontrado.");
    try { await (await import("./google-drive.server")).trashOnDrive(admin, m.tenant_id, row.drive_file_id); } catch (e) { console.error("drive trash", e instanceof Error ? e.message : e); }
    await admin.from("customer_documents").delete().eq("id", row.id).eq("tenant_id", m.tenant_id);
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "customer_document.deleted", resource: "customer_documents", resourceId: row.id });
    return { ok: true };
  });

export const openCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await member(context.supabase, context.userId, READ);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await admin.from("customer_documents").select("drive_file_id, file_name, mime").eq("id", data.id).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!row) throw new Error("Documento não encontrado.");
    const bytes = await (await import("./google-drive.server")).downloadFromDrive(admin, m.tenant_id, row.drive_file_id);
    return { base64: Buffer.from(bytes).toString("base64"), fileName: row.file_name as string, mime: row.mime as string };
  });
