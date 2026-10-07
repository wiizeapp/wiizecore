import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit, consumeRateLimit, requestInfo } from "./audit.server";
import { contractEvent } from "./contracts.functions";

const SIGNER_TTL_DAYS = 7;
const MAX_FILE = 12 * 1024 * 1024;

async function memberTenant(supabase: { from: (t: string) => any }, userId: string, roles: string[]) {
  const { data } = await supabase.from("tenant_members").select("tenant_id, role").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(userId, "contracts.view");
  if (!data) throw new Error("Empresa não encontrada.");
  if (!roles.includes(data.role)) throw new Error("Você não tem permissão para esta ação.");
  return data as { tenant_id: string; role: string };
}

function b64ToBytes(b64: string) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Importa o texto de um Google Docs compartilhado como "qualquer pessoa com o link". */
export const importGoogleDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    const m = /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{20,})/.exec(input.url ?? "");
    if (!m) throw new Error("Cole o link de um documento do Google Docs.");
    return { id: m[1]! };
  })
  .handler(async ({ data, context }) => {
    await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const res = await fetch(`https://docs.google.com/document/d/${data.id}/export?format=txt`, { redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || type.includes("text/html")) {
      throw new Error("Não conseguimos abrir o documento. No Google Docs, clique em Compartilhar e escolha “Qualquer pessoa com o link”, ou baixe como Word (.docx) e envie o arquivo.");
    }
    const text = (await res.text()).replace(/^\uFEFF/, "").trim();
    if (text.length < 20) throw new Error("O documento está vazio.");
    return { text: text.slice(0, 200_000) };
  });

/** Guarda o arquivo original da versão atual (PDF, Word ou Google Docs). */
export const attachContractFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string; fileName: string; format: "pdf" | "docx" | "gdoc"; base64?: string | null }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    if (!["pdf", "docx", "gdoc"].includes(input.format)) throw new Error("Formato não suportado.");
    const fileName = (input.fileName || "documento").slice(0, 150);
    if (input.format !== "gdoc" && !input.base64) throw new Error("Arquivo ausente.");
    if (input.base64 && input.base64.length > (MAX_FILE * 4) / 3 + 10) throw new Error("Arquivo maior que 12 MB.");
    return { contractId: input.contractId, fileName, format: input.format, base64: input.base64 ?? null };
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeContractFile } = await import("./contract-docs.server");
    const { PDFDocument } = await import("pdf-lib");

    const { data: contract } = await supabaseAdmin.from("contracts").select("id, title, current_version, status")
      .eq("id", data.contractId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!contract) throw new Error("Contrato não encontrado.");
    if (contract.status === "signed") throw new Error("Contrato já assinado.");

    let bytes: Uint8Array;
    if (data.base64) bytes = b64ToBytes(data.base64);
    else bytes = new TextEncoder().encode(`Importado do Google Docs: ${data.fileName}`);

    if (data.format === "pdf") {
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error("O arquivo não é um PDF válido.");
      try { await PDFDocument.load(bytes, { ignoreEncryption: true }); } catch { throw new Error("Não foi possível ler este PDF. Ele pode estar protegido por senha."); }
    }
    const ext = data.format === "pdf" ? "pdf" : data.format === "docx" ? "docx" : "txt";
    const fileName = data.fileName.toLowerCase().endsWith(`.${ext}`) ? data.fileName : `${data.fileName}.${ext}`;
    const { sha256: hash } = await writeContractFile(supabaseAdmin, {
      tenantId: m.tenant_id, contractId: contract.id, title: contract.title, version: contract.current_version, kind: "original",
      sourceFormat: data.format, fileName, bytes, requireDrive: true,
      mime: data.format === "pdf" ? "application/pdf" : data.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain",
    });

    // Para PDF, a impressão digital da versão passa a ser a do próprio arquivo.
    if (data.format === "pdf") {
      await supabaseAdmin.from("contract_versions").update({ content_hash: hash })
        .eq("contract_id", contract.id).eq("version", contract.current_version);
    }
    await contractEvent(supabaseAdmin, m.tenant_id, contract.id, "file_attached", null, { format: data.format, sha256: hash });
    return { sha256: hash };
  });

