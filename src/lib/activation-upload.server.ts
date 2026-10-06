export const ACTIVATION_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 8 * 1024 * 1024;

export async function storeActivationDocument(admin: any, tenantId: string, userId: string, data: { kind: string; mimeType: string; base64: string }) {
  const ext = ACTIVATION_MIME[data.mimeType];
  if (!ext) throw new Error("Envie uma imagem JPG, PNG, WEBP ou um PDF.");
  const bytes = Buffer.from(data.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error("O arquivo deve ter até 8 MB.");
  const sig = bytes.subarray(0, 12).toString("hex");
  const valid = (ext === "jpg" && sig.startsWith("ffd8ff")) || (ext === "png" && sig.startsWith("89504e47")) ||
    (ext === "pdf" && sig.startsWith("25504446")) || (ext === "webp" && sig.startsWith("52494646") && sig.slice(16, 24) === "57454250");
  if (!valid) throw new Error("O conteúdo do arquivo não corresponde ao formato informado.");
  const { data: activation } = await admin.from("payment_activations").select("status").eq("tenant_id", tenantId).single();
  if (!activation || !["not_started", "draft", "in_progress", "action_required"].includes(activation.status)) throw new Error("O cadastro não pode ser alterado neste momento.");
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("kyc-documents").upload(path, bytes, { contentType: data.mimeType, upsert: false });
  if (error) throw new Error("Não foi possível enviar o arquivo.");
  const { data: old } = await admin.from("activation_documents").select("id, storage_path").eq("tenant_id", tenantId).eq("kind", data.kind);
  if (old?.length) {
    await admin.storage.from("kyc-documents").remove(old.map((item: { storage_path: string }) => item.storage_path));
    await admin.from("activation_documents").delete().in("id", old.map((item: { id: string }) => item.id));
  }
  const { error: insertError } = await admin.from("activation_documents").insert({ tenant_id: tenantId, kind: data.kind, storage_path: path, mime_type: data.mimeType, size_bytes: bytes.length, uploaded_by: userId });
  if (insertError) throw new Error("Não foi possível registrar o arquivo.");
  if (activation.status === "not_started") await admin.from("payment_activations").update({ status: "in_progress" }).eq("tenant_id", tenantId);
}