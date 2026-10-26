import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "./mfa-middleware";

export const getAdminTracking = createServerFn({ method: "POST" }).middleware([requireMfaAuth]).handler(async ({ context }) => {
  const { assertAdminPage } = await import("./admin-session.server");
  const { admin } = await assertAdminPage(context);
  const [{ data: settings, error }, { data: rows, count, error: consentError }] = await Promise.all([
    admin.from("tracking_settings").select("id, enabled, gtm_id, ga4_id, meta_pixel_id, updated_at").maybeSingle(),
    admin.from("cookie_consents").select("id, created_at, functional, analytics, marketing, policy_version, language, user_id", { count: "exact" }).order("created_at", { ascending: false }).limit(20),
  ]);
  if (error || consentError) throw new Error("Não foi possível carregar os dados.");
  return { settings, rows: rows ?? [], total: count ?? 0 };
});

export const saveAdminTracking = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ enabled: z.boolean(), gtm_id: z.string().regex(/^GTM-[A-Z0-9]{4,12}$/).nullable(), ga4_id: z.string().regex(/^G-[A-Z0-9]{4,15}$/).nullable(), meta_pixel_id: z.string().regex(/^[0-9]{6,20}$/).nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdminPage } = await import("./admin-session.server");
    const { admin } = await assertAdminPage(context);
    const { error } = await admin.from("tracking_settings").upsert({ id: true, ...data, updated_by: context.userId });
    if (error) throw new Error("Não foi possível salvar.");
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { userId: context.userId, action: "admin.tracking_updated" });
    return { ok: true };
  });