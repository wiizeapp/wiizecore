/**
 * Aprovação da conta pelo Asaas: cria a subconta a partir do cadastro de ativação,
 * envia os documentos e espelha a situação informada pelo Asaas na ativação da WiizePay.
 * Quem aprova é o Asaas; nenhuma ação do admin altera essa situação.
 */
import type { AsaasDocumentGroup } from "./asaas.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const PART_LABEL: Record<string, string> = {
  commercialInfo: "Dados comerciais",
  bankAccountInfo: "Conta bancária",
  documentation: "Documentos",
  general: "Situação geral",
};
const COMPANY_TYPES = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"];
/** O Asaas exige o tipo de empresa em CNPJ; aceita o que a pessoa escreve (MEI, LTDA, EIRELI…). */
function companyType(v?: string | null): string {
  const t = (v ?? "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "");
  if (COMPANY_TYPES.includes(t)) return t;
  if (t.includes("MEI") || t.includes("MICROEMPREENDEDOR")) return "MEI";
  if (t.includes("ASSOC") || t.includes("ONG") || t.includes("INSTITUTO") || t.includes("FUNDACAO")) return "ASSOCIATION";
  if (t === "EI" || t.includes("EIRELI") || t.includes("INDIVIDUAL")) return "INDIVIDUAL";
  return "LIMITED";
}

export type OnboardingItem = { key: string; label: string; status: string; reason?: string | null; onboardingUrl?: string | null; kind: "part" | "document" };
export type ProviderOnboarding = { items: OnboardingItem[]; rejectReasons?: string | null; uploaded?: Record<string, string>; failed?: Record<string, string>; lastError?: string | null };

function digits(v?: string | null) { return (v ?? "").replace(/\D/g, ""); }
function money(v?: string | null) {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Cria a subconta no Asaas com os dados do cadastro de ativação, se ainda não existir. */
export async function ensureSubaccount(admin: Admin, tenantId: string, userId: string, origin: string | null) {
  await (await import("./activation-fee.server")).assertActivationPaid(admin, tenantId);
  const { data: readiness } = await admin.from("payment_activations").select("status,submitted_at").eq("tenant_id",tenantId).single();
  if (!readiness?.submitted_at || !["submitted","under_review","action_required","approved"].includes(readiness.status)) throw new Error("Conclua o cadastro e os documentos antes de criar a conta.");
  const { data: existing } = await admin.from("provider_connections").select("id, subaccount_id").eq("tenant_id", tenantId).eq("provider", "asaas").limit(1).maybeSingle();
  if (existing?.subaccount_id) return;
  const { data: act } = await admin.from("payment_activations").select("person_type, form_data, form_enc").eq("tenant_id", tenantId).single();
  const { data: tenant } = await admin.from("tenants").select("*").eq("id", tenantId).single();
  const f = (await import("./activation-form-crypto.server")).openForm(act);
  const company = act?.person_type === "company";
  const masterKey = process.env["ASAAS_MASTER_API_KEY"];
  const environment = (process.env["ASAAS_ENVIRONMENT"] === "production" ? "production" : "sandbox") as "sandbox" | "production";
  if (!masterKey) throw new Error("A conta principal da WiizePay ainda não foi configurada.");
  const {data:paidFee,error:feeError}=await admin.from("activation_fee_payments").select("environment").eq("tenant_id",tenantId).eq("status","confirmed").single();
  if(feeError || paidFee?.environment!==environment) throw new Error("O pagamento deve ser confirmado no mesmo ambiente da ativação.");
  const { AsaasProvider } = await import("./asaas.server");
  const { encryptSecret } = await import("./crypto.server");
  const master = new AsaasProvider(masterKey, environment);
  const phone = digits(f["phone"] || tenant?.phone);
  const birth = f["birthDate"] && /^\d{4}-\d{2}-\d{2}$/.test(f["birthDate"]) ? f["birthDate"] : undefined;
  // E-mail exclusivo de cadastro, sempre o mesmo para a empresa: evita conflito com contas já existentes no Asaas.
  const { DEPLOY_CONFIG } = await import("./deploy-config");
  const { createHmac } = await import("crypto");
  const signupEmail = `conta-${createHmac("sha256", "wiizepay-signup-email").update(tenantId).digest("hex").slice(0, 12)}@${DEPLOY_CONFIG.providerSignupEmailDomain}`;
  const { data: operation, error: operationError } = await admin.rpc("activation_claim_operation", { _tenant:tenantId,_kind:"subaccount",_environment:environment,_reference:`subaccount:${tenantId}:${environment}` });
  if(operationError || !operation) throw new Error("Não foi possível preparar a criação da conta.");
  let created: {id:string;apiKey:string;walletId:string};
  const op = operation as {claimed:boolean;id:string;state:string;result_enc?:string};
  if(!op.claimed) {
    if(op.result_enc) created=JSON.parse((await import("./crypto.server")).decryptSecret(op.result_enc));
    else {
      const {activationLookup}=await import("./activation-fee.server");
      const found=await activationLookup(`/accounts?email=${encodeURIComponent(signupEmail)}&limit=100`);
      if(found.data?.length) await admin.from("activation_provider_operations").update({state:"uncertain",provider_id:found.data[0].id}).eq("id",op.id);
      throw new Error("A criação está em conferência. Não solicite uma nova conta.");
    }
  } else { try {
  created = await master.createSubaccount({
    name: company ? (f["legalName"] || tenant?.legal_name || tenant?.name) : (f["fullName"] || tenant?.name),
    email: signupEmail,
    cpfCnpj: company ? digits(f["cnpj"]) : digits(f["cpf"]),
    birthDate: company ? undefined : birth,
    companyType: company ? companyType(f["companyType"]) : undefined,
    phone, mobilePhone: phone,
    address: f["address"], addressNumber: f["number"], complement: f["complement"] || undefined,
    province: f["district"], postalCode: digits(f["zipCode"]), city: f["city"], state: f["state"],
    incomeValue: money(f["monthlyRevenue"]) || Number(tenant?.income_value ?? 0),
  });
  const {error:saveOperationError}=await admin.from("activation_provider_operations").update({state:"created",provider_id:created.id,result_enc:encryptSecret(JSON.stringify(created)),updated_at:new Date().toISOString()}).eq("id",op.id);
  if(saveOperationError) throw new Error("A criação está em conferência.");
  } catch { await admin.from("activation_provider_operations").update({state:"uncertain"}).eq("id",op.id);throw new Error("A criação está em conferência. Não solicite uma nova conta."); } }
  const now = new Date().toISOString();
  const { error } = await admin.from("provider_connections").upsert({
    tenant_id: tenantId, provider: "asaas", environment,
    api_key_ciphertext: encryptSecret(created.apiKey),
    provider_account_id: created.id, subaccount_id: created.id, wallet_id: created.walletId,
    status: "connected", onboarding_status: "pending_review", last_checked_at: now, updated_at: now,
  }, { onConflict: "tenant_id,provider,environment" });
  if (error) throw new Error("Não foi possível salvar a conta de pagamentos.");
  try {
    const { registerTenantWebhook } = await import("./webhook-setup.server");
    await registerTenantWebhook(admin, tenantId, origin, userId);
  } catch (e) {
    console.error("webhook da subconta pendente", e instanceof Error ? e.message : "x");
  }
  const { logAudit } = await import("./audit.server");
  await logAudit(admin, { tenantId, userId, action: "provider.subaccount.created", resource: "provider_connections", metadata: { environment, source: "activation" } });
}

/** Quais arquivos do cadastro atendem cada tipo de documento pedido pelo Asaas. */
function kindsFor(group: AsaasDocumentGroup, company: boolean): string[] {
  const t = group.type;
  if (t === "IDENTIFICATION") return company ? ["legal_rep_doc", "id_front", "id_back"] : ["id_front", "id_back"];
  if (t === "IDENTIFICATION_SELFIE") return ["selfie"];
  if (["SOCIAL_CONTRACT", "ENTREPRENEUR_REQUIREMENT", "MINUTES_OF_ELECTION", "MINUTES_OF_CONSTITUTION"].includes(t)) return ["company_doc"];
  if (t === "CUSTOM") return ["address_proof"];
  return [];
}

/** Envia ao Asaas os documentos pendentes ou recusados que a WiizePay já tem. */
export async function pushDocuments(admin: Admin, tenantId: string) {
  await (await import("./activation-fee.server")).assertActivationPaid(admin,tenantId);
  const { getTenantProvider } = await import("./billing.server");
  const conn = await getTenantProvider(admin, tenantId);
  if (!conn) return;
  const { data: act } = await admin.from("payment_activations").select("person_type, provider_onboarding").eq("tenant_id", tenantId).single();
  const state = (act?.provider_onboarding ?? {}) as ProviderOnboarding;
  const uploaded = { ...(state.uploaded ?? {}) };
  const failed: Record<string, string> = { ...(state.failed ?? {}) };
  const res = await conn.provider.listMyDocuments();
  const { data: docs } = await admin.from("activation_documents").select("id, kind, storage_path, mime_type, created_at").eq("tenant_id", tenantId);
  for (const group of res.data ?? []) {
    if (!["PENDING", "REJECTED", "NOT_SENT"].includes(group.status) || group.onboardingUrl) continue;
    for (const kind of kindsFor(group, act?.person_type === "company")) {
      const doc = (docs ?? []).filter((d: { kind: string }) => d.kind === kind).sort((a: {created_at:string},b: {created_at:string})=>b.created_at.localeCompare(a.created_at))[0];
      if (!doc) continue;
      const key = `${group.id}:${kind}`;
      // Reenvia só se o arquivo mudou ou o Asaas recusou.
      if (uploaded[key] === doc.id && group.status !== "REJECTED") continue;
      const { data: blob } = await admin.storage.from("kyc-documents").download(doc.storage_path);
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      try {
        await conn.provider.uploadMyDocument(group.id, group.type, { bytes, mime: doc.mime_type, name: doc.storage_path.split("/").pop() ?? "documento" });
        uploaded[key] = doc.id;
        delete failed[kind];
      } catch (e) {
        // Um documento recusado (ex.: selfie) não trava os demais; o usuário é avisado e pode reenviar.
        uploaded[key] = doc.id;
        failed[kind] = "A instituição de pagamento não aceitou este arquivo. Envie um novo seguindo as dicas.";
        console.error("ativação Asaas: documento não aceito via API", group.type, e instanceof Error ? e.message : "falhou");
      }
    }
  }
  await admin.from("payment_activations").update({ provider_onboarding: { ...state, uploaded, failed } }).eq("tenant_id", tenantId);
}

const NOTIFY: Record<string, { title: string; body: string }> = {
  approved: { title: "Conta aprovada", body: "Sua conta foi aprovada. Você já pode criar cobranças e receber pagamentos." },
  action_required: { title: "Ajuste necessário na sua conta", body: "A análise pediu correções. Veja o que falta em Ativar pagamentos." },
  under_review: { title: "Conta em análise", body: "Recebemos seu cadastro e ele está em análise." },
  rejected: { title: "Cadastro recusado", body: "Seu cadastro foi recusado. Veja os detalhes em Ativar pagamentos." },
};

/** Lê a situação da conta no Asaas e espelha na ativação da WiizePay. */
export async function syncProviderOnboarding(admin: Admin, tenantId: string) {
  const { getTenantProvider } = await import("./billing.server");
  const conn = await getTenantProvider(admin, tenantId);
  if (!conn) return null;
  const [status, documents] = await Promise.all([conn.provider.getAccountStatus(), conn.provider.listMyDocuments().catch(() => ({ data: [], rejectReasons: null }))]);
  const read = (k: string) => (typeof status[k] === "string" ? (status[k] as string) : "PENDING");
  const { data: act } = await admin.from("payment_activations").select("status, person_type, provider_onboarding").eq("tenant_id", tenantId).single();
  const prev = (act?.provider_onboarding ?? {}) as ProviderOnboarding;
  const { data: myDocs } = await admin.from("activation_documents").select("kind").eq("tenant_id", tenantId);
  const have = new Set((myDocs ?? []).map((d: { kind: string }) => d.kind));

  const items: OnboardingItem[] = ["commercialInfo", "bankAccountInfo", "documentation", "general"].map((k) => ({ key: k, label: PART_LABEL[k]!, status: read(k), kind: "part" as const }));
  let needsUser = false;
  for (const g of documents.data ?? []) {
    const kinds = kindsFor(g, act?.person_type === "company");
    const missingFile = !g.onboardingUrl && kinds.length > 0 && !kinds.some((k) => have.has(k));
    const pending = ["PENDING", "REJECTED", "NOT_SENT"].includes(g.status);
    if (pending && (g.onboardingUrl || missingFile || g.status === "REJECTED")) needsUser = true;
    items.push({
      key: g.id, kind: "document", status: g.status,
      label: g.title || g.type, reason: g.status === "REJECTED" ? (g.description ?? documents.rejectReasons ?? null) : null,
      onboardingUrl: pending ? g.onboardingUrl ?? null : null,
    });
  }
  const anyRejected = items.some((i) => i.status === "REJECTED");
  const general = read("general");
  const next = general === "APPROVED" ? "approved" : anyRejected || needsUser ? "action_required" : "under_review";

  const current = act?.status as string;
  const mirror = ["submitted", "under_review", "action_required", "approved"].includes(current) || next === "approved";
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { provider_onboarding: { ...prev, items, rejectReasons: documents.rejectReasons ?? null, lastError: null }, provider_synced_at: now };
  if (mirror && next !== current) {
    patch["status"] = next;
    patch["reviewed_at"] = now;
    patch["review_message"] = next === "action_required" ? (documents.rejectReasons || "Há itens para corrigir ou concluir na análise.") : null;
  }
  await admin.from("payment_activations").update(patch).eq("tenant_id", tenantId);
  await admin.from("provider_connections").update({
    account_status: read("status"), commercial_info_status: read("commercialInfo"), bank_account_info_status: read("bankAccountInfo"),
    documentation_status: read("documentation"), general_status: general,
    onboarding_status: general === "APPROVED" ? "active" : "pending_review", last_checked_at: now, updated_at: now,
  }).eq("id", conn.connection.id);
  if (mirror && next !== current) {
    await admin.from("activation_events").insert({ tenant_id: tenantId, from_status: current, to_status: next, message: "Atualizado pela análise do Asaas" });
    const n = NOTIFY[next];
    if (n) {
      const { notifyTenant } = await import("./notify.server");
      await notifyTenant(admin, {
        tenantId, kind: `activation.${next}`, title: n.title, body: n.body, link: "/ativacao",
        dedupeKey: `activation.${next}:${tenantId}:${now}`,
        email: { subject: `WiizePay — ${n.title}`, ...(next === "action_required" && patch["review_message"] ? { lines: [{ label: "O que falta", value: String(patch["review_message"]).slice(0, 200) }] } : {}) },
      });
    }
  }
  // Aviso quando surge um documento recusado ou etapa nova pendente (uma vez por item e situação).
  const prevKeys = new Set(((prev.items ?? []) as OnboardingItem[]).filter((i) => i.status === "REJECTED" || i.onboardingUrl).map((i) => `${i.key}:${i.status}`));
  const fresh = items.filter((i) => (i.status === "REJECTED" || i.onboardingUrl) && !prevKeys.has(`${i.key}:${i.status}`));
  if (fresh.length && !(mirror && next !== current && next === "action_required")) {
    const { notifyTenant } = await import("./notify.server");
    await notifyTenant(admin, {
      tenantId, kind: "activation.pending_item", link: "/ativacao",
      dedupeKey: `activation.pending_item:${tenantId}:${fresh.map((i) => `${i.key}:${i.status}`).sort().join(",")}`,
      title: "Há um item para concluir na ativação", body: `Confira em Ative seus pagamentos: ${fresh.map((i) => i.label).join(", ").slice(0, 160)}.`,
      email: { subject: "WiizePay — Item pendente na ativação" },
    });
  }
  return { status: mirror ? next : current, items };
}

/** Explica ao cliente, sem expor detalhes internos, por que a subconta não foi criada. */
function friendlySendError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (e instanceof Error && e.name === "ProviderRequestError" && (e as Error & { status?: number }).status && (e as Error & { status: number }).status < 500 && raw) {
    return `A instituição de pagamento não aceitou o cadastro: ${raw.slice(0, 240).replace(/[.\s]*$/, ".")} Corrija este ponto e envie novamente.`;
  }
  if (/conta principal|criptografia/i.test(raw)) return "O envio para análise está temporariamente indisponível por uma configuração da WiizePay. Seus dados ficaram salvos; tente novamente mais tarde ou fale com o suporte.";
  return "Não foi possível falar com a instituição de pagamento agora. Seus dados ficaram salvos; tente novamente em alguns minutos.";
}

/** Envia o cadastro para análise do Asaas: subconta, documentos e primeira leitura da situação. */
export async function sendActivationToProvider(admin: Admin, tenantId: string, userId: string, origin: string | null) {
  // 1) Criar a subconta é o passo decisivo: se falhar, o cadastro volta para correção com o motivo.
  try {
    await ensureSubaccount(admin, tenantId, userId, origin);
  } catch (e) {
    console.error("ativação Asaas: subconta", e instanceof Error ? `${e.name}: ${e.message}` : "falhou");
    const message = friendlySendError(e);
    const { data: act } = await admin.from("payment_activations").select("provider_onboarding").eq("tenant_id", tenantId).single();
    await admin.from("payment_activations").update({ status: "action_required", review_message: message, provider_onboarding: { ...(act?.provider_onboarding ?? {}), lastError: message } }).eq("tenant_id", tenantId);
    await admin.from("activation_events").insert({ tenant_id: tenantId, from_status: "submitted", to_status: "action_required", message });
    throw new Error(message);
  }
  // 2) Com a subconta criada, o cadastro já está em análise. Documentos e situação podem
  // demorar a ficar disponíveis no Asaas; uma falha aqui não desfaz o envio e é refeita em "Atualizar situação".
  try { await pushDocuments(admin, tenantId); } catch (e) { console.error("ativação Asaas: documentos", e instanceof Error ? e.message : "falhou"); }
  try { return await syncProviderOnboarding(admin, tenantId); } catch (e) { console.error("ativação Asaas: situação", e instanceof Error ? e.message : "falhou"); return null; }
}
