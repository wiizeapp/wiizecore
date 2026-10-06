import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Autoriza e registra uma exportação. Só papéis financeiros podem exportar. */
export const authorizeExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      kind: z.enum(["cobrancas", "pagamentos", "inadimplencia", "saques", "extrato"]),
      filters: z.record(z.string(), z.string().max(200)).default({}),
      rows: z.number().int().min(0).max(1_000_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (!m || !["owner", "admin", "finance"].includes(m.role)) throw new Error("Você não tem permissão para exportar dados financeiros.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("./audit.server");
    await logAudit(supabaseAdmin, {
      userId: context.userId,
      tenantId: m.tenant_id,
      action: `export.${data.kind}`,
      resource: "export",
      metadata: { filters: data.filters, rows: data.rows },
    });
    return { ok: true };
  });
