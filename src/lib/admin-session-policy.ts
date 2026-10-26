export const ADMIN_IDLE_MS = 5 * 60 * 1000;
export const ADMIN_MAX_MS = 30 * 60 * 1000;
export const ADMIN_CHALLENGE_MS = 2 * 60 * 1000;

export function adminGrantValid(grant: { userId: string; sessionId: string; issuedAt: number; lastActivity: number; revoked: boolean }, userId: string, sessionId: string, now: number) {
  return !grant.revoked && grant.userId === userId && grant.sessionId === sessionId &&
    now >= grant.issuedAt && now < grant.issuedAt + ADMIN_MAX_MS && now < grant.lastActivity + ADMIN_IDLE_MS;
}

export function freshChallengeValid(issuedAt: number, consumed: boolean, now: number) {
  return !consumed && now >= issuedAt && now < issuedAt + ADMIN_CHALLENGE_MS;
}