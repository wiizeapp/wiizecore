/**
 * Validação do Cloudflare Turnstile (regras puras, testáveis). Nunca registrar o token.
 * Qualquer resposta que não seja um "sucesso" completo e coerente é recusada (falha fechada).
 */
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION_CARD = "checkout_card";
export const TURNSTILE_ACTION_SIGNUP = "signup";
export const DEFAULT_TURNSTILE_HOSTNAMES = ["wiizepay.com", "www.wiizepay.com"];

export type TurnstileFailure =
  | "missing_token"
  | "not_configured"
  | "invalid_token"
  | "expired_or_reused"
  | "hostname_mismatch"
  | "action_mismatch"
  | "unavailable";

export type TurnstileResult = { ok: true } | { ok: false; reason: TurnstileFailure; retryable: boolean };

export function allowedHostnames(raw: string | undefined): string[] {
  const list = (raw ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : DEFAULT_TURNSTILE_HOSTNAMES;
}

type FetchLike = (url: string, init: { method: string; body: URLSearchParams; signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function verifyTurnstileToken(opts: {
  token: string | null | undefined;
  secret: string | undefined;
  remoteIp: string | null;
  hostnames: string[];
  expectedAction?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<TurnstileResult> {
  const token = (opts.token ?? "").trim();
  if (!token || token.length > 2048) return { ok: false, reason: "missing_token", retryable: true };
  if (!opts.secret) return { ok: false, reason: "not_configured", retryable: false };

  const body = new URLSearchParams({ secret: opts.secret, response: token });
  if (opts.remoteIp) body.set("remoteip", opts.remoteIp);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  let payload: Record<string, unknown>;
  try {
    const f = opts.fetchImpl ?? (fetch as unknown as FetchLike);
    const res = await f(TURNSTILE_SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
    if (!res.ok) return { ok: false, reason: "unavailable", retryable: true };
    const json = await res.json();
    if (!json || typeof json !== "object") return { ok: false, reason: "unavailable", retryable: true };
    payload = json as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "unavailable", retryable: true };
  } finally {
    clearTimeout(timer);
  }

  const codes = Array.isArray(payload["error-codes"]) ? (payload["error-codes"] as unknown[]).map(String) : [];
  if (payload["success"] !== true) {
    if (codes.includes("timeout-or-duplicate")) return { ok: false, reason: "expired_or_reused", retryable: true };
    if (codes.includes("internal-error")) return { ok: false, reason: "unavailable", retryable: true };
    if (codes.some((c) => c.includes("secret"))) return { ok: false, reason: "not_configured", retryable: false };
    return { ok: false, reason: "invalid_token", retryable: true };
  }
  const host = typeof payload["hostname"] === "string" ? payload["hostname"].toLowerCase() : "";
  if (!host || !opts.hostnames.includes(host)) return { ok: false, reason: "hostname_mismatch", retryable: false };
  if (opts.expectedAction && payload["action"] !== opts.expectedAction) return { ok: false, reason: "action_mismatch", retryable: false };
  return { ok: true };
}
