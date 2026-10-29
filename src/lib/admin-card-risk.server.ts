import { assertAdminPage, type AdminContext } from "./admin-session.server";
import { canDecide, type CardRiskAction } from "./card-risk-rules";
import { logAudit } from "./audit.server";

const PAGE = 25;
const SAFE_CASE = "id, tenant_id, subject_kind, level, reasons, status, blocked_until, attempts, last_payment_id, first_seen_at, last_seen_at, version";

export type CardRiskListInput = {
  page: number; status?: string | undefined; level?: string | undefined; reason?: string | undefined;
  tenantId?: string | undefined; days: number; search?: string | undefined;
};

/** Lista casos reais com projeção segura (sem marcas de IP/cartão). Somente Admin com 2FA + senha financeira. */
export async function readCardRiskCases(context: AdminContext, input: CardRiskListInput) {
  const { admin } = await assertAdminPage(context);
  const since = new Date(Date.now() - input.days * 86400_000).toISOString();
  let q = admin.from("card_risk_cases").select(SAFE_CASE, { count: "exact" }).gte("last_seen_at", since);
  if (input.status) q = q.eq("status", input.status);
  if (input.level) q = q.eq("level", input.level);
  if (input.reason) q = q.contains("reasons", [input.reason]);
  if (input.tenantId) q = q.eq("tenant_id", input.tenantId);
  if (input.search) q = /^[0-9a-f-]{36}$/i.test(input.search) ? q.or(`id.eq.${input.search},last_payment_id.eq.${input.search}`) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  const now = new Date().toISOString();
  const [list, events, open, blocked, reviewed] = await Promise.all([
    q.order("last_seen_at", { ascending: false }).range(input.page * PAGE, input.page * PAGE + PAGE - 1),
    admin.from("security_events").select("id", { count: "exact", head: true }).in("event_type", ["checkout.card_risk_alert", "checkout.card_risk_blocked"]).gte("created_at", since),
    admin.from("card_risk_cases").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("card_risk_cases").select("id", { count: "exact", head: true }).gt("blocked_until", now),
    admin.from("card_risk_cases").select("id", { count: "exact", head: true }).in("status", ["confirmed", "false_positive", "closed"]).gte("last_seen_at", since),
  ]);
  if (list.error) throw new Error("Não foi possível carregar os casos.");
  const ids = [...new Set((list.data ?? []).map((c) => c.tenant_id))];
  const { data: tenants } = ids.length ? await admin.from("tenants").select("id, name").in("id", ids) : { data: [] };
  const names = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  return {
    summary: { events: events.count ?? 0, open: open.count ?? 0, blocked: blocked.count ?? 0, reviewed: reviewed.count ?? 0 },
    cases: (list.data ?? []).map((c) => ({ ...c, tenantName: names.get(c.tenant_id) ?? "—", blockActive: Boolean(c.blocked_until && c.blocked_until > now) })),
    total: list.count ?? 0,
  };
}

export async function readCardRiskHistory(context: AdminContext, caseId: string) {
  const { admin } = await assertAdminPage(context);
  const { data, error } = await admin.from("card_risk_decisions").select("id, actor_id, action, justification, created_at").eq("case_id", caseId).order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar o histórico.");
  const actors = [...new Set((data ?? []).map((d) => d.actor_id))];
  const { data: profiles } = actors.length ? await admin.from("profiles").select("id, email").in("id", actors) : { data: [] };
  const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  return (data ?? []).map((d) => ({ id: d.id, action: d.action, justification: d.justification, created_at: d.created_at, actor: emails.get(d.actor_id) ?? "Administrador" }));
}

/** Decisão administrativa: validação de transição, versão esperada (evita repetição) e auditoria. */
export async function decideCardRiskCase(context: AdminContext, input: { caseId: string; action: CardRiskAction; justification: string; version: number }) {
  const { admin } = await assertAdminPage(context, true);
  const { data: current } = await admin.from("card_risk_cases").select("status, version").eq("id", input.caseId).maybeSingle();
  if (!current) throw new Error("Caso não encontrado.");
  if (!canDecide(current.status, input.action)) throw new Error("Esta decisão não é permitida para o status atual.");
  const { data, error } = await (admin as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: { message?: string } | null }> }).rpc("card_risk_decide", {
    _case: input.caseId, _actor: context.userId, _action: input.action, _justification: input.justification, _expected_version: input.version,
  });
  if (error) throw new Error(error.message?.includes("stale_version") ? "O caso foi alterado por outra pessoa. Atualize e tente novamente." : "Não foi possível registrar a decisão.");
  await logAudit(admin, { userId: context.userId, action: `admin.card_risk.${input.action}`, resource: "card_risk_cases", resourceId: input.caseId, metadata: { previousStatus: current.status } });
  const row = (Array.isArray(data) ? data[0] : data) as { status: string; version: number };
  return row;
}