/** Adiciona testemunha, signatário ou aprovador. */
export const addContractSigner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string; name: string; email?: string | null; document?: string | null; role: "witness" | "signer" | "approver" }) => {
    const name = input.name?.trim();
    if (!input.contractId) throw new Error("Contrato inválido.");
    if (!name || name.length < 3) throw new Error("Informe o nome completo.");
    const email = input.email?.trim().toLowerCase() || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido para quem vai assinar.");
    const document = input.document?.replace(/\D/g, "") || null;
    if (document && document.length !== 11 && document.length !== 14) throw new Error("CPF ou CNPJ inválido.");
    if (!["witness", "signer", "approver"].includes(input.role)) throw new Error("Papel inválido.");
    return { contractId: input.contractId, name: name.slice(0, 120), email, document, role: input.role };
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recomputeContractStatus } = await import("./contract-docs.server");
    const { data: contract } = await supabaseAdmin.from("contracts").select("id, status, current_version")
      .eq("id", data.contractId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!contract) throw new Error("Contrato não encontrado.");
    if (["signed", "cancelled", "expired"].includes(contract.status)) throw new Error("Não é possível adicionar pessoas a este contrato. Crie uma nova versão.");
    const { count } = await supabaseAdmin.from("contract_signers").select("id", { count: "exact", head: true }).eq("contract_id", contract.id).is("removed_at", null);
    if ((count ?? 0) >= 10) throw new Error("Limite de 10 pessoas extras por contrato.");
    const { error } = await supabaseAdmin.from("contract_signers").insert({ tenant_id: m.tenant_id, contract_id: contract.id, name: data.name, email: data.email, document: data.document, role: data.role, created_by: context.userId });
    if (error) throw new Error("Não foi possível adicionar.");
    const { data: created } = await supabaseAdmin.from("contract_signers").select("id").eq("contract_id", contract.id).eq("email", data.email).is("removed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: v } = await supabaseAdmin.from("contract_versions").select("id").eq("contract_id", contract.id).eq("version", contract.current_version).maybeSingle();
    if (v && contract.status !== "draft") await recomputeContractStatus(supabaseAdmin, contract.id, v.id);
    await contractEvent(supabaseAdmin, m.tenant_id, contract.id, "signer_added", data.name, { role: data.role });
    return { ok: true, signerId: (created?.id ?? null) as string | null };
  });

export const removeContractSigner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signerId: string }) => {
    if (!input.signerId) throw new Error("Inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recomputeContractStatus } = await import("./contract-docs.server");
    const { data: s } = await supabaseAdmin.from("contract_signers").select("id, contract_id, name, contracts(status, current_version)")
      .eq("id", data.signerId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!s) throw new Error("Pessoa não encontrada.");
    const c = s.contracts as { status: string; current_version: number } | null;
    if (c?.status === "signed") throw new Error("Contrato já assinado.");
    await supabaseAdmin.from("contract_signers").update({ removed_at: new Date().toISOString(), token_hash: null }).eq("id", s.id);
    const { data: v } = await supabaseAdmin.from("contract_versions").select("id").eq("contract_id", s.contract_id).eq("version", c?.current_version ?? 1).maybeSingle();
    if (v && c?.status !== "draft") await recomputeContractStatus(supabaseAdmin, s.contract_id, v.id);
    await contractEvent(supabaseAdmin, m.tenant_id, s.contract_id, "signer_removed", s.name);
    return { ok: true };
  });

