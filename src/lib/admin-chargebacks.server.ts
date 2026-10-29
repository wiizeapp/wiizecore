import { assertAdminPage, type AdminContext } from "./admin-session.server";
import { isCheckoutThreeDsEnabled } from "./threeds.server";
import { threeDsOperationallyEnabled } from "./three-ds-policy";
import { logAudit } from "./audit.server";

export async function readAdminChargebacks(context: AdminContext, input: { page: number; tenantId?: string; status?: string }) {
  const { admin } = await assertAdminPage(context);
  let cases = admin.from("chargeback_cases").select("id, tenant_id, payment_id, amount, reason, status, internal_status, defense_state, dispute_deadline, created_at, synced_at", { count: "exact" });
  let attempts = admin.from("payment_authentications").select("id, tenant_id, payment_id, modality, status, auth_result, capture_status, started_at, completed_at");
  if (input.tenantId) { cases = cases.eq("tenant_id", input.tenantId); attempts = attempts.eq("tenant_id", input.tenantId); }
  if (input.status) cases = cases.eq("status", input.status);
  const [c, a, control] = await Promise.all([
    cases.order("created_at", { ascending: false }).range(input.page * 25, input.page * 25 + 24),
    attempts.order("started_at", { ascending: false }).limit(25),
    admin.from("checkout_3ds_control").select("allowed, updated_at").eq("id", "checkout").maybeSingle(),
  ]);
  if (c.error || a.error || control.error) throw new Error("Não foi possível consultar as contestações agora.");
  const tenantIds = [...new Set([...(c.data ?? []).map(r => r.tenant_id), ...(a.data ?? []).map(r => r.tenant_id)])];
  const names = tenantIds.length ? await admin.from("tenants").select("id, name").in("id", tenantIds) : { data: [], error: null };
  if (names.error) throw new Error("Não foi possível consultar as empresas agora.");
  const byId = new Map((names.data ?? []).map(t => [t.id, t.name]));
  const environmentEnabled = isCheckoutThreeDsEnabled();
  return {
    cases: (c.data ?? []).map(r => ({ ...r, amount: String(r.amount), tenantName: byId.get(r.tenant_id) ?? "—" })),
    attempts: (a.data ?? []).map(r => ({ ...r, tenantName: byId.get(r.tenant_id) ?? "—" })),
    total: c.count ?? 0,
    control: { environmentEnabled, allowed: control.data?.allowed ?? false, effective: threeDsOperationallyEnabled(environmentEnabled, control.data?.allowed ?? false), updatedAt: control.data?.updated_at ?? null },
  };
}

export async function readAdminCaseHistory(context: AdminContext, id: string) {
  const { admin } = await assertAdminPage(context);
  const { data: c, error } = await admin.from("chargeback_cases").select("id, tenant_id").eq("id", id).maybeSingle();
  if (error || !c) throw new Error("Contestação não encontrada.");
  const events = await admin.from("chargeback_events").select("id, event_type, origin, created_at").eq("case_id", c.id).eq("tenant_id", c.tenant_id).order("created_at", { ascending: false }).limit(100);
  if (events.error) throw new Error("Não foi possível consultar o histórico agora.");
  return events.data ?? [];
}

export async function setAdminThreeDs(context: AdminContext, allowed: boolean, acknowledged: boolean) {
  const { admin } = await assertAdminPage(context);
  if (allowed && (!isCheckoutThreeDsEnabled() || !acknowledged)) throw new Error("A liberação depende da configuração do ambiente e da habilitação Asaas.");
  const { error } = await admin.from("checkout_3ds_control").upsert({ id: "checkout", allowed, updated_by: context.userId, updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível atualizar o controle 3DS.");
  await logAudit(admin, { userId: context.userId, action: "admin.threeds.control_changed", resource: "checkout_3ds_control", metadata: { allowed } });
  return { allowed };
}