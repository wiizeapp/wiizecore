import { createServerFn } from "@tanstack/react-start";
import { requireMfaAuth } from "@/lib/mfa-middleware";
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
  .middleware([requireMfaAuth])
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

/** Cria a subconta da empresa a partir da conta principal WiizePay. A chave retornada pelo Asaas é cifrada imediatamente. */
export const createAsaasSubaccount = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((input: unknown) => onboardingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireFinanceMembership(context.supabase, context.userId);
    if (!['owner', 'admin'].includes(membership.role)) throw new Error("Somente proprietários e administradores podem iniciar o cadastro financeiro.");
    const { assertTwoFactorIfEnrolled, assertFinancialPassword } = await import("./finance.server");
    await assertTwoFactorIfEnrolled(context.claims, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertFinancialPassword(supabaseAdmin, context.userId, data.financialPassword, "provider.subaccount.create");

    const { ensureSubaccount } = await import("./asaas-onboarding.server");
    await ensureSubaccount(supabaseAdmin, membership.tenant_id, context.userId, null);
    return { status: "pending_review" as const, webhookError: null };

  });

export const refreshAsaasSubaccountStatus = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
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