/** Gera link individual de assinatura (vale 7 dias). O token só é mostrado agora. */
export const createSignerLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signerId: string }) => {
    if (!input.signerId) throw new Error("Inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomToken, tokenFingerprint } = await import("./crypto.server");
    const { data: s } = await supabaseAdmin.from("contract_signers").select("id, contract_id, name, email, role, removed_at, contracts(status, title)")
      .eq("id", data.signerId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!s || s.removed_at) throw new Error("Pessoa não encontrada.");
    const status = (s.contracts as { status: string } | null)?.status;
    if (status && ["signed", "cancelled", "expired"].includes(status)) throw new Error("Contrato indisponível para assinatura.");
    await (await import("./contract-docs.server")).assertReadyToSend(supabaseAdmin, s.contract_id);
    const token = randomToken();
    await supabaseAdmin.from("contract_signers").update({
      token_hash: tokenFingerprint(token),
      token_expires_at: new Date(Date.now() + SIGNER_TTL_DAYS * 86400000).toISOString(),
    }).eq("id", s.id);
    if (status === "draft") await supabaseAdmin.from("contracts").update({ status: "awaiting_customer", sent_at: new Date().toISOString() }).eq("id", s.contract_id);
    await contractEvent(supabaseAdmin, m.tenant_id, s.contract_id, "signer_link_created", s.name);
    if (s.email) {
      const { emailPerson, tenantName } = await import("./notify.server");
      const company = await tenantName(supabaseAdmin, m.tenant_id);
      const title = (s.contracts as { title?: string } | null)?.title ?? "Contrato";
      const roleLabel = s.role === "witness" ? "testemunha" : s.role === "approver" ? "aprovador(a)" : "signatário(a)";
      await emailPerson(supabaseAdmin, {
        tenantId: m.tenant_id, kind: "contract.signer_invite", dedupeKey: `contract.signer_invite:${s.id}:${tokenFingerprint(token).slice(0, 16)}`,
        email: { to: s.email, subject: `${company} pediu sua assinatura`, title: "Você tem um documento para assinar",
          intro: `Olá, ${s.name}. ${company} indicou você como ${roleLabel} no documento abaixo.`,
          lines: [{ label: "Documento", value: title }], cta: { label: "Revisar e assinar", url: `/assinar/${token}` },
          footnote: `O link é pessoal e vale por ${SIGNER_TTL_DAYS} dias. Não encaminhe esta mensagem.` },
      });
    }
    return { token };
  });

/** PDF do contrato para a empresa (prévia ou versão final assinada). */
export const downloadContractPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string; origin: string; bare?: boolean }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    return { contractId: input.contractId, origin: input.origin, bare: input.bare === true };
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance", "viewer"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { contractPdf, safeOrigin } = await import("./contract-docs.server");
    const { data: c } = await supabaseAdmin.from("contracts").select("id").eq("id", data.contractId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado.");
    const pdf = await contractPdf(supabaseAdmin, c.id, safeOrigin(data.origin), { bare: data.bare });
    return { base64: Buffer.from(pdf.bytes).toString("base64"), fileName: pdf.fileName, sha256: pdf.sha256 };
  });

// ---------------- Público ----------------

async function resolveSignerToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { tokenFingerprint } = await import("./crypto.server");
  const rate = await consumeRateLimit(supabaseAdmin, { scope: "contract_signer", identifier: tokenFingerprint(token).slice(0, 24), maxAttempts: 30, windowSeconds: 600, blockSeconds: 900 });
  if (!rate.allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
  const ipRate = await consumeRateLimit(supabaseAdmin, { scope: "contract_signer_ip", identifier: requestInfo().ip ?? "unknown", maxAttempts: 120, windowSeconds: 600, blockSeconds: 900 });
  if (!ipRate.allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
  const { data: s } = await supabaseAdmin.from("contract_signers").select("id, tenant_id, contract_id, name, email, document, role, token_expires_at, removed_at")
    .eq("token_hash", tokenFingerprint(token)).maybeSingle();
  if (!s || s.removed_at) throw new Error("Link inválido ou cancelado.");
  if (!s.token_expires_at || new Date(s.token_expires_at) < new Date()) throw new Error("Este link expirou. Peça um novo a quem enviou o contrato.");
  return { admin: supabaseAdmin, signer: s };
}

export const getSignerView = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => {
    if (!input.token || input.token.length < 20) throw new Error("Link inválido.");
    return input;
  })
  .handler(async ({ data }) => {
    const { admin, signer } = await resolveSignerToken(data.token);
    const { data: contract } = await admin.from("contracts").select("id, title, status, current_version, tenants(company_name:name)").eq("id", signer.contract_id).maybeSingle();
    if (!contract || ["cancelled", "expired"].includes(contract.status)) throw new Error("Este contrato não está disponível.");
    const { data: version } = await admin.from("contract_versions").select("id, body").eq("contract_id", contract.id).eq("version", contract.current_version).maybeSingle();
    const { data: sig } = await admin.from("contract_signatures").select("signed_at").eq("contract_version_id", version?.id ?? "").eq("signer_role", `signer:${signer.id}`).maybeSingle();
    const { data: file } = await admin.from("contract_files").select("source_format").eq("contract_id", contract.id).eq("version", contract.current_version).eq("kind", "original").maybeSingle();
    const { signingProgress } = await import("./contract-docs.server");
    const progress = version ? await signingProgress(admin, contract.id, version.id) : [];
    return {
      title: contract.title,
      companyName: (contract.tenants as { company_name?: string } | null)?.company_name ?? "Prestador",
      role: signer.role,
      name: signer.name,
      body: file?.source_format === "pdf" ? null : version?.body ?? "",
      signedAt: sig?.signed_at ?? null,
      contractSigned: contract.status === "signed",
      progress,
    };
  });

