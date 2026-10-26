import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMfaAuth } from "@/lib/mfa-middleware";
import { logAudit, logSecurityEvent } from "./audit.server";
import { ALL_PERMISSIONS, effectivePermissions, isCritical, type TeamRole } from "./permissions";

type Ctx = { userId: string; claims: unknown };
const INVITE_DAYS = 7;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function sha256(value: string) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(value).digest("hex");
}

async function randomToken() {
  const { randomBytes } = await import("crypto");
  return randomBytes(32).toString("base64url");
}

/** Membro ativo atual com permissões efetivas calculadas no servidor. */
export async function loadAccess(userId: string) {
  const db = await admin();
  const { data: m } = await db
    .from("tenant_members")
    .select("id, tenant_id, role, status, permissions, custom_role_id, tenant_custom_roles(name, permissions)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!m) throw new Error("Você não pertence a nenhuma empresa ativa.");
  const custom = (m.tenant_custom_roles as { name?: string; permissions?: string[] } | null) ?? null;
  const role = m.role as TeamRole;
  return {
    memberId: m.id,
    tenantId: m.tenant_id,
    role,
    customRoleName: custom?.name ?? null,
    permissions: effectivePermissions(role, m.permissions ?? [], custom?.permissions ?? []),
  };
}

async function requirePerm(userId: string, perm: string) {
  const access = await loadAccess(userId);
  if (!access.permissions.includes(perm)) {
    const db = await admin();
    await logAudit(db, { tenantId: access.tenantId, userId, action: "permission.denied", result: "blocked", metadata: { perm } });
    throw new Error("Você não tem permissão para esta ação.");
  }
  return access;
}

function sanitizePerms(perms: unknown, role: TeamRole, granter: string[]) {
  const list = Array.isArray(perms) ? perms.filter((p): p is string => typeof p === "string") : [];
  return [...new Set(list)].filter(
    (p) => ALL_PERMISSIONS.includes(p) && granter.includes(p) && (role === "admin" || !isCritical(p)),
  );
}

function assertRoleGrant(granterRole: TeamRole, target: TeamRole) {
  if (target === "owner") throw new Error("O Proprietário não pode ser atribuído por convite.");
  if (target === "admin" && granterRole !== "owner") throw new Error("Somente o Proprietário pode definir administradores.");
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => loadAccess(context.userId));

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const access = await requirePerm(context.userId, "team.view");
    const db = await admin();
    const [{ data: members }, { data: invites }, { data: roles }] = await Promise.all([
      db
        .from("tenant_members")
        .select("id, user_id, role, status, permissions, custom_role_id, created_at, last_seen_at, deactivated_at")
        .eq("tenant_id", access.tenantId)
        .order("created_at"),
      db
        .from("tenant_invitations")
        .select("id, email, full_name, role, status, expires_at, created_at, accepted_at")
        .eq("tenant_id", access.tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("tenant_custom_roles").select("id, name, description, permissions").eq("tenant_id", access.tenantId).order("name"),
    ]);
    const ids = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const mfa = await Promise.all(
      ids.map(async (id) => {
        const { data } = await db.auth.admin.mfa.listFactors({ userId: id });
        return [id, (data?.factors ?? []).some((f) => f.status === "verified")] as const;
      }),
    );
    const mfaMap = new Map(mfa);
    const now = Date.now();
    const list = (members ?? []).map((m) => {
      const p = profiles?.find((x) => x.id === m.user_id);
      return {
        ...m,
        name: p?.full_name ?? null,
        email: p?.email ?? null,
        mfa: mfaMap.get(m.user_id) ?? false,
        online: m.status === "active" && !!m.last_seen_at && now - new Date(m.last_seen_at).getTime() < 3 * 60_000,
        isMe: m.user_id === context.userId,
      };
    });
    return {
      me: access,
      members: list,
      invites: (invites ?? []).map((i) => ({
        ...i,
        status: i.status === "pending" && new Date(i.expires_at).getTime() < now ? "expired" : i.status,
      })),
      roles: roles ?? [],
    };
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { email: string; fullName?: string; role: TeamRole; customRoleId?: string | null; permissions?: string[] }) => {
    const email = i.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
    if (!["admin", "finance", "viewer"].includes(i.role)) throw new Error("Cargo inválido.");
    return { email, fullName: i.fullName?.trim().slice(0, 120) || null, role: i.role, customRoleId: i.customRoleId || null, permissions: i.permissions ?? [] };
  })
  .handler(async ({ data, context }) => {
    const access = await requirePerm(context.userId, "team.manage");
    assertRoleGrant(access.role, data.role);
    const db = await admin();
    const { data: profile } = await db.from("profiles").select("id").eq("email", data.email).maybeSingle();
    if (profile) {
      const { data: existing } = await db
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", access.tenantId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (existing) throw new Error("Essa pessoa já faz parte da equipe.");
    }
    if (data.customRoleId) {
      const { data: r } = await db.from("tenant_custom_roles").select("id").eq("id", data.customRoleId).eq("tenant_id", access.tenantId).maybeSingle();
      if (!r) throw new Error("Cargo personalizado inválido.");
    }
    await db
      .from("tenant_invitations")
      .update({ status: "cancelled" })
      .eq("tenant_id", access.tenantId)
      .eq("email", data.email)
      .eq("status", "pending");
    const token = await randomToken();
    const { data: invite, error } = await db
      .from("tenant_invitations")
      .insert({
        tenant_id: access.tenantId,
        email: data.email,
        full_name: data.fullName,
        role: data.role,
        custom_role_id: data.customRoleId,
        permissions: sanitizePerms(data.permissions, data.role, access.permissions),
        token_hash: await sha256(token),
        invited_by: context.userId,
        expires_at: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível criar o convite.");
    await logAudit(db, { tenantId: access.tenantId, userId: context.userId, action: "team.invite.created", resource: "tenant_invitations", resourceId: invite.id, metadata: { email: data.email, role: data.role } });
    return { token };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i.id) }))
  .handler(async ({ data, context }) => {
    const access = await requirePerm(context.userId, "team.manage");
    const db = await admin();
    const token = await randomToken();
    const { data: row, error } = await db
      .from("tenant_invitations")
      .update({ token_hash: await sha256(token), status: "pending", expires_at: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", access.tenantId)
      .in("status", ["pending", "expired"])
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Convite não encontrado ou já utilizado.");
    await logAudit(db, { tenantId: access.tenantId, userId: context.userId, action: "team.invite.resent", resourceId: data.id });
    return { token };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i.id) }))
  .handler(async ({ data, context }) => {
    const access = await requirePerm(context.userId, "team.manage");
    const db = await admin();
    await db.from("tenant_invitations").update({ status: "cancelled" }).eq("id", data.id).eq("tenant_id", access.tenantId).eq("status", "pending");
    await logAudit(db, { tenantId: access.tenantId, userId: context.userId, action: "team.invite.cancelled", resourceId: data.id });
    return { ok: true };
  });

