import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { activationFormSchema } from "./activation-validation";

/** O QR Code e o acesso no celular valem 15 minutos no total, contados da geração. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

export const createActivationHandoff = createServerFn({ method: "POST" }).middleware([requireMfaAuth]).handler(async ({ context }) => {
  const { data: member } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) throw new Error("Você não tem permissão para gerar este acesso.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (await import("./activation-fee.server")).assertActivationPaid(supabaseAdmin, member.tenant_id);
  const { randomToken, randomNumericCode, tokenFingerprint, hashSecretValue } = await import("./crypto.server");
  const { requestInfo, logSecurityEvent } = await import("./audit.server");
  await supabaseAdmin.from("activation_mobile_handoffs").update({ revoked_at: new Date().toISOString() }).eq("tenant_id", member.tenant_id).is("revoked_at", null);
  const token = randomToken(24);
  const code = randomNumericCode();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("activation_mobile_handoffs").insert({ tenant_id: member.tenant_id, created_by: context.userId, token_hash: tokenFingerprint(token), code_hash: hashSecretValue(code), expires_at: expiresAt, created_ip: requestInfo().ip });
  if (error) throw new Error("Não foi possível gerar o acesso para o celular.");
  await logSecurityEvent(supabaseAdmin, { userId: context.userId, tenantId: member.tenant_id, eventType: "activation.mobile_handoff_created" });
  return { token, expiresAt };
});

/** Computador consulta se o celular já concluiu, para atualizar a tela sozinho. */
export const getActivationHandoffStatus = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.from("tenant_members").select("tenant_id").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
    if (!member) throw new Error("Sem acesso.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tokenFingerprint } = await import("./crypto.server");
    const { data: row } = await supabaseAdmin.from("activation_mobile_handoffs").select("verified_at, used_at, revoked_at, expires_at").eq("token_hash", tokenFingerprint(data.token)).eq("tenant_id", member.tenant_id).maybeSingle();
    if (!row) return { state: "expired" as const };
    if (row.used_at) return { state: "done" as const };
    if (row.revoked_at || new Date(row.expires_at) <= new Date()) return { state: "expired" as const };
    return { state: row.verified_at ? ("opened" as const) : ("waiting" as const) };
  });

export const verifyActivationHandoff = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tokenFingerprint, randomToken } = await import("./crypto.server");
    const { requestInfo, consumeRateLimit, logSecurityEvent } = await import("./audit.server");
    const fingerprint = tokenFingerprint(data.token);
    const rate = await consumeRateLimit(supabaseAdmin, { scope: "activation_handoff", identifier: `${fingerprint.slice(0, 20)}:${requestInfo().ip ?? "unknown"}`, maxAttempts: 5, windowSeconds: 600, blockSeconds: 900 });
    if (!rate.allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    const { data: row } = await supabaseAdmin.from("activation_mobile_handoffs").select("*").eq("token_hash", fingerprint).maybeSingle();
    const valid = row && !row.revoked_at && !row.used_at && !row.verified_at && new Date(row.expires_at) > new Date();
    if (!valid) {
      if (row) await supabaseAdmin.from("activation_mobile_handoffs").update({ attempts: Math.min(10, Number(row.attempts ?? 0) + 1), revoked_at: Number(row.attempts ?? 0) >= 4 ? new Date().toISOString() : null }).eq("id", row.id);
      throw new Error("Este QR Code é inválido, expirou ou já foi usado. Gere um novo no computador.");
    }
    await (await import("./activation-fee.server")).assertActivationPaid(supabaseAdmin, row.tenant_id);
    const sessionToken = randomToken(32);
    // A sessão termina junto com o QR Code: nunca passa dos 15 minutos.
    const sessionExpiresAt = row.expires_at;
    await supabaseAdmin.from("activation_mobile_handoffs").update({ verified_at: new Date().toISOString(), verified_ip: requestInfo().ip, session_token_hash: tokenFingerprint(sessionToken), session_expires_at: sessionExpiresAt }).eq("id", row.id);
    await logSecurityEvent(supabaseAdmin, { userId: row.created_by, tenantId: row.tenant_id, eventType: "activation.mobile_handoff_verified" });
    return { sessionToken, sessionExpiresAt };
  });

async function resolveSession(sessionToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { tokenFingerprint } = await import("./crypto.server");
  const { data: row } = await supabaseAdmin.from("activation_mobile_handoffs").select("*").eq("session_token_hash", tokenFingerprint(sessionToken)).maybeSingle();
  if (!row || row.revoked_at || row.used_at || !row.session_expires_at || new Date(row.session_expires_at) <= new Date()) throw new Error("Este QR Code expirou. Gere um novo no computador.");
  await (await import("./activation-fee.server")).assertActivationPaid(supabaseAdmin, row.tenant_id);
  return { admin: supabaseAdmin, row };
}

export const getMobileActivation = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ sessionToken: z.string().min(30).max(100) }).parse(input)).handler(async ({ data }) => {
  const { admin, row } = await resolveSession(data.sessionToken);
  const [{ data: activation }, { data: documents }] = await Promise.all([admin.from("payment_activations").select("person_type, form_data, form_enc").eq("tenant_id", row.tenant_id).single(), admin.from("activation_documents").select("kind, created_at").eq("tenant_id", row.tenant_id)]);
  return { personType: activation?.person_type as "individual" | "company" | null, form: (await import("./activation-form-crypto.server")).openForm(activation), documents: documents ?? [] };
});

export const saveMobileActivation = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ sessionToken: z.string().min(30).max(100), personType: z.enum(["individual", "company"]), form: activationFormSchema }).parse(input)).handler(async ({ data }) => {
  const { admin, row } = await resolveSession(data.sessionToken);
  const { data: activation } = await admin.from("payment_activations").select("status").eq("tenant_id", row.tenant_id).single();
  if (!activation || !["not_started", "draft", "in_progress", "action_required"].includes(activation.status)) throw new Error("Este cadastro não pode mais ser alterado.");
  await admin.from("payment_activations").update({ person_type: data.personType, ...(await import("./activation-form-crypto.server")).sealForm(data.form), status: activation.status === "action_required" ? "action_required" : "in_progress" }).eq("tenant_id", row.tenant_id);
  return { ok: true };
});

export const uploadMobileActivationDocument = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ sessionToken: z.string().min(30).max(100), kind: z.enum(["id_front", "id_back", "selfie", "company_doc", "address_proof", "legal_rep_doc"]), mimeType: z.string(), base64: z.string().max(12_000_000) }).parse(input)).handler(async ({ data }) => {
  const { admin, row } = await resolveSession(data.sessionToken);
  const { storeActivationDocument } = await import("./activation-upload.server");
  await storeActivationDocument(admin, row.tenant_id, row.created_by, data);
  const { data: connection } = await admin.from("provider_connections").select("id").eq("tenant_id", row.tenant_id).eq("provider", "asaas").limit(1).maybeSingle();
  if (connection) {
    const { pushDocuments } = await import("./asaas-onboarding.server");
    await pushDocuments(admin, row.tenant_id).catch((error) => console.error("envio imediato de documento", error instanceof Error ? error.message : "falhou"));
  }
  return { ok: true };
});

export const finishActivationHandoff = createServerFn({ method: "POST" }).inputValidator((input: unknown) => z.object({ sessionToken: z.string().min(30).max(100) }).parse(input)).handler(async ({ data }) => {
  const { admin, row } = await resolveSession(data.sessionToken);
  await admin.from("activation_mobile_handoffs").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
});