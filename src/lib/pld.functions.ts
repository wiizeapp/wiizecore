import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "./mfa-middleware";
import { assertPldDecision, evaluatePldRule, pldOutcome, pldParameters, pldRuleCode, pldStatus, type PldParameters } from "./pld-rules";

export const listPldCases = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ status: pldStatus.optional(), tenantId: z.string().uuid().optional(), priority: z.enum(["low","medium","high"]).optional(), assignedTo: z.string().uuid().optional(), rule: pldRuleCode.optional(), from: z.string().datetime().optional(), page: z.number().int().min(0).max(1000).default(0) }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdminPage } = await import("./admin-session.server");
    const { admin } = await assertAdminPage(context);
    let q = admin.from("pld_cases").select("id,tenant_id,priority,status,assigned_to,revision,created_at,rule_version_id", { count: "exact" });
    if (data.status) q = q.eq("status", data.status);
    if (data.tenantId) q = q.eq("tenant_id", data.tenantId);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.assignedTo) q = q.eq("assigned_to", data.assignedTo);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.rule) {
      const { data: versions, error } = await admin.from("pld_rule_versions").select("id").eq("rule_code", data.rule);
      if (error) throw new Error("Não foi possível carregar os dados.");
      q = q.in("rule_version_id", (versions ?? []).map(r => r.id));
    }
    const [{ data: rows, count, error }, { data: all, error: allError }, { data: rules, error: ruleError }] = await Promise.all([
      q.order("created_at", { ascending: false }).range(data.page * 50, data.page * 50 + 49),
      admin.from("pld_cases").select("status").limit(10000),
      admin.from("pld_rule_versions").select("id,rule_code,version,enabled,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    if (error || allError || ruleError) throw new Error("Não foi possível carregar os dados.");
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { userId: context.userId, action: "pld.queue_viewed" });
    return { rows: rows ?? [], total: count ?? 0, rules: rules ?? [], summary: { new: (all ?? []).filter(r => r.status === "new").length, in_review: (all ?? []).filter(r => r.status === "in_review").length, escalated: (all ?? []).filter(r => r.status === "escalated").length, closed: (all ?? []).filter(r => r.status === "closed").length }, summaryLimited: (all ?? []).length === 10000 };
  });

export const getPldCase = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdminPage } = await import("./admin-session.server");
    const { admin } = await assertAdminPage(context);
    const key = process.env["WIIZEPAY_ENCRYPTION_KEY"] ?? process.env["WISE_PAY_ENCRYPTION_KEY"];
    if (!key) throw new Error("Conteúdo protegido indisponível.");
    const [{ data: row, error }, { data: events, error: eventError }] = await Promise.all([
      admin.from("pld_cases").select("*").eq("id", data.id).maybeSingle(),
      admin.from("pld_case_events").select("id,actor_id,action,created_at,content_enc").eq("case_id", data.id).order("created_at"),
    ]);
    if (error || eventError || !row) throw new Error("Caso não encontrado.");
    const { decryptPld } = await import("./pld-crypto.server");
    const aad = `${row.tenant_id}:${row.id}`;
    const { data: tenant, error: tenantError } = await admin.from("tenants").select("name").eq("id", row.tenant_id).maybeSingle();
    if (tenantError) throw new Error("Não foi possível carregar os dados.");
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { userId: context.userId, tenantId: row.tenant_id, action: "pld.case_viewed", resource: "pld_case", resourceId: row.id });
    const { content_enc, ...safe } = row;
    return { ...safe, tenantName: tenant?.name ?? "—", content: decryptPld(content_enc, aad, key) as { reason?: string; references?: string[]; total?: string; count?: number; source?: string; rule?: string; ruleVersion?: number; sufficient?: boolean }, events: (events ?? []).map(({ content_enc: enc, ...e }) => ({ ...e, content: decryptPld(enc, aad, key) as { note?: string; outcome?: string; status?: string } })) };
  });

export const updatePldCase = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ id: z.string().uuid(), revision: z.number().int().min(1), status: pldStatus, note: z.string().trim().min(5).max(10000), outcome: pldOutcome.nullable().optional(), assignToMe: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    assertPldDecision(data.status, data.note, data.outcome);
    const { assertAdminPage } = await import("./admin-session.server");
    const { admin } = await assertAdminPage(context);
    const key = process.env["WIIZEPAY_ENCRYPTION_KEY"] ?? process.env["WISE_PAY_ENCRYPTION_KEY"];
    if (!key) throw new Error("Conteúdo protegido indisponível.");
    const { data: row, error } = await admin.from("pld_cases").select("tenant_id,status,assigned_to").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error("Caso não encontrado.");
    const { encryptPld } = await import("./pld-crypto.server");
    const enc = encryptPld({ note: data.note, outcome: data.outcome, status: data.status, previousStatus: row.status }, `${row.tenant_id}:${data.id}`, key);
    const { error: updateError } = await admin.rpc("pld_update_case", { _id: data.id, _revision: data.revision, _actor: context.userId, _status: data.status, _assigned: data.assignToMe ? context.userId : row.assigned_to ?? context.userId, _content_enc: enc, _action: row.status === "closed" && data.status !== "closed" ? "reopened" : "reviewed" });
    if (updateError) throw new Error("O caso mudou ou não pôde ser salvo. Atualize e tente novamente.");
    return { ok: true };
  });

