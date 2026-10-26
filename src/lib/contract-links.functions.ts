import { createServerFn } from "@tanstack/react-start";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { contractEvent } from "./contracts.functions";

const LINK_TTL_DAYS = 7;

async function memberTenant(supabase: { from: (t: string) => any }, userId: string, roles: string[]) {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId).eq("status", "active")
    .limit(1)
    .maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(userId, "contracts.view");
  if (!data) throw new Error("Empresa não encontrada.");
  if (!roles.includes(data.role)) throw new Error("Você não tem permissão para esta ação.");
  return data as { tenant_id: string; role: string };
}

/**
 * Gera um link público para o cliente assinar o contrato.
 * O token é retornado uma única vez; no banco fica apenas a impressão digital.
 */
export const createContractLink = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { contractId: string }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    return { contractId: input.contractId };
  })
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return issueContractLink(supabaseAdmin, membership.tenant_id, data.contractId, context.userId);
  });

type ReminderStage = "invite" | "day_before" | "start_day";

/**
 * Gera um link novo de assinatura e envia o e-mail ao contratante.
 * Usado no envio manual, no envio automático ao criar o contrato e nos lembretes de vigência.
 * Só para uso no servidor, depois de verificar quem está pedindo.
 */
export async function issueContractLink(
  supabaseAdmin: any,
  tenantId: string,
  contractId: string,
  userId: string | null,
  stage: ReminderStage = "invite",
) {
  const { randomToken, tokenFingerprint } = await import("./crypto.server");
  const { data: contract } = await supabaseAdmin
    .from("contracts")
    .select("id, status, title, starts_on, customers(name, email)")
    .eq("id", contractId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!contract) throw new Error("Contrato não encontrado.");
  if (["signed", "cancelled", "expired"].includes(contract.status)) {
    throw new Error("Este contrato não aceita mais assinaturas.");
  }
  await (await import("./contract-docs.server")).assertReadyToSend(supabaseAdmin, contract.id);

  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await supabaseAdmin.from("contract_links").insert({
    tenant_id: tenantId,
    contract_id: contract.id,
    token_hash: tokenFingerprint(token),
    expires_at: expiresAt.toISOString(),
    created_by: userId,
  });
  if (error) throw new Error("Não foi possível gerar o link.");

  await supabaseAdmin
    .from("contracts")
    .update({ status: "awaiting_customer", updated_at: new Date().toISOString() })
    .eq("id", contract.id)
    .eq("status", "draft");

  await contractEvent(supabaseAdmin, tenantId, contract.id, stage === "invite" ? "link_created" : `reminder_${stage}`, null, { expires_at: expiresAt.toISOString() });
  await (await import("./audit.server")).logAudit(supabaseAdmin, {
    tenantId,
    userId,
    action: stage === "invite" ? "contract.link_created" : `contract.reminder_${stage}`,
    resource: "contracts",
    resourceId: contract.id,
    metadata: { expires_at: expiresAt.toISOString() },
  });

  const cust = contract.customers as { name?: string | null; email?: string | null } | null;
  if (cust?.email) {
    const { emailPerson, tenantName } = await import("./notify.server");
    const company = await tenantName(supabaseAdmin, tenantId);
    const title = contract.title ?? "Contrato";
    const copy = {
      invite: { subject: `${company} enviou um contrato para você assinar`, title: "Contrato aguardando sua assinatura", intro: `Olá, ${cust.name ?? ""}. ${company} enviou o contrato abaixo para sua assinatura digital.` },
      day_before: { subject: `Lembrete: seu contrato com ${company} começa amanhã`, title: "Falta só a sua assinatura", intro: `Olá, ${cust.name ?? ""}. O contrato abaixo começa amanhã e ainda aguarda sua assinatura. Leva menos de um minuto.` },
      start_day: { subject: `Seu contrato com ${company} começa hoje`, title: "Contrato começa hoje", intro: `Olá, ${cust.name ?? ""}. O contrato abaixo começa hoje e ainda está sem sua assinatura. Assine pelo botão abaixo.` },
    }[stage];
    const dedupeKey = stage === "invite"
      ? `contract.customer_invite:${contract.id}:${tokenFingerprint(token).slice(0, 16)}`
      : `contract.reminder_${stage}:${contract.id}`;
    await emailPerson(supabaseAdmin, {
      tenantId, kind: stage === "invite" ? "contract.customer_invite" : `contract.reminder_${stage}`, dedupeKey,
      email: { to: cust.email, subject: copy.subject, title: copy.title, intro: copy.intro,
        lines: [{ label: "Contrato", value: title }], cta: { label: "Revisar e assinar", url: `/c/${token}` },
        footnote: `O link é pessoal e vale até ${expiresAt.toLocaleDateString("pt-BR")}.` },
    });
  }
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Revoga todos os links ativos de um contrato. */
export const revokeContractLinks = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { contractId: string }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    return { contractId: input.contractId };
  })
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("contract_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("contract_id", data.contractId)
      .eq("tenant_id", membership.tenant_id)
      .is("revoked_at", null);

    await contractEvent(supabaseAdmin, membership.tenant_id, data.contractId, "links_revoked", null);
    await (await import("./audit.server")).logAudit(supabaseAdmin, {
      tenantId: membership.tenant_id,
      userId: context.userId,
      action: "contract.links_revoked",
      resource: "contracts",
      resourceId: data.contractId,
    });
    return { ok: true };
  });

