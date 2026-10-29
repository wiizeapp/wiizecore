import { createServerFn } from "@tanstack/react-start";
import { signingRequestSchema } from "./contract-signing-rules";

export const requestContractSigningCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signingRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await import("./contract-signing.server")).issueSigningCode(supabaseAdmin, data);
  });