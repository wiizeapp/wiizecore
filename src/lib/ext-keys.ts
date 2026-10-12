/** Regras puras das chaves da Integração Externa (sem acesso ao banco). */
export const EXT_SCOPES = [
  "services:read",
  "customers:read",
  "customers:write",
  "charges:read",
  "charges:write",
  "subscriptions:read",
  "subscriptions:write",
  "checkout_sessions:write",
] as const;
export type ExtScope = (typeof EXT_SCOPES)[number];
export type ExtEnv = "test" | "live";

export function sanitizeScopes(input: unknown): ExtScope[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input)].filter((s): s is ExtScope => (EXT_SCOPES as readonly string[]).includes(s as string));
}

const SECRET_RE = /^sk_(test|live)_[A-Za-z0-9_-]{32,}$/;
export function parseSecretKey(raw: string | null | undefined): { env: ExtEnv; key: string } | null {
  const v = (raw ?? "").replace(/^Bearer\s+/i, "").trim();
  const m = SECRET_RE.exec(v);
  return m ? { env: m[1] as ExtEnv, key: v } : null;
}

export function maskSecret(prefix: string, last4: string) {
  return `${prefix}${"•".repeat(12)}${last4}`;
}
