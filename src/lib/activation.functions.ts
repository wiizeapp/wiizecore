import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { validCnpj, validCpf } from "./doc-validation";
import { activationFormSchema, BRAZIL_STATES, REQUIRED_DOCS } from "./activation-validation";

type Ctx = { supabase: { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }; userId: string; claims: unknown };

const EDITABLE = ["not_started", "draft", "in_progress", "action_required"];
export const DOC_KINDS = ["id_front", "id_back", "selfie", "company_doc", "address_proof", "legal_rep_doc"] as const;

async function ownerMembership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).eq("status", "active").limit(1).maybeSingle();
  if (!data) throw new Error("Empresa não encontrada.");
  return data as { tenant_id: string; role: string };
}
function assertManager(role: string) {
  if (!["owner", "admin"].includes(role)) throw new Error("Somente proprietários e administradores podem ativar o WiizePay.");
}
async function ensureRow(admin: any, tenantId: string) {
  await (await import("./activation-fee.server")).assertActivationPaid(admin, tenantId);
  await admin.from("payment_activations").upsert({ tenant_id: tenantId }, { onConflict: "tenant_id", ignoreDuplicates: true });
  const { data } = await admin.from("payment_activations").select("*").eq("tenant_id", tenantId).single();
  // Cadastros antigos em texto são criptografados na primeira leitura, sem perder dados.
  if (data && !data.form_enc && data.form_data && Object.keys(data.form_data).length) {
    const sealed = (await import("./activation-form-crypto.server")).sealForm(data.form_data);
    await admin.from("payment_activations").update(sealed).eq("tenant_id", tenantId).is("form_enc", null);
    return { ...data, form_enc: sealed.form_enc };
  }
  return data;
}

export const getActivation = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await ownerMembership(context as Ctx);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    let row = await ensureRow(admin, m.tenant_id);
    const stale = !row.provider_synced_at || Date.now() - new Date(row.provider_synced_at).getTime() > 180_000;
    if (stale && ["submitted", "under_review", "action_required"].includes(row.status)) {
      try {
        const { syncProviderOnboarding } = await import("./asaas-onboarding.server");
        await syncProviderOnboarding(admin, m.tenant_id);
        row = await ensureRow(admin, m.tenant_id);
      } catch (e) { console.error("sync ativação", e instanceof Error ? e.message : "x"); }
    }
    const [{ data: docs }, { data: events }] = await Promise.all([
      admin.from("activation_documents").select("id, kind, mime_type, size_bytes, created_at").eq("tenant_id", m.tenant_id).is("superseded_at", null).order("created_at"),
      admin.from("activation_events").select("to_status, message, created_at").eq("tenant_id", m.tenant_id).order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      role: m.role, status: row.status as string, personType: row.person_type as "individual" | "company" | null,
      form: (await import("./activation-form-crypto.server")).openForm(row), consents: row.consents as Record<string, boolean>,
      reviewMessage: row.review_message as string | null, submittedAt: row.submitted_at as string | null,
      documents: docs ?? [], events: events ?? [],
      provider: (row.provider_onboarding ?? {}) as { items?: { key: string; label: string; status: string; reason?: string | null; onboardingUrl?: string | null; kind: string }[]; rejectReasons?: string | null; failed?: Record<string, string>; lastError?: string | null },
      providerSyncedAt: row.provider_synced_at as string | null,
    };
  });