export const getSignerPdf = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; origin: string }) => {
    if (!input.token || input.token.length < 20) throw new Error("Link inválido.");
    return input;
  })
  .handler(async ({ data }) => {
    const { admin, signer } = await resolveSignerToken(data.token);
    const { contractPdf, safeOrigin } = await import("./contract-docs.server");
    const pdf = await contractPdf(admin, signer.contract_id, safeOrigin(data.origin));
    return { base64: Buffer.from(pdf.bytes).toString("base64"), fileName: pdf.fileName };
  });

export const signAsExtraSigner = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; signerName: string; signerDocument: string; accepted: boolean; signature: unknown }) => {
    if (!input.token || input.token.length < 20) throw new Error("Link inválido.");
    if (!input.accepted) throw new Error("Confirme que leu e concorda com o documento.");
    const signerName = input.signerName?.trim();
    const signerDocument = input.signerDocument?.replace(/\D/g, "");
    if (!signerName || signerName.length < 3) throw new Error("Informe seu nome completo.");
    if (!signerDocument || (signerDocument.length !== 11 && signerDocument.length !== 14)) throw new Error("Informe um CPF ou CNPJ válido.");
    return { token: input.token, signerName, signerDocument, signature: input.signature };
  })
  .handler(async ({ data }) => {
    const { admin, signer } = await resolveSignerToken(data.token);
    const { recomputeContractStatus, parseSignatureInput, signatureColumns } = await import("./contract-docs.server");
    const sigCols = signatureColumns(parseSignatureInput(data.signature));
    if (signer.document && signer.document !== data.signerDocument) throw new Error("O documento informado não confere com o cadastrado para você.");
    const { data: contract } = await admin.from("contracts").select("id, status, current_version").eq("id", signer.contract_id).maybeSingle();
    if (!contract || ["cancelled", "expired", "signed"].includes(contract.status)) throw new Error("Este contrato não está disponível para assinatura.");
    const { data: version } = await admin.from("contract_versions").select("id, content_hash").eq("contract_id", contract.id).eq("version", contract.current_version).maybeSingle();
    if (!version) throw new Error("Versão não encontrada.");
    const { ip, userAgent } = requestInfo();
    const { error } = await admin.from("contract_signatures").upsert({
      tenant_id: signer.tenant_id, contract_id: contract.id, contract_version_id: version.id, content_hash: version.content_hash,
      signer_role: `signer:${signer.id}`, signer_name: data.signerName, signer_document: data.signerDocument, signer_email: signer.email,
      ...sigCols,
      ip_address: ip, user_agent: userAgent,
    }, { onConflict: "contract_version_id,signer_role" });
    if (error) throw new Error("Não foi possível registrar a assinatura.");
    const r = await recomputeContractStatus(admin, contract.id, version.id);
    await contractEvent(admin, signer.tenant_id, contract.id, "signed_extra", data.signerName, { role: signer.role }, ip);
    if (r.fullySigned) await contractEvent(admin, signer.tenant_id, contract.id, "completed", null);
    await (await import("./contract-docs.server")).notifyContractSigned(admin, signer.tenant_id, contract.id, data.signerName, r.fullySigned);
    await logAudit(admin, { tenantId: signer.tenant_id, action: "contract.signed_by_extra", resource: "contracts", resourceId: contract.id, metadata: { role: signer.role, content_hash: version.content_hash } });
    return { status: r.status };
  });

/** PDF para o contratante pelo link de assinatura dele. */
export const getCustomerPdf = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; origin: string }) => {
    if (!input.token || input.token.length < 20) throw new Error("Link inválido.");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tokenFingerprint } = await import("./crypto.server");
    const { contractPdf, safeOrigin } = await import("./contract-docs.server");
    const rate = await consumeRateLimit(supabaseAdmin, { scope: "contract_customer_pdf", identifier: requestInfo().ip ?? "unknown", maxAttempts: 60, windowSeconds: 600, blockSeconds: 900 });
    if (!rate.allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
    const { data: link } = await supabaseAdmin.from("contract_links").select("contract_id, expires_at, revoked_at").eq("token_hash", tokenFingerprint(data.token)).maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at) < new Date()) throw new Error("Link inválido ou expirado.");
    const pdf = await contractPdf(supabaseAdmin, link.contract_id, safeOrigin(data.origin));
    return { base64: Buffer.from(pdf.bytes).toString("base64"), fileName: pdf.fileName };
  });

