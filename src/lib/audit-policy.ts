/**
 * Regras puras da auditoria: categoria, risco e limpeza de dados sensíveis.
 * Sem dependências de servidor para poder ser testada isoladamente.
 */
export type AuditCategory = "auth" | "security" | "financial" | "tenant" | "admin" | "integration" | "system";
export type AuditOrigin = "ui" | "backend" | "webhook" | "internal";
export type AuditRisk = "low" | "medium" | "high" | "critical";

const PREFIX_CATEGORY: [RegExp, AuditCategory][] = [
  [/^(auth|login|logout|session|password)\b/, "auth"],
  [/^(mfa|security|permission|access|rate_limit|financial_password)\b/, "security"],
  [/^(admin|audit)\b/, "admin"],
  [/^(payment|charge|refund|withdrawal|bank_account|anticipation|coproduction|split|invoice|wallet|coupon|reconciliation|dunning|finance|customer|subscription|pix)/, "financial"],
  [/^(tenant|team|member|invite|role|company|onboarding|activation|document|kyc)/, "tenant"],
  [/^(asaas|webhook|wiize|ext|oauth|integration|provider)/, "integration"],
];

export function categoryFor(action: string): AuditCategory {
  const a = action.toLowerCase();
  for (const [re, c] of PREFIX_CATEGORY) if (re.test(a)) return c;
  return "system";
}

export function riskFor(action: string, result: "success" | "failure" | "blocked"): AuditRisk {
  const a = action.toLowerCase();
  if (/(recovered|disabled|cross_tenant|bypass|tamper|export|role\.|privilege)/.test(a)) return result === "success" ? "high" : "critical";
  if (result === "blocked") return "high";
  if (result === "failure") return "medium";
  return "low";
}

const SECRET_KEY = /(pass(word)?|senha|secret|token|otp|totp|code|codigo|cvv|cvc|card_?number|pan|authorization|cookie|api_?key|private|jwt|session|signature|hash|enc)/i;
const MASK_KEY = /(cpf|cnpj|document|documento|tax_?id|email|phone|telefone|ip)/i;
const MAX_DEPTH = 3;
const MAX_KEYS = 30;
const MAX_STR = 200;

/** Remove quebras de linha e caracteres de controle (impede injeção em logs). */
export function cleanText(v: string, max = MAX_STR): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").slice(0, max);
}

export function maskValue(v: string): string {
  const s = String(v);
  if (s.includes("@")) {
    const [u, d] = s.split("@");
    return `${(u ?? "").slice(0, 1)}***@${d ?? ""}`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 4) return `***${digits.slice(-2)}`;
  return "***";
}

/** Limpa metadados antes de gravar: nunca guarda senhas, códigos, tokens, cartões ou documentos completos. */
export function sanitizeMetadata(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    // Números longos parecidos com cartão (13-19 dígitos) são removidos.
    if (/\b(?:\d[ -]?){13,19}\b/.test(input)) return "[removido]";
    return cleanText(input);
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (depth >= MAX_DEPTH) return "[omitido]";
  if (Array.isArray(input)) return input.slice(0, 20).map((v) => sanitizeMetadata(v, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, MAX_KEYS)) {
      const key = cleanText(k, 60);
      if (SECRET_KEY.test(key) && !/^(perm|purpose|reason_code|has_|is_)/i.test(key)) { out[key] = "[removido]"; continue; }
      if (MASK_KEY.test(key) && (typeof v === "string" || typeof v === "number")) { out[key] = maskValue(String(v)); continue; }
      out[key] = sanitizeMetadata(v, depth + 1);
    }
    return out;
  }
  return null;
}

/** Identificadores aceitos (correlação, idempotência, evento externo). */
export function safeId(v: unknown, max = 120): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9._:\-]{1,200}$/.test(s) ? s.slice(0, max) : null;
}

export const AUDIT_QUERY_MAX_DAYS = 90;
export const AUDIT_PAGE_MAX = 100;
export const AUDIT_EXPORT_MAX = 5000;

/** Limita o período de consulta do painel (máx. 90 dias). */
export function clampRange(from?: string | null, to?: string | null, now = new Date()) {
  const end = to ? new Date(to) : now;
  const safeEnd = Number.isNaN(end.getTime()) || end > now ? now : end;
  const start = from ? new Date(from) : new Date(safeEnd.getTime() - 7 * 86400000);
  const minStart = new Date(safeEnd.getTime() - AUDIT_QUERY_MAX_DAYS * 86400000);
  const safeStart = Number.isNaN(start.getTime()) || start < minStart ? minStart : start;
  return { from: safeStart.toISOString(), to: safeEnd.toISOString() };
}
