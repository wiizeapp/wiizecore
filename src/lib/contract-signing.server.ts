import { randomInt } from "node:crypto";
import { signingRequestSchema, signingIdentitySchema } from "./contract-signing-rules";
import { tokenFingerprint, hashSecretValue, verifySecretValue, encryptSecret } from "./crypto.server";
import { consumeRateLimit, requestInfo, logAudit } from "./audit.server";
import { parseSignatureInput, signatureColumns } from "./contract-docs.server";
import { sendEmail, maskEmail } from "./email.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Request = ReturnType<typeof signingRequestSchema.parse>;
function identity(input: Request) {
  const d = signingIdentitySchema.parse(input);
  return { ...d, signature: signatureColumns(parseSignatureInput(d.signature)) };
}

export async function resolveSigning(admin: Admin, input: Request) {
  const binding = tokenFingerprint(`${input.source}:${input.token}`);
  const info = requestInfo();
  const rate = await consumeRateLimit(admin, { scope: "contract_confirmation", identifier: tokenFingerprint(`${binding}:${info.ip ?? "unknown"}`), maxAttempts: 30, windowSeconds: 600, blockSeconds: 600 });
  if (!rate.allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
  const tokenHash = tokenFingerprint(input.token);
  let tenant: string; let contractId: string; let role = "customer"; let email: string | null = null; let document: string | null = null; let customerId: string | null = null;
  if (input.source === "extra") {
    const { data: s } = await admin.from("contract_signers").select("id,tenant_id,contract_id,email,document,removed_at,token_expires_at").eq("token_hash", tokenHash).maybeSingle();
    if (!s || s.removed_at || !s.token_expires_at || Date.parse(s.token_expires_at) <= Date.now()) throw new Error("Link inválido ou expirado.");
    tenant = s.tenant_id; contractId = s.contract_id; role = `signer:${s.id}`; email = s.email; document = s.document;
  } else {
    const table = input.source === "checkout" ? "payment_links" : "contract_links";
    const { data: l } = await admin.from(table).select("*").eq("token_hash", tokenHash).maybeSingle();
    if (!l || l.revoked_at || (input.source !== "checkout" && l.expires_at && Date.parse(l.expires_at) <= Date.now()) || !l.contract_id) throw new Error("Link inválido ou expirado.");
    tenant = l.tenant_id; contractId = l.contract_id;
    if (input.source === "checkout" && "customer_id" in l && "charge_group_id" in l) {
      customerId = l.customer_id;
      await (await import("./checkout-readiness.server")).assertCheckoutReady(admin, { tenant_id: tenant, contract_id: contractId, customer_id: l.customer_id, charge_group_id: l.charge_group_id }, false);
    }
  }
  const { data: c, error } = await admin.from("contracts").select("id,tenant_id,customer_id,status,current_version,title").eq("id", contractId).eq("tenant_id", tenant).maybeSingle();
  if (error || !c || ["cancelled", "expired", "signed"].includes(c.status) || (customerId && customerId !== c.customer_id)) throw new Error("Contrato indisponível para assinatura.");
  if (role === "customer") {
    if (!c.customer_id) throw new Error("Cliente não encontrado.");
    const { data: customer } = await admin.from("customers").select("email,document").eq("id", c.customer_id).eq("tenant_id", tenant).maybeSingle();
    email = customer?.email ?? null; document = customer?.document ?? null;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Peça à empresa para cadastrar seu e-mail antes de assinar.");
  const payload = identity(input);
  if (document && document.replace(/\D/g, "") !== payload.signerDocument) throw new Error("O documento informado não confere com o cadastro deste contrato.");
  const { data: v } = await admin.from("contract_versions").select("id,content_hash").eq("contract_id", c.id).eq("tenant_id", tenant).eq("version", c.current_version).maybeSingle();
  if (!v) throw new Error("Versão do contrato não encontrada.");
  return { tenant, c, v, role, email: email.trim().toLowerCase(), binding, payload, payloadHash: tokenFingerprint(JSON.stringify(payload)) };
}

export async function issueSigningCode(admin: Admin, input: Request) {
  const s = await resolveSigning(admin, input);
  for (const identifier of [tokenFingerprint(s.email), tokenFingerprint(requestInfo().ip ?? "unknown")]) {
    const rate = await consumeRateLimit(admin, { scope: "contract_confirmation_send", identifier, maxAttempts: 5, windowSeconds: 3600, blockSeconds: 3600 });
    if (!rate.allowed) throw new Error("Limite de envios atingido. Aguarde para tentar novamente.");
  }
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const { data: id, error } = await admin.rpc("contract_signature_issue", { _challenge: { tenant_id: s.tenant, contract_id: s.c.id, version_id: s.v.id, signer_role: s.role, content_hash: s.v.content_hash, binding_hash: s.binding, recipient: tokenFingerprint(s.email), payload_hash: s.payloadHash, code_hash: hashSecretValue(code) } });
  if (error || !id) throw new Error("Não foi possível enviar. Aguarde 60 segundos antes de reenviar.");
  const { error: bound } = await admin.from("contract_signature_challenges").update({ source: input.source, capability_hash: tokenFingerprint(input.token) }).eq("id", id);
  if (bound) throw new Error("Não foi possível enviar o código.");
  const sent = await sendEmail(admin, { tenantId: s.tenant, kind: "contract.confirmation", dedupeKey: `contract.confirmation:${id}`, email: { to: s.email, subject: "Confirme sua assinatura — WiizePay", title: "Código para assinar o contrato", intro: "Use este código apenas na tela de assinatura que você abriu.", lines: [{ label: "Contrato", value: s.c.title }, { label: "Código de confirmação", value: code }], footnote: "Válido por dez minutos. Não compartilhe este código." } });
  const delivered = "sent" in sent && sent.sent;
  const { error: marked } = await admin.from("contract_signature_challenges").update(delivered ? { sent_at: new Date().toISOString() } : { revoked_at: new Date().toISOString() }).eq("id", id);
  await evidenceEvent(admin, s.tenant, s.c.id, delivered && !marked ? "confirmation_sent" : "confirmation_send_failed", { evidence_id: id, method: "email_otp", birth_date_collected: true });
  if (!delivered || marked) throw new Error("Não foi possível entregar o código. Tente novamente mais tarde.");
  return { challengeId: id, email: maskEmail(s.email), resendAfter: 60 };
}

export async function finishPublicSigning(admin: Admin, input: Request & { challengeId: string; code: string }) {
  const s = await resolveSigning(admin, input);
  const { data: ch } = await admin.from("contract_signature_challenges").select("*").eq("id", input.challengeId).eq("tenant_id", s.tenant).eq("contract_id", s.c.id).eq("version_id", s.v.id).eq("signer_role", s.role).maybeSingle();
  if (!ch || ch.binding_hash !== s.binding || ch.recipient !== tokenFingerprint(s.email)) throw new Error("Confirmação inválida. Solicite um novo código.");
  const valid = /^\d{6}$/.test(input.code) && verifySecretValue(input.code, ch.code_hash);
  const { ip, userAgent } = requestInfo();
  const { data: result, error } = await admin.rpc("contract_signature_finish", { _tenant: s.tenant, _contract: s.c.id, _version: s.v.id, _role: s.role, _hash: s.v.content_hash, _payload_hash: s.payloadHash, _challenge: ch.id, _code_hash: ch.code_hash, _valid: valid, _signature: { signer_name: s.payload.signerName, signer_document: s.payload.signerDocument, signer_email: s.email, ...s.payload.signature, identity_enc: encryptSecret(JSON.stringify({ birthDate: s.payload.birthDate })), ip_address: ip, user_agent: userAgent } });
  const r = result as { ok?: boolean; status?: string; fullySigned?: boolean } | null;
  await evidenceEvent(admin, s.tenant, s.c.id, !error && r?.ok ? "signature_confirmed" : "confirmation_rejected", { evidence_id: ch.id, method: "email_otp", version: s.c.current_version, birth_date_collected: true });
  if (error || !r?.ok || !r.status) throw new Error("Código inválido, vencido ou já utilizado. Solicite uma nova confirmação.");
  await (await import("./contract-docs.server")).notifyContractSigned(admin, s.tenant, s.c.id, s.payload.signerName, Boolean(r.fullySigned));
  return { status: r.status };
}

export async function evidenceEvent(admin: Admin, tenant: string, contract: string, event: string, metadata: Record<string, string | boolean | number | null>) {
  await admin.from("contract_events").insert({ tenant_id: tenant, contract_id: contract, event, metadata, ip_address: requestInfo().ip });
  await logAudit(admin, { tenantId: tenant, action: `contract.${event}`, resource: "contracts", resourceId: contract, metadata });
}