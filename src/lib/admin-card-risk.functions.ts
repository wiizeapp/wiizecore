import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "./mfa-middleware";
import { CARD_RISK_ACTIONS } from "./card-risk-rules";

export const cardRiskListSchema = z.object({
  page: z.number().int().min(0).max(100000),
  status: z.enum(["open", "confirmed", "false_positive", "closed"]).optional(),
  level: z.enum(["medium", "high"]).optional(),
  reason: z.string().regex(/^[a-z_]{3,40}$/).optional(),
  tenantId: z.string().uuid().optional(),
  days: z.number().int().min(1).max(365),
  search: z.string().trim().max(60).optional(),
});
export const cardRiskDecisionSchema = z.object({
  caseId: z.string().uuid(),
  action: z.enum(CARD_RISK_ACTIONS),
  justification: z.string().trim().min(10).max(1000),
  version: z.number().int().min(1),
});

export const getAdminCardRisk = createServerFn({ method: "GET" }).middleware([requireMfaAuth])
  .inputValidator((i) => cardRiskListSchema.parse(i))
  .handler(async ({ context, data }) => (await import("./admin-card-risk.server")).readCardRiskCases(context, data));
export const getAdminCardRiskHistory = createServerFn({ method: "GET" }).middleware([requireMfaAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => (await import("./admin-card-risk.server")).readCardRiskHistory(context, data.id));
export const decideAdminCardRisk = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator((i) => cardRiskDecisionSchema.parse(i))
  .handler(async ({ context, data }) => (await import("./admin-card-risk.server")).decideCardRiskCase(context, data));
