import { evaluatePldRule, pldParameters, pldRuleCode, type PldParameters } from "./pld-rules";

export async function observePldTenant(admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"], tenantId: string, key: string, actorId: string | null) {
  const { logAudit } = await import("./audit.server");
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
      const { data: raw, error: sourceError } = await admin.rpc("pld_observation_sources", { _tenant: tenantId, _previous: prev.toISOString(), _start: start.toISOString(), _end: end.toISOString() });
      const source = raw as unknown as { payments: {id:string;amount:string;paid_at:string;last_provider_event_id:string|null;provider_payment_id:string|null;provider_connection_id:string|null;status:string}[]; withdrawals:{id:string;amount:string;requested_at:string}[];refunds:{id:string;amount:string;completed_at:string}[] };
      if (sourceError || !source || source.payments.length>10000 || source.withdrawals.length>10000 || source.refunds.length>10000) throw new Error("Dados insuficientes ou volume acima do limite de análise. Reduza o período.");
      const rows = source.payments.map(r => ({ id:r.id,amount:r.amount,paidAt:r.paid_at,providerConfirmed:Boolean(r.provider_payment_id && r.provider_connection_id && r.last_provider_event_id && ["paid","refunded"].includes(r.status)) }));
      const result = evaluatePldRule(code,p,rows.filter(r => r.paidAt>=start.toISOString()),rows.filter(r => r.paidAt<start.toISOString()),source.withdrawals.map(r => ({id:r.id,amount:r.amount,requestedAt:r.requested_at})),source.refunds.map(r => ({id:r.id,amount:r.amount,completedAt:r.completed_at})));
      if (!result.sufficient) insufficient++;
      if (!result.matched) continue;
      const id = crypto.randomUUID(), sourceKey = tokenFingerprint(`${tenantId}:${rule.id}:${end.toISOString()}`);
      const content = encryptPld({ reason: "Indicador de movimentação para análise humana", ...result, rule: code, ruleVersion:rule.version, source:"asaas_confirmed_records", from:start.toISOString(),to:end.toISOString() }, `${tenantId}:${id}`,key);
      const { data: inserted, error: insertError } = await admin.rpc("pld_create_alert", { _id:id,_tenant:tenantId,_rule:rule.id,_source:sourceKey,_enc:content });
      if (insertError) throw new Error("Não foi possível registrar o alerta.");
      created += inserted ? 1 : 0;
    }
    await logAudit(admin,{ userId:actorId,tenantId:tenantId,action:"pld.observation_completed",metadata:{ created,insufficient } });
    return { created,insufficient };
}
