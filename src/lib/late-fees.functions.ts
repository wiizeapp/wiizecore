import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ASAAS_DEFAULT_LATE_FEES } from "./late-fees";

type Ctx = { supabase: any; userId: string };

async function membership(context: Ctx) {
  const { data } = await context.supabase.from("tenant_members").select("tenant_id, role").eq("user_id", context.userId).limit(1).maybeSingle();
  if (!data) throw new Error("Você não tem permissão para esta operação.");
  return data as { tenant_id: string; role: string };
}

export const getLateFees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await membership(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("tenant_settings")
      .select("late_fine_enabled, late_fine_percent, late_interest_enabled, late_interest_percent, late_fees_configured_at")
      .eq("tenant_id", m.tenant_id).maybeSingle();
    return {
      canEdit: ["owner", "admin", "finance"].includes(m.role),
      fineEnabled: data?.late_fine_enabled ?? ASAAS_DEFAULT_LATE_FEES.fineEnabled,
      finePercent: Number(data?.late_fine_percent ?? ASAAS_DEFAULT_LATE_FEES.finePercent),
      interestEnabled: data?.late_interest_enabled ?? ASAAS_DEFAULT_LATE_FEES.interestEnabled,
      interestPercent: Number(data?.late_interest_percent ?? ASAAS_DEFAULT_LATE_FEES.interestPercent),
      configured: Boolean(data?.late_fees_configured_at),
    };
  });

const schema = z.object({
  fineEnabled: z.boolean(),
  finePercent: z.number().min(0).max(10, "A multa máxima permitida é 10%."),
  interestEnabled: z.boolean(),
  interestPercent: z.number().min(0).max(10, "Os juros máximos são 10% ao mês."),
});

export const saveLateFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const m = await membership(context as Ctx);
    if (!["owner", "admin", "finance"].includes(m.role)) throw new Error("Somente dono, administrador ou financeiro pode alterar.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const { error } = await supabaseAdmin.from("tenant_settings").upsert({
      tenant_id: m.tenant_id,
      late_fine_enabled: data.fineEnabled, late_fine_percent: r2(data.finePercent),
      late_interest_enabled: data.interestEnabled, late_interest_percent: r2(data.interestPercent),
      late_fees_configured_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });
    if (error) throw new Error("Não foi possível salvar as configurações.");
    const { logAudit } = await import("./audit.server");
    await logAudit(supabaseAdmin, { tenantId: m.tenant_id, action: "late_fees.updated", resource: "tenant_settings", resourceId: m.tenant_id, metadata: data });
    return { ok: true };
  });