/** Leitura pública do convite (sem dados sensíveis). */
export const getInvite = createServerFn({ method: "GET" })
  .inputValidator((i: { token: string }) => ({ token: String(i.token ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const { consumeRateLimit, requestInfo } = await import("./audit.server");
    const rate = await consumeRateLimit(db, { scope: "invite_view", identifier: requestInfo().ip ?? "unknown", maxAttempts: 40, windowSeconds: 600, blockSeconds: 900 });
    if (!rate.allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
    const { data: inv } = await db
      .from("tenant_invitations")
      .select("email, full_name, role, status, expires_at, tenants(name)")
      .eq("token_hash", await sha256(data.token))
      .maybeSingle();
    if (!inv) return { found: false as const };
    const expired = new Date(inv.expires_at).getTime() < Date.now();
    return {
      found: true as const,
      email: inv.email,
      fullName: inv.full_name,
      role: inv.role as TeamRole,
      company: (inv.tenants as { name?: string } | null)?.name ?? "",
      status: inv.status === "pending" && expired ? "expired" : inv.status,
    };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { token: string }) => ({ token: String(i.token ?? "").slice(0, 200) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const email = ((context.claims as { email?: string } | null)?.email ?? "").toLowerCase();
    const { data: inv } = await db
      .from("tenant_invitations")
      .select("*")
      .eq("token_hash", await sha256(data.token))
      .maybeSingle();
    if (!inv || inv.status !== "pending" || new Date(inv.expires_at).getTime() < Date.now()) {
      throw new Error("Convite inválido, expirado ou já utilizado.");
    }
    if (inv.email !== email) {
      await logSecurityEvent(db, { userId: context.userId, tenantId: inv.tenant_id, eventType: "team.invite.email_mismatch", severity: "warning" });
      throw new Error("Entre com o mesmo e-mail que recebeu o convite.");
    }
    // Uma pessoa só pode estar ativa em uma empresa por vez.
    const { data: other } = await db.from("tenant_members").select("tenant_id").eq("user_id", context.userId).eq("status", "active").neq("tenant_id", inv.tenant_id).limit(1).maybeSingle();
    if (other) throw new Error("Você já faz parte de outra empresa ativa. Peça para ser removido dela antes de aceitar este convite.");
    const { data: claimed } = await db
      .from("tenant_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: context.userId })
      .eq("id", inv.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) throw new Error("Convite já utilizado.");
    await db.from("profiles").upsert({ id: context.userId, email, full_name: inv.full_name }, { onConflict: "id", ignoreDuplicates: true });
    const { error } = await db.from("tenant_members").upsert(
      {
        tenant_id: inv.tenant_id,
        user_id: context.userId,
        role: inv.role,
        permissions: inv.permissions,
        custom_role_id: inv.custom_role_id,
        invited_by: inv.invited_by,
        status: "active",
        deactivated_at: null,
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (error) throw new Error("Não foi possível entrar na equipe.");
    await db.from("user_roles").upsert({ user_id: context.userId, role: "user" }, { onConflict: "user_id,role" });
    await logAudit(db, { tenantId: inv.tenant_id, userId: context.userId, action: "team.invite.accepted", resourceId: inv.id });
    return { ok: true };
  });

async function targetMember(tenantId: string, memberId: string) {
  const db = await admin();
  const { data } = await db.from("tenant_members").select("id, user_id, role, permissions, custom_role_id, status").eq("id", memberId).eq("tenant_id", tenantId).maybeSingle();
  if (!data) throw new Error("Membro não encontrado.");
  return data;
}

function assertCanManage(me: { role: TeamRole; memberId: string }, target: { role: string; id: string }) {
  if (target.id === me.memberId) throw new Error("Você não pode alterar o próprio acesso.");
  if (target.role === "owner") throw new Error("O Proprietário não pode ser alterado.");
  if (target.role === "admin" && me.role !== "owner") throw new Error("Somente o Proprietário altera administradores.");
}

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { memberId: string; role: TeamRole; customRoleId?: string | null; permissions?: string[] }) => {
    if (!["admin", "finance", "viewer"].includes(i.role)) throw new Error("Cargo inválido.");
    return { memberId: String(i.memberId), role: i.role, customRoleId: i.customRoleId || null, permissions: i.permissions ?? [] };
  })
  .handler(async ({ data, context }) => {
    const me = await requirePerm(context.userId, "team.manage");
    const target = await targetMember(me.tenantId, data.memberId);
    assertCanManage(me, target);
    assertRoleGrant(me.role, data.role);
    const db = await admin();
    const permissions = sanitizePerms(data.permissions, data.role, me.permissions);
    await db.from("tenant_members").update({ role: data.role, custom_role_id: data.customRoleId, permissions }).eq("id", target.id);
    await logAudit(db, {
      tenantId: me.tenantId,
      userId: context.userId,
      action: "team.member.permissions_changed",
      resource: "tenant_members",
      resourceId: target.id,
      metadata: { before: { role: target.role, permissions: target.permissions, custom_role_id: target.custom_role_id }, after: { role: data.role, permissions, custom_role_id: data.customRoleId } },
    });
    return { ok: true };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { memberId: string; active: boolean }) => ({ memberId: String(i.memberId), active: Boolean(i.active) }))
  .handler(async ({ data, context }) => {
    const me = await requirePerm(context.userId, "team.manage");
    const target = await targetMember(me.tenantId, data.memberId);
    assertCanManage(me, target);
    const db = await admin();
    await db
      .from("tenant_members")
      .update({ status: data.active ? "active" : "deactivated", deactivated_at: data.active ? null : new Date().toISOString() })
      .eq("id", target.id);
    if (!data.active) await db.auth.admin.signOut(target.user_id).catch(() => undefined);
    await logAudit(db, { tenantId: me.tenantId, userId: context.userId, action: data.active ? "team.member.reactivated" : "team.member.deactivated", resourceId: target.id });
    return { ok: true };
  });

export const saveCustomRole = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { id?: string | null; name: string; description?: string; permissions: string[] }) => {
    const name = i.name?.trim();
    if (!name || name.length < 2) throw new Error("Informe o nome do cargo.");
    return { id: i.id || null, name: name.slice(0, 60), description: i.description?.trim().slice(0, 200) || null, permissions: i.permissions ?? [] };
  })
  .handler(async ({ data, context }) => {
    const me = await requirePerm(context.userId, "team.manage");
    const db = await admin();
    const permissions = sanitizePerms(data.permissions, "viewer", me.permissions);
    const row = { tenant_id: me.tenantId, name: data.name, description: data.description, permissions };
    const { error } = data.id
      ? await db.from("tenant_custom_roles").update(row).eq("id", data.id).eq("tenant_id", me.tenantId)
      : await db.from("tenant_custom_roles").insert({ ...row, created_by: context.userId });
    if (error) throw new Error(error.code === "23505" ? "Já existe um cargo com esse nome." : "Não foi possível salvar o cargo.");
    await logAudit(db, { tenantId: me.tenantId, userId: context.userId, action: data.id ? "team.role.updated" : "team.role.created", metadata: { name: data.name, permissions } });
    return { ok: true };
  });

export const deleteCustomRole = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i.id) }))
  .handler(async ({ data, context }) => {
    const me = await requirePerm(context.userId, "team.manage");
    const db = await admin();
    await db.from("tenant_custom_roles").delete().eq("id", data.id).eq("tenant_id", me.tenantId);
    await logAudit(db, { tenantId: me.tenantId, userId: context.userId, action: "team.role.deleted", resourceId: data.id });
    return { ok: true };
  });