/** Verificação pública de autenticidade: por código ou pela impressão digital do arquivo. */
export const verifyContract = createServerFn({ method: "POST" })
  .inputValidator((input: { code?: string; sha256?: string }) => {
    const code = input.code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
    const sha = input.sha256?.trim().toLowerCase() || null;
    if (!code && !sha) throw new Error("Informe o código ou envie o arquivo.");
    if (sha && !/^[a-f0-9]{64}$/.test(sha)) throw new Error("Arquivo inválido.");
    return { code, sha };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { ip } = requestInfo();
    const rate = await consumeRateLimit(admin, { scope: "contract_verify", identifier: ip ?? "unknown", maxAttempts: 40, windowSeconds: 600, blockSeconds: 600 });
    if (!rate.allowed) throw new Error("Muitas consultas. Tente novamente em alguns minutos.");
    const { ROLE_LABEL } = await import("./contract-docs.server");

    let contractId: string | null = null;
    let fileMatch: "signed" | "original" | null = null;
    if (data.sha) {
      const { data: f } = await admin.from("contract_files").select("contract_id, kind").eq("sha256", data.sha).order("kind", { ascending: false }).limit(1).maybeSingle();
      if (f) { contractId = f.contract_id; fileMatch = f.kind as "signed" | "original"; }
      if (!contractId) return { found: false as const };
    }
    const q = admin.from("contracts").select("id, title, status, current_version, signed_at, verification_code, customer_id, tenants(company_name:name)");
    const { data: c } = contractId ? await q.eq("id", contractId).maybeSingle() : await q.eq("verification_code", data.code!).maybeSingle();
    if (!c) return { found: false as const };
    const { data: v } = await admin.from("contract_versions").select("id, content_hash").eq("contract_id", c.id).eq("version", c.current_version).maybeSingle();
    const { data: sigs } = await admin.from("contract_signatures").select("signer_role, signer_name, signed_at").eq("contract_version_id", v?.id ?? "");
    const { data: extra } = await admin.from("contract_signers").select("id, role").eq("contract_id", c.id).is("removed_at", null);
    const roleOf = (r: string) => r.startsWith("signer:") ? ((extra ?? []).find((e: any) => `signer:${e.id}` === r)?.role ?? "signer") : r;
    const mask = (n: string) => n.split(" ").map((p, i) => (i === 0 ? p : `${p[0] ?? ""}.`)).join(" ");
    return {
      found: true as const,
      code: c.verification_code as string,
      title: c.title as string,
      company: (c.tenants as { company_name?: string } | null)?.company_name ?? "Prestador",
      status: c.status as string,
      version: c.current_version as number,
      signedAt: c.signed_at as string | null,
      contentHash: v?.content_hash ?? "",
      fileMatch,
      signatures: (sigs ?? []).map((s: any) => ({ role: ROLE_LABEL[roleOf(s.signer_role)] ?? "Signatário", name: mask(s.signer_name), at: s.signed_at })),
    };
  });

// ---------------- Campos de assinatura no PDF ----------------

type FieldInput = { signerKey: string; page: number; x: number; y: number; w: number; h: number; kind?: "signature" | "initials" };
const KEY_RE = /^(provider|customer|signer:[0-9a-f-]{36})$/;

/** PDF original enviado (sem página de assinaturas), para posicionar os campos. */
export const getOriginalContractPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance", "viewer"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readContractFile } = await import("./contract-docs.server");
    const { data: c } = await supabaseAdmin.from("contracts").select("id, current_version").eq("id", data.contractId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado.");
    const { data: f } = await supabaseAdmin.from("contract_files").select("storage_path, storage_backend, drive_file_id, source_format")
      .eq("contract_id", c.id).eq("version", c.current_version).eq("kind", "original").maybeSingle();
    if (!f || f.source_format !== "pdf") return { base64: null as string | null };
    const bytes = await readContractFile(supabaseAdmin, m.tenant_id, f);
    if (!bytes) throw new Error("Arquivo não encontrado.");
    return { base64: Buffer.from(bytes).toString("base64") as string | null };
  });

