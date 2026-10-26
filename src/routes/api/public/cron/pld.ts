import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request) {
  const { authenticateWiizePayCron } = await import("@/lib/cron-auth.server");
  const denied = authenticateWiizePayCron(request);
  if (denied) return denied;
  const key = process.env["WIIZEPAY_ENCRYPTION_KEY"] ?? process.env["WISE_PAY_ENCRYPTION_KEY"];
  if (!key) return Response.json({ error:"Protected service unavailable" }, {status:503});
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: versions,error } = await admin.from("pld_rule_versions").select("rule_code,version,enabled").order("version",{ascending:false});
  if(error) return Response.json({error:"Service unavailable"},{status:503});
  const seen = new Set<string>();
  const active = (versions ?? []).filter(v=>{if(seen.has(v.rule_code)) return false;seen.add(v.rule_code);return v.enabled;});
  if(!active.length) return Response.json({ok:true,processed:0});
  const cursor = new URL(request.url).searchParams.get("after");
  if(cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) return Response.json({error:"Invalid cursor"},{status:400});
  let q=admin.from("tenants").select("id").order("id").limit(20);
  if(cursor) q=q.gt("id",cursor);
  const {data:tenants,error:tenantError}=await q;
  if(tenantError) return Response.json({error:"Service unavailable"},{status:503});
  const {observePldTenant}=await import("@/lib/pld-observation.server");
  const {logAudit}=await import("@/lib/audit.server");
  let processed=0,failed=0;
  for(const tenant of tenants ?? []){
    try {await observePldTenant(admin,tenant.id,key,null);processed++;}
    catch {failed++;await logAudit(admin,{tenantId:tenant.id,action:"pld.observation_failed",result:"failure",metadata:{reason_code:"observation_unavailable"}});}
  }
  return Response.json({ok:failed===0,processed,failed,nextAfter:tenants?.length===20 ? tenants.at(-1)?.id : null},{status:failed ? 503:200,headers:{"Cache-Control":"no-store"}});
}
export const Route=createFileRoute("/api/public/cron/pld")({server:{handlers:{POST:({request})=>run(request)}}});