/** Sinal periódico: marca online e registra página e tempo ativo. */
export const trackActivity = createServerFn({ method: "POST" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { path: string; seconds: number }) => ({
    path: String(i.path ?? "/").slice(0, 200),
    seconds: Math.max(0, Math.min(120, Math.round(Number(i.seconds) || 0))),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: m } = await db.from("tenant_members").select("id, tenant_id").eq("user_id", context.userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!m) return { ok: false };
    await Promise.all([
      db.from("tenant_members").update({ last_seen_at: new Date().toISOString() }).eq("id", m.id),
      db.from("user_activity").insert({ tenant_id: m.tenant_id, user_id: context.userId, path: data.path, active_seconds: data.seconds }),
    ]);
    return { ok: true };
  });

export const getMemberDetail = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .inputValidator((i: { memberId: string }) => ({ memberId: String(i.memberId) }))
  .handler(async ({ data, context }) => {
    const me = await requirePerm(context.userId, "team.view");
    const target = await targetMember(me.tenantId, data.memberId);
    const db = await admin();
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [{ data: activity }, { data: audits }, { data: sessions }] = await Promise.all([
      db.from("user_activity").select("path, active_seconds, created_at").eq("tenant_id", me.tenantId).eq("user_id", target.user_id).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      me.permissions.includes("audit.view")
        ? db.from("audit_logs").select("action, result, ip_address, created_at").eq("tenant_id", me.tenantId).eq("user_id", target.user_id).order("created_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as { action: string; result: string; ip_address: string | null; created_at: string }[] }),
      db.from("user_sessions").select("ip_address, user_agent, last_seen_at").eq("user_id", target.user_id).order("last_seen_at", { ascending: false }).limit(10),
    ]);
    const pages = new Map<string, number>();
    let total = 0;
    for (const a of activity ?? []) {
      total += a.active_seconds;
      pages.set(a.path, (pages.get(a.path) ?? 0) + a.active_seconds);
    }
    return {
      totalSeconds30d: total,
      topPages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, seconds]) => ({ path, seconds })),
      recent: (activity ?? []).slice(0, 15),
      audits: audits ?? [],
      sessions: sessions ?? [],
    };
  });

export const listTeamAudit = createServerFn({ method: "GET" })
  .middleware([requireMfaAuth])
  .handler(async ({ context }) => {
    const me = await requirePerm(context.userId, "audit.view");
    const db = await admin();
    const { data } = await db
      .from("audit_logs")
      .select("id, user_id, action, result, ip_address, created_at, metadata")
      .eq("tenant_id", me.tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export type { Ctx };
