import { createServerFn } from "@tanstack/react-start";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit } from "./audit.server";

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

export async function contractEvent(
  admin: { from: (t: string) => any },
  tenantId: string,
  contractId: string,
  event: string,
  actor: string | null,
  metadata: Record<string, unknown> = {},
  ip: string | null = null,
) {
  await admin.from("contract_events").insert({ tenant_id: tenantId, contract_id: contractId, event, actor, metadata, ip_address: ip });
}

/** Arquiva ou restaura um contrato. */
export const archiveContract = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { contractId: string; archived: boolean }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    return { contractId: input.contractId, archived: Boolean(input.archived) };
  })
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("contracts")
      .update({ archived_at: data.archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("id", data.contractId)
      .eq("tenant_id", membership.tenant_id);
    if (error) throw new Error("Não foi possível arquivar.");
    await contractEvent(supabaseAdmin, membership.tenant_id, data.contractId, data.archived ? "archived" : "restored", null);
    return { ok: true };
  });

/**
 * Cria um contrato em rascunho junto da versão 1 do documento.
 * O hash do conteúdo é calculado no servidor e é a base da assinatura.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
/** Início obrigatório + fim OU duração em meses. Sempre devolve os três valores coerentes. */
export function contractPeriod(startsOn?: string | null, endsOn?: string | null, months?: number | null) {
  if (!startsOn || !ISO.test(startsOn)) throw new Error("Informe a data de início do contrato.");
  if (endsOn && ISO.test(endsOn)) {
    if (endsOn <= startsOn) throw new Error("A data de fim deve ser depois do início.");
    const [ys, ms] = startsOn.split("-").map(Number) as [number, number];
    const [ye, me, de] = endsOn.split("-").map(Number) as [number, number, number];
    const ds = Number(startsOn.slice(8));
    let mm = (ye - ys) * 12 + (me - ms) + (de >= ds ? 0 : -1);
    if (mm < 1) mm = 1;
    return { startsOn, endsOn, durationMonths: Math.min(mm, 120) };
  }
  if (!months || months < 1 || months > 120) throw new Error("Informe a data de fim ou a duração em meses (1 a 120).");
  return { startsOn, endsOn: addMonths(startsOn, months), durationMonths: months };
}