export const saveActivationDraft = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({
    personType: z.enum(["individual", "company"]).nullable(),
    form: activationFormSchema,
    consents: z.object({ terms: z.boolean(), truth: z.boolean(), privacy: z.boolean() }).partial(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await ownerMembership(context as Ctx); assertManager(m.role);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const row = await ensureRow(admin, m.tenant_id);
    if (!EDITABLE.includes(row.status)) throw new Error("O cadastro não pode ser alterado neste momento.");
    {
      const doc = String((data.personType === "company" ? data.form.cnpj : data.form.cpf) ?? "").replace(/\D/g, "");
      if (doc.length >= 11) {
        const { data: used } = await (admin.rpc as any)("document_in_use", { _tenant_id: m.tenant_id, _document: doc });
        if (used) throw new Error("Este CPF/CNPJ já está vinculado a outra conta WiizePay. Use um documento que ainda não tenha conta.");
      }
    }
    const next = row.status === "action_required" ? "action_required" : "in_progress";
    await admin.from("payment_activations").update({ person_type: data.personType, ...(await import("./activation-form-crypto.server")).sealForm(data.form), consents: data.consents, status: next }).eq("tenant_id", m.tenant_id);
    // Copia para os dados da empresa apenas o que foi preenchido; o restante o usuário completa depois.
    const f = data.form; const pj = data.personType === "company";
    const digits = (v: string) => v.replace(/\D/g, "");
    const patch: Record<string, string> = {};
    const put = (k: string, v: string | undefined) => { if (v && v.trim()) patch[k] = v.trim(); };
    put("name", pj ? (f.tradeName || f.legalName) : f.fullName);
    put("legal_name", pj ? f.legalName : f.fullName);
    const selectedDocument = digits(pj ? f.cnpj : f.cpf);
    if ((pj && validCnpj(selectedDocument)) || (!pj && validCpf(selectedDocument))) put("document", selectedDocument);
    put("company_type", pj ? f.companyType : "");
    put("email", f.email); put("phone", digits(f.phone));
    put("zip_code", digits(f.zipCode)); put("address", f.address); put("address_number", f.number);
    put("complement", f.complement); put("district", f.district); put("city", f.city); put("state", f.state.toUpperCase());
    if (Object.keys(patch).length) {
      const { error } = await admin.from("tenants").update(patch as never).eq("id", m.tenant_id);
      if (error) {
        if (error.code === "23505") throw new Error("Este CPF/CNPJ já está vinculado a outra conta WiizePay. Use um documento que ainda não tenha conta.");
        console.error("sync empresa", error.message);
      }
    }
    return { ok: true };
  });

export const uploadActivationDocument = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({ kind: z.enum(DOC_KINDS), mimeType: z.string(), base64: z.string().max(12_000_000) }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await ownerMembership(context as Ctx); assertManager(m.role);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await (await import("./activation-fee.server")).assertActivationPaid(admin, m.tenant_id);
    const { storeActivationDocument } = await import("./activation-upload.server");
    await storeActivationDocument(admin, m.tenant_id, context.userId, data);
    const { data: connection } = await admin.from("provider_connections").select("id").eq("tenant_id", m.tenant_id).eq("provider", "asaas").limit(1).maybeSingle();
    if (connection) {
      const { pushDocuments } = await import("./asaas-onboarding.server");
      await pushDocuments(admin, m.tenant_id).catch((error) => console.error("envio imediato de documento", error instanceof Error ? error.message : "falhou"));
    }
    return { ok: true };
  });

export const submitActivation = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await ownerMembership(context as Ctx); assertManager(m.role);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const row = await ensureRow(admin, m.tenant_id);
    const f = (await import("./activation-form-crypto.server")).openForm(row);
    const missing: string[] = [];
    const need = ["fullName", "cpf", "birthDate", "phone", "zipCode", "address", "number", "district", "city", "state"];
    if (row.person_type === "company") need.push("legalName", "cnpj", "monthlyRevenue", "businessModel", "paymentSources", "expectedVolume", "legalRepName", "legalRepCpf");
    else need.push("monthlyRevenue", "businessModel", "paymentSources", "expectedVolume");
    for (const k of need) if (!f[k]?.trim()) missing.push(k);
    if (missing.length) throw new Error("Preencha todos os campos obrigatórios antes de enviar.");
    if (!validCpf(f["cpf"] ?? "")) throw new Error("CPF inválido.");
    if (row.person_type === "company" && !validCnpj(f["cnpj"] ?? "")) throw new Error("CNPJ inválido.");
    if (row.person_type === "company" && !validCpf(f["legalRepCpf"] ?? "")) throw new Error("CPF do responsável legal inválido.");
    {
      const doc = (row.person_type === "company" ? f["cnpj"] : f["cpf"]) ?? "";
      const { data: used } = await (admin.rpc as any)("document_in_use", { _tenant_id: m.tenant_id, _document: doc });
      if (used) throw new Error("Este CPF/CNPJ já está vinculado a outra conta WiizePay. Use um documento que ainda não tenha conta.");
    }
    if (!BRAZIL_STATES.some(([uf]) => uf === (f["state"] ?? "").toUpperCase())) throw new Error("Selecione um Estado válido.");
    const { data: documents } = await admin.from("activation_documents").select("kind").eq("tenant_id", m.tenant_id).is("superseded_at", null);
    const have = new Set((documents ?? []).map((document: { kind: string }) => document.kind));
    const required = REQUIRED_DOCS[row.person_type as "individual" | "company"] ?? REQUIRED_DOCS.individual;
    if (required.some((kind) => !have.has(kind))) throw new Error("Envie todos os documentos obrigatórios.");
    if (!row.consents?.truth || !row.consents?.terms || !row.consents?.privacy) throw new Error("Aceite todas as confirmações antes de enviar.");
    // Guarda a prova do aceite (quem, quando, de onde e qual versão dos termos).
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const acceptedAt = new Date().toISOString();
    const ip = (await import("./audit.server")).trustedClientIp((n) => getRequestHeader(n)).ip;
    const proof = { truth: true, terms: true, privacy: true, acceptedAt, acceptedBy: context.userId, ip, userAgent: (getRequestHeader("user-agent") ?? "").slice(0, 300), termsVersion: "2026-10" };
    await admin.from("payment_activations").update({ consents: proof }).eq("tenant_id", m.tenant_id);
    const { error } = await admin.rpc("submit_activation", { _tenant_id: m.tenant_id, _user_id: context.userId });
    if (error) {
      const map: Record<string, string> = { missing_documents: "Envie todos os documentos obrigatórios.", missing_consents: "Aceite todas as confirmações antes de enviar.", not_submittable: "Este cadastro já foi enviado." };
      const key = Object.keys(map).find((k) => error.message.includes(k));
      throw new Error(key ? map[key] : "Não foi possível enviar o cadastro.");
    }
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { tenantId: m.tenant_id, userId: context.userId, action: "activation.submitted", resource: "payment_activation", resourceId: m.tenant_id, metadata: { termsVersion: proof.termsVersion, acceptedAt } });
    const { data: sub } = await admin.from("payment_activations").select("submitted_at").eq("tenant_id", m.tenant_id).single();
    const { notifyTenant } = await import("./notify.server");
    // Um único aviso por envio: a chave usa o horário exato gravado pelo envio.
    await notifyTenant(admin, {
      tenantId: m.tenant_id, kind: "activation.submitted", link: "/ativacao", dedupeKey: `activation.submitted:${m.tenant_id}:${sub?.submitted_at ?? acceptedAt}`,
      title: "Cadastro enviado para análise", body: "Seus dados foram enviados ao Asaas. A análise costuma levar até 3 dias úteis e avisaremos aqui e por e-mail.",
      email: { subject: "WiizePay — Cadastro enviado para análise" },
    });
    const { sendActivationToProvider } = await import("./asaas-onboarding.server");
    await sendActivationToProvider(admin, m.tenant_id, context.userId, getRequestHeader("origin") ?? null);
    return { ok: true };
  });