export const savePldRule = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ code: pldRuleCode, parameters: pldParameters, enabled: z.boolean().default(false), justification: z.string().trim().min(10).max(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdminPage } = await import("./admin-session.server");
    const { admin } = await assertAdminPage(context);
    const key = process.env["WIIZEPAY_ENCRYPTION_KEY"] ?? process.env["WISE_PAY_ENCRYPTION_KEY"];
    if (!key) throw new Error("Conteúdo protegido indisponível.");
    const { data: last, error } = await admin.from("pld_rule_versions").select("version").eq("rule_code", data.code).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Não foi possível carregar os dados.");
    const version = (last?.version ?? 0) + 1, id = crypto.randomUUID();
    const { encryptPld } = await import("./pld-crypto.server");
    const { error: insertError } = await admin.from("pld_rule_versions").insert({ id, rule_code: data.code, version, enabled: data.enabled, created_by: context.userId, parameters_enc: encryptPld({ parameters: data.parameters, justification: data.justification }, `rule:${id}`, key) });
    if (insertError) throw new Error("Não foi possível salvar a regra. Atualize e tente novamente.");
    const { logAudit } = await import("./audit.server");
    await logAudit(admin, { userId: context.userId, action: "pld.rule_version_created", resource: "pld_rule", resourceId: id, metadata: { version, enabled: data.enabled } });
    return { ok: true };
  });

export const runPldObservation = createServerFn({ method: "POST" }).middleware([requireMfaAuth])
  .inputValidator(i => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdminPage } = await import("./admin-session.server");
    const { admin } = await assertAdminPage(context);
    const { consumeRateLimit, logAudit } = await import("./audit.server");
    const limit = await consumeRateLimit(admin, { scope: "pld_observation", identifier: context.userId, maxAttempts: 10, windowSeconds: 600, blockSeconds: 600 });
    if (!limit.allowed) throw new Error("Muitas consultas seguidas. Aguarde um pouco e tente novamente.");
    const key = process.env["WIIZEPAY_ENCRYPTION_KEY"] ?? process.env["WISE_PAY_ENCRYPTION_KEY"];
    if (!key) throw new Error("Conteúdo protegido indisponível.");
    const { data: versions, error } = await admin.from("pld_rule_versions").select("*").order("version", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os dados.");
    const latest = new Map<string, NonNullable<typeof versions>[number]>();
    for (const v of versions ?? []) if (!latest.has(v.rule_code)) latest.set(v.rule_code, v);
    let created = 0, insufficient = 0;
    const { encryptPld, decryptPld } = await import("./pld-crypto.server");
    const { tokenFingerprint } = await import("./crypto.server");
    for (const rule of latest.values()) {
      if (!rule.enabled) continue;
      const stored = decryptPld(rule.parameters_enc, `rule:${rule.id}`, key) as { parameters: PldParameters };
      const p = pldParameters.parse(stored.parameters), code = pldRuleCode.parse(rule.rule_code);
      const end = new Date(); end.setUTCHours(0,0,0,0);
      const start = new Date(end.getTime() - p.windowDays * 86400000), prev = new Date(start.getTime() - p.windowDays * 86400000);
      const [{ data: payments, error: payError }, { data: withdrawals, error: wError }, { data: refunds, error: rError }] = await Promise.all([
        admin.from("payments").select("id,gross_amount,paid_at,last_provider_event_id,provider_payment_id,provider_connection_id,status").eq("tenant_id", data.tenantId).eq("provider", "asaas").gte("paid_at", prev.toISOString()).lt("paid_at", end.toISOString()).limit(10001),
        admin.from("withdrawals").select("id,amount,requested_at").eq("tenant_id", data.tenantId).not("status","in","(failed,cancelled)").gte("requested_at",start.toISOString()).lt("requested_at",end.toISOString()).limit(10001),
        admin.from("refunds").select("id,refund_amount,completed_at").eq("tenant_id", data.tenantId).eq("status","completed").gte("completed_at",start.toISOString()).lt("completed_at",end.toISOString()).limit(10001),
      ]);
      if (payError || wError || rError || (payments?.length ?? 0)>10000 || (withdrawals?.length ?? 0)>10000 || (refunds?.length ?? 0)>10000) throw new Error("Dados insuficientes ou volume acima do limite de análise. Reduza o período.");
      const rows = (payments ?? []).filter(r => r.paid_at).map(r => ({ id:r.id,amount:String(r.gross_amount),paidAt:r.paid_at ?? "",providerConfirmed:Boolean(r.provider_payment_id && r.provider_connection_id && r.last_provider_event_id && ["paid","refunded"].includes(r.status)) }));
      const result = evaluatePldRule(code,p,rows.filter(r => r.paidAt>=start.toISOString()),rows.filter(r => r.paidAt<start.toISOString()),(withdrawals ?? []).map(r => ({ id:r.id,amount:String(r.amount),requestedAt:r.requested_at })),(refunds ?? []).map(r => ({ id:r.id,amount:String(r.refund_amount),completedAt:r.completed_at ?? "" })));
      if (!result.sufficient) insufficient++;
      if (!result.matched) continue;
      const id = crypto.randomUUID(), sourceKey = tokenFingerprint(`${data.tenantId}:${rule.id}:${end.toISOString()}`);
      const content = encryptPld({ reason: "Indicador de movimentação para análise humana", ...result, rule: code, ruleVersion:rule.version, source:"asaas_confirmed_records", from:start.toISOString(),to:end.toISOString() }, `${data.tenantId}:${id}`,key);
      const { data: inserted, error: insertError } = await admin.from("pld_cases").upsert({ id,tenant_id:data.tenantId,rule_version_id:rule.id,source_key:sourceKey,content_enc:content },{ onConflict:"source_key",ignoreDuplicates:true }).select("id");
      if (insertError) throw new Error("Não foi possível registrar o alerta.");
      created += inserted?.length ?? 0;
    }
    await logAudit(admin,{ userId:context.userId,tenantId:data.tenantId,action:"pld.observation_completed",metadata:{ created,insufficient } });
    return { created,insufficient };
  });