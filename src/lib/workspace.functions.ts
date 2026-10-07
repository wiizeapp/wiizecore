import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

export type Workspace = {
  tenantId: string;
  tenantName: string;
  role: string;
  fullName: string | null;
  email: string | null;
  hasFinancialPassword: boolean;
  providerStatus: string;
  providerEnvironment: string | null;
  providerOnboardingStatus: string | null;
  settings: {
    platformFeePercentage: number;
    withdrawalHoldDays: number;
    minimumWithdrawalAmount: number;
    withdrawalFeeAmount: number;
    defaultDueDays: number;
  };
};

/**
 * Garante que o usuário autenticado tenha perfil, empresa, carteira e
 * configurações. Toda a criação acontece no servidor.
 */
export const ensureWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyName?: string; fullName?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<Workspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const metadata = (context.claims as { user_metadata?: Record<string, unknown> } | null)?.user_metadata ?? {};
    const metaName = typeof metadata["full_name"] === "string" ? (metadata["full_name"] as string) : null;
    const fullName = data.fullName?.trim() || metaName || null;

    await supabaseAdmin.from("profiles").upsert(
      { id: userId, email, full_name: fullName },
      { onConflict: "id", ignoreDuplicates: false },
    );

    const { data: membership } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id, role, tenants(name)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let tenantId = membership?.tenant_id ?? null;
    let tenantName = (membership?.tenants as { name?: string } | null)?.name ?? "";
    let role = membership?.role ?? "owner";

    if (!tenantId) {
      const name = data.companyName?.trim() || fullName || "Minha empresa";
      const { data: tenant, error } = await supabaseAdmin
        .from("tenants")
        .insert({ name, email, created_by: userId })
        .select("id, name")
        .single();
      if (error) throw new Error("Não foi possível criar sua empresa.");
      tenantId = tenant.id;
      tenantName = tenant.name;
      role = "owner";

      await supabaseAdmin.from("tenant_members").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
      await supabaseAdmin.from("wallets").insert({ tenant_id: tenantId });
      await supabaseAdmin.from("tenant_settings").insert({ tenant_id: tenantId });
      await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });
      await logAudit(supabaseAdmin, {
        tenantId,
        userId,
        action: "tenant.created",
        resource: "tenants",
        resourceId: tenantId,
      });
    }

    const [{ data: platformSettings }, { data: tenantSettings }, { data: credential }, { data: provider }] =
      await Promise.all([
        supabaseAdmin.from("platform_settings").select("key, value"),
        supabaseAdmin.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabaseAdmin.from("financial_credentials").select("user_id").eq("user_id", userId).maybeSingle(),
        supabaseAdmin
          .from("provider_connections")
          .select("status, environment, onboarding_status")
          .eq("tenant_id", tenantId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const setting = (key: string, fallback: number) => {
      const found = platformSettings?.find((row) => row.key === key);
      return found ? Number(found.value) : fallback;
    };

    return {
      tenantId: tenantId!,
      tenantName,
      role,
      fullName,
      email,
      hasFinancialPassword: Boolean(credential),
      providerStatus: provider?.status ?? "disconnected",
      providerEnvironment: provider?.environment ?? null,
      providerOnboardingStatus: provider?.onboarding_status ?? null,
      settings: {
        platformFeePercentage:
          tenantSettings?.platform_fee_percentage != null
            ? Number(tenantSettings.platform_fee_percentage)
            : setting("platform_fee_percentage", 9.99),
        withdrawalHoldDays:
          tenantSettings?.withdrawal_hold_days != null
            ? Number(tenantSettings.withdrawal_hold_days)
            : setting("withdrawal_hold_days", 32),
        minimumWithdrawalAmount:
          tenantSettings?.minimum_withdrawal_amount != null
            ? Number(tenantSettings.minimum_withdrawal_amount)
            : setting("minimum_withdrawal_amount", 50),
        withdrawalFeeAmount: setting("withdrawal_fee_amount", 0),
        defaultDueDays: tenantSettings?.default_due_days ?? 5,
      },
    };
  });

/** Atualiza os dados da empresa. Exige papel de proprietário ou administrador. */
export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; legalName?: string; document?: string; phone?: string; email?: string; zipCode?: string; address?: string; addressNumber?: string; complement?: string; district?: string; city?: string; state?: string; companyType?: string; incomeValue?: number | null }) => {
    const name = input.name?.trim();
    if (!name || name.length < 2) throw new Error("Informe o nome da empresa.");
    return {
      name,
      legalName: input.legalName?.trim() || null,
      document: input.document?.replace(/\D/g, "") || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      zipCode: input.zipCode?.replace(/\D/g, "") || null,
      address: input.address?.trim() || null,
      addressNumber: input.addressNumber?.trim() || null,
      complement: input.complement?.trim() || null,
      district: input.district?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim().toUpperCase() || null,
      companyType: input.companyType?.trim() || null,
      incomeValue: input.incomeValue != null && Number.isFinite(input.incomeValue) && input.incomeValue > 0 ? input.incomeValue : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: membership } = await context.supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", context.userId).eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Você não tem permissão para alterar os dados da empresa.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({
        name: data.name,
        legal_name: data.legalName,
        document: data.document,
        phone: data.phone,
        email: data.email,
        zip_code: data.zipCode,
        address: data.address,
        address_number: data.addressNumber,
        complement: data.complement,
        district: data.district,
        city: data.city,
        state: data.state,
        company_type: data.companyType,
        income_value: data.incomeValue,
      })
      .eq("id", membership.tenant_id);
    if (error) throw new Error("Não foi possível salvar os dados da empresa.");

    await logAudit(supabaseAdmin, {
      tenantId: membership.tenant_id,
      userId: context.userId,
      action: "tenant.updated",
      resource: "tenants",
      resourceId: membership.tenant_id,
    });
    return { ok: true };
  });

/** Registra o acesso atual (dispositivo/IP) para a tela de sessões. */
export const registerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestInfo } = await import("./audit.server");
    const { ip, userAgent } = requestInfo();

    const { data: recent } = await supabaseAdmin
      .from("user_sessions")
      .select("id")
      .eq("user_id", context.userId)
      .eq("ip_address", ip ?? "")
      .eq("user_agent", userAgent ?? "")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      await supabaseAdmin
        .from("user_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", recent.id);
    } else {
      await supabaseAdmin.from("user_sessions").insert({
        user_id: context.userId,
        ip_address: ip,
        user_agent: userAgent,
      });
      await logAudit(supabaseAdmin, { userId: context.userId, action: "auth.session.started" });
    }
    return { ok: true };
  });