/** Edita informações de um rascunho. */
export const updateContractDraft = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { contractId: string; title: string; amount?: number | null; startsOn?: string | null; endsOn?: string | null; durationMonths?: number | null }) => {
    const title = input.title?.trim();
    if (!input.contractId) throw new Error("Contrato inválido.");
    if (!title || title.length < 3) throw new Error("Informe o título do contrato.");
    const amount = Number(input.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido.");
    return { contractId: input.contractId, title: title.slice(0, 200), amount: Number(amount.toFixed(2)), ...contractPeriod(input.startsOn, input.endsOn, input.durationMonths ? Math.round(Number(input.durationMonths)) : null) };
  })
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("contracts").select("id, status").eq("id", data.contractId).eq("tenant_id", membership.tenant_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado.");
    if (c.status !== "draft") throw new Error("Só rascunhos podem ser editados. Crie uma nova versão.");
    const { error } = await supabaseAdmin.from("contracts").update({ title: data.title, amount: data.amount, starts_on: data.startsOn, ends_on: data.endsOn, duration_months: data.durationMonths, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) throw new Error("Não foi possível salvar o rascunho.");
    await contractEvent(supabaseAdmin, membership.tenant_id, c.id, "draft_updated", null);
    return { ok: true };
  });

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator(
    (input: {
      title: string;
      customerId?: string | null;
      serviceId?: string | null;
      serviceIds?: string[];
      durationMonths?: number | null;
      amount?: number | null;
      startsOn?: string | null;
      endsOn?: string | null;
      customerEmail?: string | null;
      draft?: boolean;
      body: string;
    }) => {
      const title = input.title?.trim();
      const body = input.body?.trim();
      if (!title || title.length < 3) throw new Error("Informe o título do contrato.");
      if (!body || body.length < 20) throw new Error("O texto do contrato está muito curto.");
      const amount = Number(input.amount ?? 0);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido.");
      const serviceIds = Array.from(new Set([...(input.serviceIds ?? []), ...(input.serviceId ? [input.serviceId] : [])])).slice(0, 20);
      const dm = input.durationMonths ? Math.round(Number(input.durationMonths)) : null;
      if (dm !== null && (!Number.isFinite(dm) || dm < 1 || dm > 120)) throw new Error("Duração inválida.");
      const dates = input.draft && !input.startsOn
        ? { startsOn: null as string | null, endsOn: null as string | null, durationMonths: dm }
        : contractPeriod(input.startsOn, input.endsOn, dm);
      const customerEmail = input.customerEmail?.trim().toLowerCase() || null;
      if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("E-mail do contratante inválido.");
      return {
        title,
        body,
        customerEmail,
        customerId: input.customerId || null,
        serviceId: serviceIds[0] ?? null,
        serviceIds,
        durationMonths: dates.durationMonths,
        amount: Number(amount.toFixed(2)),
        startsOn: dates.startsOn,
        endsOn: dates.endsOn,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { documentHash } = await import("./crypto.server");

    if (data.customerId) {
      const { data: customer } = await supabaseAdmin
        .from("customers").select("id, email").eq("id", data.customerId).eq("tenant_id", membership.tenant_id).maybeSingle();
      if (!customer) throw new Error("Cliente não encontrado nesta empresa.");
      if (!customer.email) {
        if (!data.customerEmail) throw new Error("Informe o e-mail do contratante para ele poder assinar.");
        await supabaseAdmin.from("customers").update({ email: data.customerEmail }).eq("id", customer.id);
      }
    }
    if (data.serviceIds.length) {
      const { count } = await supabaseAdmin
        .from("services").select("id", { count: "exact", head: true }).in("id", data.serviceIds).eq("tenant_id", membership.tenant_id);
      if ((count ?? 0) !== data.serviceIds.length) throw new Error("Serviço não encontrado nesta empresa.");
    }

    const { data: contract, error } = await supabaseAdmin
      .from("contracts")
      .insert({
        tenant_id: membership.tenant_id,
        customer_id: data.customerId,
        service_id: data.serviceId,
        title: data.title,
        amount: data.amount,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        duration_months: data.durationMonths,
        status: "draft",
        current_version: 1,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !contract) throw new Error("Não foi possível criar o contrato.");

    const hash = documentHash(data.body);
    const { error: versionError } = await supabaseAdmin.from("contract_versions").insert({
      tenant_id: membership.tenant_id,
      contract_id: contract.id,
      version: 1,
      body: data.body,
      content_hash: hash,
      created_by: context.userId,
    });
    if (versionError) throw new Error("Não foi possível salvar o texto do contrato.");
    if (data.serviceIds.length) {
      await supabaseAdmin.from("contract_services").insert(
        data.serviceIds.map((service_id) => ({ contract_id: contract.id, service_id, tenant_id: membership.tenant_id })),
      );
    }
    await contractEvent(supabaseAdmin, membership.tenant_id, contract.id, "created", null);

    await logAudit(supabaseAdmin, {
      tenantId: membership.tenant_id,
      userId: context.userId,
      action: "contract.created",
      resource: "contracts",
      resourceId: contract.id,
      metadata: { version: 1, content_hash: hash },
    });

    // Envio automático do convite de assinatura (falha aqui nunca impede a criação do contrato).
    let autoSent = false;
    if (data.customerId) {
      try {
        const { issueContractLink } = await import("./contract-links.functions");
        await issueContractLink(supabaseAdmin, membership.tenant_id, contract.id, context.userId, "invite");
        autoSent = true;
      } catch { /* contrato ainda não está pronto para envio (ex.: rascunho incompleto) */ }
    }

    return { contractId: contract.id, version: 1, contentHash: hash, autoSent };
  });

/** Salva uma nova versão do texto. Versões anteriores permanecem intactas. */
export const createContractVersion = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { contractId: string; body: string }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    const body = input.body?.trim();
    if (!body || body.length < 20) throw new Error("O texto do contrato está muito curto.");
    return { contractId: input.contractId, body };
  })
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin", "finance"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { documentHash } = await import("./crypto.server");

    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, status, current_version")
      .eq("id", data.contractId)
      .eq("tenant_id", membership.tenant_id)
      .maybeSingle();
    if (!contract) throw new Error("Contrato não encontrado.");
    if (["cancelled", "expired"].includes(contract.status)) {
      throw new Error("Este contrato não pode mais ser alterado.");
    }

    const nextVersion = contract.current_version + 1;
    const hash = documentHash(data.body);
    const { error } = await supabaseAdmin.from("contract_versions").insert({
      tenant_id: membership.tenant_id,
      contract_id: contract.id,
      version: nextVersion,
      body: data.body,
      content_hash: hash,
      created_by: context.userId,
    });
    if (error) throw new Error("Não foi possível salvar a nova versão.");

    await supabaseAdmin
      .from("contracts")
      .update({ current_version: nextVersion, status: "draft", signed_at: null, updated_at: new Date().toISOString() })
      .eq("id", contract.id);
    await contractEvent(supabaseAdmin, membership.tenant_id, contract.id, "version_created", null, { version: nextVersion });

    await logAudit(supabaseAdmin, {
      tenantId: membership.tenant_id,
      userId: context.userId,
      action: "contract.version_created",
      resource: "contracts",
      resourceId: contract.id,
      metadata: { version: nextVersion, content_hash: hash },
    });

    return { version: nextVersion, contentHash: hash };
  });

