import { requireModulePerm } from "./member-access.server";
import { getTenantProvider } from "./billing.server";
import { logAudit } from "./audit.server";
import { defenseEditable, disputeConfirmed, validateDefenseFile } from "./chargeback-rules";
import { ProviderRequestError } from "./asaas.server";

const BUCKET = "chargeback-documents";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export async function caseAccess(userId: string, id: string, edit = false) {
  const member = await requireModulePerm(userId, edit ? "charges.edit" : "charges.view");
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: c, error } = await admin.from("chargeback_cases").select("*").eq("tenant_id", member.tenantId).eq("id", id).maybeSingle();
  if (error || !c) throw new Error("Contestação não encontrada.");
  return { admin, c, member };
}
export async function readCases(userId: string, page: number) {
  const member = await requireModulePerm(userId, "charges.view");
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data, error, count } = await admin.from("chargeback_cases").select("id, amount, status, internal_status, reason, dispute_deadline, provider_payment_id, defense_state", { count: "exact" }).eq("tenant_id", member.tenantId).order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("Não foi possível consultar as contestações.");
  return { cases: (data ?? []).map((c) => ({ ...c, amount: String(c.amount) })), total: count ?? 0, canEdit: member.permissions.includes("charges.edit") };
}
export async function readCase(userId: string, id: string) {
  const { admin, c, member } = await caseAccess(userId, id);
  const [{ data: documents, error: de }, { data: events, error: ee }, { data: payment }] = await Promise.all([
    admin.from("chargeback_documents").select("id, file_name, content_type, size_bytes, status, created_at").eq("tenant_id", member.tenantId).eq("case_id", id).order("created_at"),
    admin.from("chargeback_events").select("id, description, origin, created_at").eq("tenant_id", member.tenantId).eq("case_id", id).order("created_at", { ascending: false }).limit(100),
    c.payment_id ? admin.from("payments").select("customers(name)").eq("tenant_id", member.tenantId).eq("id", c.payment_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (de || ee) throw new Error("Não foi possível consultar as contestações.");
  return { c: { ...c, amount: String(c.amount) }, documents: documents ?? [], events: events ?? [], customer: (payment?.customers as { name?: string } | null)?.name ?? null, canEdit: member.permissions.includes("charges.edit") && defenseEditable(c, today()) };
}
export async function syncCase(userId: string, id: string) {
  const { admin, c, member } = await caseAccess(userId, id);
  if (!c.provider_connection_id) throw new Error("Conta de pagamentos indisponível.");
  const account = await getTenantProvider(admin, member.tenantId, c.provider_connection_id);
  if (!account) throw new Error("Conta de pagamentos indisponível.");
  const { data: payment } = c.payment_id ? await admin.from("payments").select("provider_installment_id").eq("tenant_id", member.tenantId).eq("id", c.payment_id).eq("provider_connection_id", c.provider_connection_id).maybeSingle() : { data: null };
  for (let offset = 0; offset < 10000; offset += 100) {
    const result = await account.provider.listChargebacks(offset);
    const official = result.data.find((r) => c.provider_chargeback_id ? r.id === c.provider_chargeback_id && (r.payment === c.provider_payment_id || (!!payment?.provider_installment_id && r.installment === payment.provider_installment_id)) : r.payment === c.provider_payment_id);
    if (official) {
      const confirmed = official.status === "IN_DISPUTE" || ["ACCEPTED", "REJECTED"].includes(official.disputeStatus ?? "");
      const { error } = await admin.from("chargeback_cases").update({ provider_chargeback_id: official.id, status: official.status, reason: official.reason ?? null, dispute_deadline: official.deadlineToSendDisputeDocuments ?? null, synced_at: new Date().toISOString(), ...(confirmed ? { defense_state: "confirmed" } : {}) }).eq("tenant_id", member.tenantId).eq("id", id);
      if (error) throw new Error("Não foi possível atualizar a contestação.");
      await logAudit(admin, { tenantId: member.tenantId, userId, action: "chargeback.sync", resourceId: id, result: "success" });
      return;
    }
    if (!result.hasMore) break;
  }
  throw new Error("Contestação não localizada no Asaas. O envio permanece bloqueado.");
}
export async function uploadEvidence(userId: string, data: { id: string; name: string; mime: string; base64: string }) {
  const { admin, member, c } = await caseAccess(userId, data.id, true);
  if (!defenseEditable(c, today())) throw new Error("A defesa não pode ser alterada neste momento.");
  const bytes = Uint8Array.from(atob(data.base64), (v) => v.charCodeAt(0));
  const ext = validateDefenseFile(bytes, data.mime);
  const docId = crypto.randomUUID();
  const path = `${member.tenantId}/${data.id}/${docId}.${ext}`;
  const name = data.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 150);
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: data.mime, upsert: false });
  if (error) throw new Error("Não foi possível enviar o arquivo.");
  const result = await admin.rpc("mutate_chargeback_document", { p_tenant: member.tenantId, p_case: data.id, p_user: userId, p_action: "add", p_document: docId, p_path: path, p_name: name, p_mime: data.mime, p_size: bytes.length });
  if (result.error || !result.data) { await admin.storage.from(BUCKET).remove([path]); throw new Error("Não foi possível registrar o arquivo. Verifique o prazo e o limite de 11 documentos."); }
  await logAudit(admin, { tenantId: member.tenantId, userId, action: "chargeback.document.add", resourceId: data.id, result: "success", metadata: { documentId: docId } });
}
export async function evidenceAction(userId: string, id: string, docId: string, remove: boolean) {
  const { admin, member } = await caseAccess(userId, id, remove);
  const { data: d, error } = await admin.from("chargeback_documents").select("storage_path").eq("id", docId).eq("case_id", id).eq("tenant_id", member.tenantId).maybeSingle();
  if (error || !d || !d.storage_path.startsWith(`${member.tenantId}/${id}/`)) throw new Error("Documento não encontrado.");
  if (remove) {
    const r = await admin.rpc("mutate_chargeback_document", { p_tenant: member.tenantId, p_case: id, p_user: userId, p_action: "remove", p_document: docId });
    if (r.error || !r.data) throw new Error("A defesa não pode ser alterada neste momento.");
    await admin.storage.from(BUCKET).remove([d.storage_path]);
  } else {
    const r = await admin.storage.from(BUCKET).createSignedUrl(d.storage_path, 60);
    if (r.error || !r.data) throw new Error("Documento não encontrado.");
    await logAudit(admin, { tenantId: member.tenantId, userId, action: "chargeback.document.read", resourceId: id, result: "success", metadata: { documentId: docId } });
    return r.data.signedUrl;
  }
  await logAudit(admin, { tenantId: member.tenantId, userId, action: "chargeback.document.remove", resourceId: id, result: "success", metadata: { documentId: docId } });
  return null;
}
export async function sendDefense(userId: string, id: string) {
  await syncCase(userId, id);
  const { admin, c, member } = await caseAccess(userId, id, true);
  if (!c.provider_connection_id || !c.provider_chargeback_id) throw new Error("Conta de pagamentos indisponível.");
  const account = await getTenantProvider(admin, member.tenantId, c.provider_connection_id);
  if (!account) throw new Error("Conta de pagamentos indisponível.");
  const claim = crypto.randomUUID();
  const lock = await admin.rpc("claim_chargeback_defense", { p_tenant: member.tenantId, p_case: id, p_claim: claim });
  if (lock.error || !lock.data) throw new Error("Envio bloqueado: confira os documentos, o prazo e o estado da defesa.");
  let called = false;
  try {
    const { data: docs, error } = await admin.from("chargeback_documents").select("*").eq("tenant_id", member.tenantId).eq("case_id", id).order("created_at");
    if (error || !docs?.length || docs.length > 11) throw new Error("Não foi possível consultar os documentos.");
    const files: { blob: Blob; name: string }[] = [];
    for (const d of docs) {
      if (!d.storage_path.startsWith(`${member.tenantId}/${id}/`)) throw new Error("Documento não encontrado.");
      const download = await admin.storage.from(BUCKET).download(d.storage_path);
      if (download.error || !download.data) throw new Error("Documento não encontrado.");
      validateDefenseFile(new Uint8Array(await download.data.arrayBuffer()), d.content_type);
      files.push({ blob: download.data, name: d.file_name });
    }
    called = true;
    const response = await account.provider.submitChargebackDefense(c.provider_chargeback_id, files);
    if (!disputeConfirmed(response, c.provider_chargeback_id)) throw new Error("Resposta inconclusiva.");
    const sentAt = new Date().toISOString();
    const updated = await admin.from("chargeback_cases").update({ defense_state: "confirmed", internal_status: "defense_sent", defense_sent_at: sentAt }).eq("id", id).eq("tenant_id", member.tenantId).eq("defense_claim", claim);
    if (updated.error) throw new Error("Resposta inconclusiva.");
    await admin.from("chargeback_documents").update({ status: "sent", sent_at: sentAt }).eq("case_id", id).eq("tenant_id", member.tenantId);
    await admin.from("chargeback_events").insert({ tenant_id: member.tenantId, case_id: id, origin: "user", event_type: "DEFENSE_RECEIVED", description: "O Asaas confirmou o recebimento da defesa.", metadata: { claim } });
    await logAudit(admin, { tenantId: member.tenantId, userId, action: "chargeback.defense.sent", resourceId: id, result: "success", metadata: { claim, files: files.length } });
  } catch (e) {
    const definitive = !called || (e instanceof ProviderRequestError && [400, 401, 403, 404].includes(e.status));
    await admin.from("chargeback_cases").update({ defense_state: definitive ? "idle" : "uncertain" }).eq("id", id).eq("tenant_id", member.tenantId).eq("defense_claim", claim);
    await logAudit(admin, { tenantId: member.tenantId, userId, action: "chargeback.defense.failed", resourceId: id, result: "failure", metadata: { claim, uncertain: !definitive } });
    throw new Error(definitive ? "O envio não foi concluído. Os documentos foram preservados." : "Não foi possível confirmar o envio. Consulte o Asaas antes de tentar novamente.");
  }
}