/** Substitui todos os campos de assinatura da versão atual. */
export const saveSignatureFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string; fields: FieldInput[] }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    if (!Array.isArray(input.fields) || input.fields.length > 200) throw new Error("Campos inválidos.");
    const n = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
    for (const f of input.fields) {
      if (!KEY_RE.test(f.signerKey) || !Number.isInteger(f.page) || f.page < 1 || !n(f.x) || !n(f.y) || !(f.w > 0 && f.w <= 1) || !(f.h > 0 && f.h <= 1) || (f.kind != null && f.kind !== "signature" && f.kind !== "initials")) throw new Error("Campo de assinatura inválido.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("contracts").select("id, status, current_version, customer_id").eq("id", data.contractId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado.");
    if (["signed", "cancelled", "expired"].includes(c.status)) throw new Error("Não é possível alterar este contrato.");
    const { count: sigCount } = await supabaseAdmin.from("contract_signatures").select("id", { count: "exact", head: true }).eq("contract_id", c.id);
    if ((sigCount ?? 0) > 0 && c.status !== "draft") throw new Error("Alguém já assinou. Crie uma nova versão para mudar as posições.");
    const { data: signers } = await supabaseAdmin.from("contract_signers").select("id").eq("contract_id", c.id).is("removed_at", null);
    const valid = new Set(["provider", ...(c.customer_id ? ["customer"] : []), ...(signers ?? []).map((s: { id: string }) => `signer:${s.id}`)]);
    if (data.fields.some((f) => !valid.has(f.signerKey))) throw new Error("Há um campo para uma pessoa que não assina este contrato.");
    const withSig = new Set(data.fields.filter((f) => f.kind !== "initials").map((f) => f.signerKey));
    if (data.fields.some((f) => !withSig.has(f.signerKey))) throw new Error("Cada pessoa com rubrica também precisa de um campo de assinatura.");
    await supabaseAdmin.from("contract_signature_fields").delete().eq("contract_id", c.id).eq("version", c.current_version);
    if (data.fields.length) {
      const { error } = await supabaseAdmin.from("contract_signature_fields").insert(data.fields.map((f) => ({
        tenant_id: m.tenant_id, contract_id: c.id, version: c.current_version, signer_key: f.signerKey,
        page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, kind: f.kind ?? "signature", created_by: context.userId,
      })));
      if (error) throw new Error("Não foi possível salvar as posições.");
    }
    await contractEvent(supabaseAdmin, m.tenant_id, c.id, "signature_fields_saved", null, { count: data.fields.length });
    return { ok: true };
  });

/** Exclui um rascunho (só enquanto ninguém assinou). */
export const deleteContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("contracts").select("id, status, title").eq("id", data.contractId).eq("tenant_id", m.tenant_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado.");
    if (c.status !== "draft") throw new Error("Só rascunhos podem ser excluídos.");
    const { count } = await supabaseAdmin.from("contract_signatures").select("id", { count: "exact", head: true }).eq("contract_id", c.id);
    if ((count ?? 0) > 0) throw new Error("Este rascunho já tem assinaturas.");
    const { count: pays } = await supabaseAdmin.from("payments").select("id", { count: "exact", head: true }).eq("contract_id", c.id);
    if ((pays ?? 0) > 0) throw new Error("Há cobranças ligadas a este contrato.");
    const { error } = await supabaseAdmin.from("contracts").delete().eq("id", c.id);
    if (error) throw new Error("Não foi possível excluir o rascunho.");
    await logAudit(supabaseAdmin, { tenantId: m.tenant_id, userId: context.userId, action: "contract.draft_deleted", resource: "contracts", resourceId: c.id, metadata: { title: c.title } });
    return { ok: true };
  });

/** Busca um PDF (ou Google Docs, convertido em PDF) pelo link do Drive, usando a conta conectada da empresa. */
export const fetchDriveLinkFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (typeof input.url !== "string" || input.url.length > 500) throw new Error("Link inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const m = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./google-drive.server");
    const id = d.extractDriveId(data.url);
    if (!id) throw new Error("Cole o link de um arquivo do Google Drive ou Google Docs.");
    const f = await d.importFromDriveLink(supabaseAdmin, m.tenant_id, id);
    return { fileName: f.name.slice(0, 150), base64: Buffer.from(f.bytes).toString("base64") };
  });
