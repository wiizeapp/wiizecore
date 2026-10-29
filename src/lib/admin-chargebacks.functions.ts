import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "./mfa-middleware";

export const getAdminChargebacks = createServerFn({ method: "GET" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ page: z.number().int().min(0).max(100000), tenantId: z.string().uuid().optional(), status: z.enum(["REQUESTED", "IN_DISPUTE", "DISPUTE_LOST", "REVERSED", "DONE"]).optional() }).parse(i))
  .handler(async ({ context, data }) => (await import("./admin-chargebacks.server")).readAdminChargebacks(context, data));
export const getAdminChargebackHistory = createServerFn({ method: "GET" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => (await import("./admin-chargebacks.server")).readAdminCaseHistory(context, data.id));
export const updateAdminThreeDs = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ allowed: z.boolean(), acknowledged: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => (await import("./admin-chargebacks.server")).setAdminThreeDs(context, data.allowed, data.acknowledged));