/** Assinatura do prestador: exige senha financeira e registra IP e dispositivo. */
export const signContractAsProvider = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: { contractId: string; financialPassword: string; signerName: string; signature: unknown }) => {
    if (!input.contractId) throw new Error("Contrato inválido.");
    if (!input.financialPassword) throw new Error("Informe a senha financeira.");
    const signerName = input.signerName?.trim();
    if (!signerName) throw new Error("Informe o nome de quem assina.");
    return { contractId: input.contractId, financialPassword: input.financialPassword, signerName, signature: input.signature };
  })
  .handler(async ({ data, context }) => {
    const membership = await memberTenant(context.supabase, context.userId, ["owner", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestInfo } = await import("./audit.server");

    const { assertFinancialPassword } = await import("./finance.server");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.financialPassword, "contract.sign");

    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, status, current_version")
      .eq("id", data.contractId)
      .eq("tenant_id", membership.tenant_id)
      .maybeSingle();
    if (!contract) throw new Error("Contrato não encontrado.");
    if (["cancelled", "expired"].includes(contract.status)) throw new Error("Contrato indisponível.");
    await (await import("./contract-docs.server")).assertReadyToSend(supabaseAdmin, contract.id);

    const { data: version } = await supabaseAdmin
      .from("contract_versions")
      .select("id, content_hash")
      .eq("contract_id", contract.id)
      .eq("version", contract.current_version)
      .maybeSingle();
    if (!version) throw new Error("Versão do contrato não encontrada.");

    const { parseSignatureInput, signatureColumns } = await import("./contract-docs.server");
    const sigCols = signatureColumns(parseSignatureInput(data.signature));
    const { ip, userAgent } = requestInfo();
    const { error } = await supabaseAdmin.from("contract_signatures").upsert(
      {
        tenant_id: membership.tenant_id,
        contract_id: contract.id,
        contract_version_id: version.id,
        content_hash: version.content_hash,
        signer_role: "provider",
        signer_name: data.signerName,
        ...sigCols,
        ip_address: ip,
        user_agent: userAgent,
      },
      { onConflict: "contract_version_id,signer_role" },
    );
    if (error) throw new Error("Não foi possível registrar a assinatura.");

    const { recomputeContractStatus } = await import("./contract-docs.server");
    const { fullySigned, status: newStatus } = await recomputeContractStatus(supabaseAdmin, contract.id, version.id);

    await contractEvent(supabaseAdmin, membership.tenant_id, contract.id, "signed_provider", data.signerName, {}, ip);
    if (fullySigned) await contractEvent(supabaseAdmin, membership.tenant_id, contract.id, "completed", null);
    await logAudit(supabaseAdmin, {
      tenantId: membership.tenant_id,
      userId: context.userId,
      action: "contract.signed_by_provider",
      resource: "contracts",
      resourceId: contract.id,
      metadata: { version: contract.current_version, content_hash: version.content_hash },
    });

    return { status: newStatus };
  });

/** Histórico de auditoria da empresa (apenas proprietário e administrador). */
export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const { data: membership } = await context.supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", context.userId).eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) return [];

    const { data } = await context.supabase
      .from("audit_logs")
      .select("id, action, resource, result, created_at, ip_address")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