/** Consulta agora a situação da análise no Asaas e reenvia documentos novos ou corrigidos. */
export const refreshActivationStatus = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const m = await ownerMembership(context as Ctx); assertManager(m.role);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { consumeRateLimit } = await import("./audit.server");
    const limit = await consumeRateLimit(admin, { scope: "activation_sync", identifier: m.tenant_id, maxAttempts: 10, windowSeconds: 600, blockSeconds: 600 });
    if (!limit.allowed) throw new Error("Aguarde alguns minutos para atualizar de novo.");
    await (await import("./activation-fee.server")).assertActivationPaid(admin, m.tenant_id);
    const { pushDocuments, syncProviderOnboarding } = await import("./asaas-onboarding.server");
    try { await pushDocuments(admin, m.tenant_id); } catch (e) { throw new Error(e instanceof Error ? e.message : "Não foi possível enviar os documentos."); }
    const r = await syncProviderOnboarding(admin, m.tenant_id);
    if (!r) throw new Error("O cadastro ainda não foi enviado para análise.");
    return { status: r.status };
  });

/* ---------------- Admin ---------------- */
async function requireAdmin(context: Ctx) {
  await (await import("./admin-session.server")).assertAdminPage(context);
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "platform_admin" });
  if (!data) throw new Error("Acesso restrito à equipe WiizePay.");
  const { assertTwoFactor } = await import("./finance.server");
  assertTwoFactor(context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
const mask = (v?: string) => (v ? v.replace(/\d(?=\d{2})/g, "•") : "");

export const listActivations = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context as Ctx);
    const { data } = await admin.from("payment_activations").select("tenant_id, status, person_type, submitted_at, reviewed_at, updated_at, tenants(name)").order("submitted_at", { ascending: true, nullsFirst: false });
    return (data ?? []).map((r: any) => ({ tenantId: r.tenant_id, name: r.tenants?.name ?? "—", status: r.status, personType: r.person_type, submittedAt: r.submitted_at, updatedAt: r.updated_at }));
  });

export const getActivationDetail = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: unknown) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context as Ctx);
    const [{ data: row }, { data: docs }, { data: events }] = await Promise.all([
      admin.from("payment_activations").select("*, tenants(name)").eq("tenant_id", data.tenantId).single(),
      admin.from("activation_documents").select("id, kind, mime_type, size_bytes, storage_path, created_at").eq("tenant_id", data.tenantId),
      admin.from("activation_events").select("from_status, to_status, message, actor_id, created_at").eq("tenant_id", data.tenantId).order("created_at", { ascending: false }),
    ]);
    if (!row) throw new Error("Processo não encontrado.");
    const documents = await Promise.all((docs ?? []).map(async (d: any) => {
      const { data: s } = await admin.storage.from("kyc-documents").createSignedUrl(d.storage_path, 120);
      return { id: d.id, kind: d.kind, mimeType: d.mime_type, size: d.size_bytes, createdAt: d.created_at, url: s?.signedUrl ?? null };
    }));
    const f = (await import("./activation-form-crypto.server")).openForm(row);
    for (const k of ["cpf", "legalRepCpf"]) f[k] = mask(f[k]);
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { tenantId: data.tenantId, userId: context.userId, action: "activation.viewed", resource: "payment_activation", resourceId: data.tenantId });
    return { tenantId: data.tenantId, name: (row as any).tenants?.name ?? "—", status: row.status as string, personType: row.person_type, form: f, consents: row.consents, reviewMessage: row.review_message, submittedAt: row.submitted_at, documents, events: events ?? [] };
  });

// A aprovação da conta é feita pelo Asaas; o admin não aprova nem recusa ativações.