type PublicLink = {
  id: string;
  tenant_id: string;
  contract_id: string;
  expires_at: string;
  revoked_at: string | null;
};

async function resolvePublicLink(token: string): Promise<{ link: PublicLink } | { error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { tokenFingerprint } = await import("./crypto.server");

  const rate = await (await import("./audit.server")).consumeRateLimit(supabaseAdmin, {
    scope: "contract_link",
    identifier: tokenFingerprint(token).slice(0, 24),
    maxAttempts: 30,
    windowSeconds: 600,
    blockSeconds: 900,
  });
  if (!rate.allowed) return { error: `Muitas tentativas. Tente novamente em ${Math.ceil(rate.retryAfterSeconds / 60)} min.` };

  const { data: link } = await supabaseAdmin
    .from("contract_links")
    .select("id, tenant_id, contract_id, expires_at, revoked_at")
    .eq("token_hash", tokenFingerprint(token))
    .maybeSingle();
  if (!link) return { error: "Link inválido ou já utilizado." };
  if (link.revoked_at) return { error: "Este link foi revogado pelo prestador." };
  if (new Date(link.expires_at) < new Date()) return { error: "Este link expirou. Peça um novo ao prestador." };
  return { link: link as PublicLink };
}

/** Dados públicos do contrato para a página de assinatura do cliente. */
export const getPublicContract = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => {
    if (!input.token || input.token.length < 20) throw new Error("Link inválido.");
    return { token: input.token };
  })
  .handler(async ({ data }) => {
    const resolved = await resolvePublicLink(data.token);
    if ("error" in resolved) throw new Error(resolved.error);
    const { link } = resolved;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, title, amount, status, current_version, starts_on, ends_on, customers(name, email), tenants(company_name:name)")
      .eq("id", link.contract_id)
      .maybeSingle();
    if (!contract) throw new Error("Contrato não encontrado.");
    if (["cancelled", "expired"].includes(contract.status)) throw new Error("Este contrato não está disponível.");

    const { data: version } = await supabaseAdmin
      .from("contract_versions")
      .select("body, version")
      .eq("contract_id", contract.id)
      .eq("version", contract.current_version)
      .maybeSingle();
    if (!version) throw new Error("Versão do contrato não encontrada.");

    const { data: signatures } = await supabaseAdmin
      .from("contract_signatures")
      .select("signer_role, signer_name, signed_at")
      .eq("contract_id", contract.id)
      .eq("contract_version_id", (
        await supabaseAdmin
          .from("contract_versions")
          .select("id")
          .eq("contract_id", contract.id)
          .eq("version", contract.current_version)
          .maybeSingle()
      ).data?.id ?? "");

    const customer = contract.customers as { name?: string; email?: string } | null;
    const tenant = contract.tenants as { company_name?: string } | null;
    const { data: vrow } = await supabaseAdmin.from("contract_versions").select("id").eq("contract_id", contract.id).eq("version", contract.current_version).maybeSingle();
    const { signingProgress } = await import("./contract-docs.server");
    const progress = vrow ? await signingProgress(supabaseAdmin, contract.id, vrow.id) : [];


    return {
      title: contract.title,
      amount: contract.amount,
      status: contract.status,
      version: version.version,
      body: version.body,
      startsOn: contract.starts_on,
      endsOn: contract.ends_on,
      companyName: tenant?.company_name ?? "Prestador",
      customerName: customer?.name ?? "",
      customerEmail: customer?.email ?? "",
      expiresAt: link.expires_at,
      progress,
      signatures: (signatures ?? []).map((s) => ({
        role: s.signer_role,
        name: s.signer_name,
        at: s.signed_at,
      })),
    };
  });

