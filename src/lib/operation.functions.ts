import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOperation, type Operation } from "./operation";

/** Operação exibida para o usuário. Só visual: nunca cria, altera ou exclui registros financeiros. */
export const getMyOperation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ operation: Operation; globalEnabled: false }> => {
    const { activeMember } = await import("./member-access.server");
    const access = await activeMember(context.userId);
    if (!access) return { operation: "brasil", globalEnabled: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_operation_preferences")
      .select("operation")
      .eq("user_id", context.userId)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    return { operation: isOperation(data?.operation) ? data.operation : "brasil", globalEnabled: false };
  });

export const setMyOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { operation: string }) => {
    if (!isOperation(input?.operation)) throw new Error("Operação inválida.");
    return { operation: input.operation };
  })
  .handler(async ({ data, context }) => {
    const { activeMember } = await import("./member-access.server");
    const access = await activeMember(context.userId);
    if (!access) throw new Error("Você não tem permissão para esta operação.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_operation_preferences").upsert(
      { user_id: context.userId, tenant_id: access.tenantId, operation: data.operation, updated_at: new Date().toISOString() },
      { onConflict: "user_id,tenant_id" },
    );
    if (error) throw new Error("Não foi possível salvar a operação.");
    const { logAudit } = await import("./audit.server");
    await logAudit(supabaseAdmin, { tenantId: access.tenantId, userId: context.userId, action: "operation.switch", result: "success", metadata: { operation: data.operation } });
    return { operation: data.operation };
  });
