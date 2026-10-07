import { logAudit, logSecurityEvent } from "./audit.server";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const FINANCIAL_PASSWORD_MAX_ATTEMPTS = 3;
export const FINANCIAL_PASSWORD_LOCK_MINUTES = 60;

function lockMessage(until: string) {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
  return `Sistema bloqueado por segurança após ${FINANCIAL_PASSWORD_MAX_ATTEMPTS} tentativas erradas da senha financeira. Tente novamente em ${mins} minuto(s).`;
}

async function tenantOf(admin: AdminClient, userId: string) {
  const { data } = await admin.from("tenant_members").select("tenant_id").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  return data?.tenant_id ?? null;
}

/** Confere a senha financeira. 3 erros seguidos (somando todos os usuários da empresa) bloqueiam a empresa inteira por 60 minutos. */
export async function assertFinancialPassword(admin: AdminClient, userId: string, password: string, purpose: string) {
  const { verifySecretValue } = await import("./crypto.server");
  const tenantId = await tenantOf(admin, userId);
  const { data: tenant } = tenantId
    ? await admin.from("tenants").select("financial_failed_attempts, financial_locked_until").eq("id", tenantId).maybeSingle()
    : { data: null };
  if (tenant?.financial_locked_until && new Date(tenant.financial_locked_until) > new Date()) {
    throw new Error(lockMessage(tenant.financial_locked_until));
  }
  const { data: credential } = await admin
    .from("financial_credentials")
    .select("password_hash, failed_attempts, locked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!credential) throw new Error("Cadastre sua senha financeira antes de continuar.");
  if (credential.locked_until && new Date(credential.locked_until) > new Date()) {
    throw new Error(lockMessage(credential.locked_until));
  }
  if (!password || !verifySecretValue(password, credential.password_hash)) {
    const attempts = Math.max(tenant?.financial_failed_attempts ?? 0, credential.failed_attempts) + 1;
    const lock = attempts >= FINANCIAL_PASSWORD_MAX_ATTEMPTS;
    const until = lock ? new Date(Date.now() + FINANCIAL_PASSWORD_LOCK_MINUTES * 60 * 1000).toISOString() : null;
    await admin
      .from("financial_credentials")
      .update({ failed_attempts: lock ? 0 : attempts, locked_until: until })
      .eq("user_id", userId);
    if (tenantId) {
      await admin
        .from("tenants")
        .update({ financial_failed_attempts: lock ? 0 : attempts, financial_locked_until: until })
        .eq("id", tenantId);
    }
    await logSecurityEvent(admin, {
      userId,
      tenantId,
      eventType: lock ? "financial_password.locked" : "financial_password.invalid",
      severity: lock ? "critical" : "warning",
      metadata: { purpose, attempts },
    });
    await logAudit(admin, { userId, tenantId, action: "financial_password.verify", result: "failure", metadata: { purpose } });
    if (lock) throw new Error(lockMessage(until!));
    const left = FINANCIAL_PASSWORD_MAX_ATTEMPTS - attempts;
    throw new Error(
      left === 1
        ? "Senha financeira incorreta. Atenção: resta só 1 tentativa antes de o sistema da empresa ser bloqueado por 60 minutos."
        : `Senha financeira incorreta. Restam ${left} tentativas antes do bloqueio da empresa.`,
    );
  }
  await admin
    .from("financial_credentials")
    .update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (tenantId) await admin.from("tenants").update({ financial_failed_attempts: 0 }).eq("id", tenantId);
  await logAudit(admin, { userId, tenantId, action: "financial_password.verify", metadata: { purpose } });
}

/** Data até quando a empresa do usuário está bloqueada (ou null). */
export async function getFinancialLockUntil(admin: AdminClient, userId: string) {
  const tenantId = await tenantOf(admin, userId);
  if (!tenantId) return null;
  const { data } = await admin.from("tenants").select("financial_locked_until").eq("id", tenantId).maybeSingle();
  const until = data?.financial_locked_until;
  return until && new Date(until) > new Date() ? until : null;
}

/** Lança erro se a empresa estiver bloqueada pela senha financeira. */
export async function assertNotFinanciallyLocked(admin: AdminClient, userId: string) {
  const until = await getFinancialLockUntil(admin, userId);
  if (until) throw new Error(lockMessage(until));
}

/** Exige sessão com verificação em duas etapas concluída (aal2). */
export function assertTwoFactor(claims: unknown) {
  const aal = (claims as { aal?: string } | null)?.aal;
  if (aal !== "aal2") {
    throw new Error("Confirme o código da verificação em duas etapas para continuar.");
  }
}

/** 2FA opcional para usuários: se a pessoa ativou o autenticador, a sessão precisa estar confirmada (aal2). */
export async function assertTwoFactorIfEnrolled(claims: unknown, userId: string) {
  const aal = (claims as { aal?: string } | null)?.aal;
  if (aal === "aal2") return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error("Não foi possível confirmar sua segurança agora. Tente novamente.");
  if ((data?.factors ?? []).some((f) => f.status === "verified")) {
    throw new Error("Confirme o código da verificação em duas etapas para continuar.");
  }
}