/**
 * Assinatura do cliente pelo link público.
 * Confere os dados informados com o cadastro, registra IP, dispositivo e a
 * impressão digital da versão assinada, e atualiza a situação do contrato.
 */
export const signContractAsCustomer = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; signerName: string; signerDocument: string; signature: unknown }) => {
    if (!input.token || input.token.length < 20) throw new Error("Link inválido.");
    const signerName = input.signerName?.trim();
    const signerDocument = input.signerDocument?.replace(/\D/g, "");
    if (!signerName || signerName.length < 3) throw new Error("Informe o nome completo de quem assina.");
    if (!signerDocument || (signerDocument.length !== 11 && signerDocument.length !== 14)) {
      throw new Error("Informe um CPF ou CNPJ válido.");
    }
        return { token: input.token, signerName, signerDocument, signature: input.signature };
  })
  .handler(async ({ data }) => {
    const resolved = await resolvePublicLink(data.token);
    if ("error" in resolved) throw new Error(resolved.error);
    const { link } = resolved;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, status, current_version, customer_id, customers(document)")
      .eq("id", link.contract_id)
      .maybeSingle();
    if (!contract) throw new Error("Contrato não encontrado.");
    if (["cancelled", "expired"].includes(contract.status)) throw new Error("Este contrato não está disponível.");
    if (contract.status === "signed") throw new Error("Este contrato já está assinado.");

    const customer = contract.customers as { document?: string | null } | null;
    const registered = (customer?.document ?? "").replace(/\D/g, "");
    if (registered && registered !== data.signerDocument) {
      await (await import("./audit.server")).logAudit(supabaseAdmin, {
        tenantId: link.tenant_id,
        action: "contract.sign_customer",
        resource: "contracts",
        resourceId: contract.id,
        result: "failure",
        metadata: { reason: "document_mismatch" },
      });
      throw new Error("O documento informado não confere com o cadastro deste contrato.");
    }

    const { data: version } = await supabaseAdmin
      .from("contract_versions")
      .select("id, content_hash")
      .eq("contract_id", contract.id)
      .eq("version", contract.current_version)
      .maybeSingle();
    if (!version) throw new Error("Versão do contrato não encontrada.");

    const { parseSignatureInput, signatureColumns } = await import("./contract-docs.server");
    const sigCols = signatureColumns(parseSignatureInput(data.signature));
    const { ip, userAgent } = (await import("./audit.server")).requestInfo();
    const { error } = await supabaseAdmin.from("contract_signatures").upsert(
      {
        tenant_id: link.tenant_id,
        contract_id: contract.id,
        contract_version_id: version.id,
        content_hash: version.content_hash,
        signer_role: "customer",
        signer_name: data.signerName,
        signer_document: data.signerDocument,
        ...sigCols,
        ip_address: ip,
        user_agent: userAgent,
      },
      { onConflict: "contract_version_id,signer_role" },
    );
    if (error) throw new Error("Não foi possível registrar a assinatura.");

    const { recomputeContractStatus } = await import("./contract-docs.server");
    const { fullySigned, status: newStatus } = await recomputeContractStatus(supabaseAdmin, contract.id, version.id);

    await contractEvent(supabaseAdmin, link.tenant_id, contract.id, "signed_customer", data.signerName, {}, ip);
    if (fullySigned) await contractEvent(supabaseAdmin, link.tenant_id, contract.id, "completed", null);
    await (await import("./contract-docs.server")).notifyContractSigned(supabaseAdmin, link.tenant_id, contract.id, data.signerName, fullySigned);
    await (await import("./audit.server")).logAudit(supabaseAdmin, {
      tenantId: link.tenant_id,
      action: "contract.signed_by_customer",
      resource: "contracts",
      resourceId: contract.id,
      metadata: { version: contract.current_version, content_hash: version.content_hash },
    });

    return { status: newStatus };
  });
