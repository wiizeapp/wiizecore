import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit, logSecurityEvent } from "./audit.server";
import { z } from "zod";

async function requireFinanceMembership(supabase: { from: (t: string) => any }, userId: string) {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId).eq("status", "active")
    .limit(1)
    .maybeSingle();
  await (await import("./member-access.server")).requireModulePerm(userId, "settings.view");
  if (!data || !["owner", "admin", "finance"].includes(data.role)) {
    throw new Error("Você não tem permissão para gerenciar a conexão de pagamentos.");
  }
  return data as { tenant_id: string; role: string };
}

export const getProviderConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: membership } = await context.supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", context.userId).eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("provider_connections")
      .select("provider, environment, status, provider_account_id, last_checked_at, updated_at, webhook_url, wallet_id, subaccount_id, onboarding_status, account_status, commercial_info_status, bank_account_info_status, documentation_status, general_status, capabilities")
      .eq("tenant_id", membership.tenant_id)
      .eq("provider", "asaas")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

const onboardingSchema = z.object({ financialPassword: z.string().min(1).max(200) });

/** Cria a subconta da empresa a partir da conta principal Wiize Core. A chave retornada pelo Asaas é cifrada imediatamente. */
export const createAsaasSubaccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => onboardingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireFinanceMembership(context.supabase, context.userId);
    if (!['owner', 'admin'].includes(membership.role)) throw new Error("Somente proprietários e administradores podem iniciar o cadastro financeiro.");
    const { assertTwoFactorIfEnrolled, assertFinancialPassword } = await import("./finance.server");
    await assertTwoFactorIfEnrolled(context.claims, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.financialPassword, "provider.subaccount.create");

    const { data: existing } = await supabaseAdmin.from("provider_connections").select("id, subaccount_id, status").eq("tenant_id", membership.tenant_id).eq("provider", "asaas").limit(1).maybeSingle();
    if (existing?.subaccount_id) throw new Error("Esta empresa já possui uma subconta de pagamentos.");
    const { data: tenant } = await supabaseAdmin.from("tenants").select("*").eq("id", membership.tenant_id).single();
    if (!tenant) throw new Error("Empresa não encontrada.");
    const required = [tenant.name, tenant.email, tenant.document, tenant.phone, tenant.zip_code, tenant.address, tenant.address_number, tenant.district, tenant.city, tenant.state, tenant.income_value];
    if (required.some((value) => value == null || String(value).trim() === "")) {
      throw new Error("Complete os dados cadastrais e o endereço da empresa antes de continuar.");
    }
    const document = tenant.document;
    const phone = tenant.phone;
    const zipCode = tenant.zip_code;
    if (!document || !phone || !zipCode) throw new Error("Complete CPF/CNPJ, telefone e CEP antes de continuar.");

    const masterKey = process.env['ASAAS_MASTER_API_KEY'];
    const environment = (process.env['ASAAS_ENVIRONMENT'] === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production';
    if (!masterKey) throw new Error("A conta principal da Wiize Core ainda não foi configurada.");
    const { AsaasProvider } = await import("./asaas.server");
    const { encryptSecret } = await import("./crypto.server");
    const { onlyDigits } = await import("./format");
    const provider = new AsaasProvider(masterKey, environment);
    const created = await provider.createSubaccount({
      name: tenant.legal_name || tenant.name,
      email: tenant.email,
      cpfCnpj: onlyDigits(document),
      companyType: tenant.company_type || undefined,
      phone: onlyDigits(phone),
      mobilePhone: onlyDigits(phone),
      address: tenant.address,
      addressNumber: tenant.address_number,
      complement: tenant.complement || undefined,
      province: tenant.district,
      postalCode: onlyDigits(zipCode),
      incomeValue: Number(tenant.income_value),
    });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("provider_connections").upsert({
      tenant_id: membership.tenant_id,
      provider: "asaas",
      environment,
      api_key_ciphertext: encryptSecret(created.apiKey),
      provider_account_id: created.id,
      subaccount_id: created.id,
      wallet_id: created.walletId,
      status: "connected",
      onboarding_status: "pending_review",
      last_checked_at: now,
      updated_at: now,
    }, { onConflict: "tenant_id,provider,environment" });
    if (error) throw new Error("Não foi possível concluir o cadastro da conta de pagamentos.");
    let webhookError: string | null = null;
    try {
      const { registerTenantWebhook } = await import("./webhook-setup.server");
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      await registerTenantWebhook(supabaseAdmin, membership.tenant_id, getRequestHeader("origin") ?? null, context.userId);
    } catch (error) {
      webhookError = error instanceof Error ? error.message : "Não foi possível registrar o webhook.";
    }
    await logAudit(supabaseAdmin, { tenantId: membership.tenant_id, userId: context.userId, action: "provider.subaccount.created", resource: "provider_connections", metadata: { environment, webhookPending: Boolean(webhookError) } });
    await logSecurityEvent(supabaseAdmin, { tenantId: membership.tenant_id, userId: context.userId, eventType: "provider.subaccount.created", metadata: { environment } });
    return { status: "pending_review" as const, webhookError };
  });

export const refreshAsaasSubaccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireFinanceMembership(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getTenantProvider } = await import("./billing.server");
    const conn = await getTenantProvider(supabaseAdmin, membership.tenant_id);
    if (!conn) throw new Error("Conta de pagamentos ainda não criada.");
    const status = await conn.provider.getAccountStatus();
    const read = (key: string) => typeof status[key] === "string" ? status[key] as string : null;
    const values = {
      account_status: read("status"),
      commercial_info_status: read("commercialInfo"),
      bank_account_info_status: read("bankAccountInfo"),
      documentation_status: read("documentation"),
      general_status: read("general"),
      onboarding_status: read("general") === "APPROVED" ? "active" : "pending_review",
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await supabaseAdmin.from("provider_connections").update(values).eq("id", conn.connection.id);
    return values;
  });
