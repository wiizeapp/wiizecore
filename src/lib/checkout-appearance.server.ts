import { normalizeAppearance, type CheckoutAppearance } from "./checkout-appearance";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Normaliza a aparência salva e gera um endereço temporário para a logo privada. */
export async function resolveAppearance(admin: Admin, raw: unknown): Promise<CheckoutAppearance> {
  const a = normalizeAppearance(raw);
  if (!a.logoPath) return { ...a, logoUrl: null };
  const { data } = await admin.storage.from("checkout-logos").createSignedUrl(a.logoPath, 60 * 60 * 24);
  return { ...a, logoUrl: data?.signedUrl ?? null };
}
