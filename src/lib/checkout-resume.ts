/** Browser drafts are convenience only: never payment, consent or authorization evidence. */
export const CHECKOUT_DRAFT_TTL = 2 * 60 * 60 * 1000;
export const CHECKOUT_CUSTOMER_FIELDS = ["email", "phone", "zipCode", "address", "addressNumber", "complement", "district", "city", "state"] as const;
export const CHECKOUT_SERVICE_FIELDS = ["name", "document", "email", "phone"] as const;

export function checkoutPollInterval(payments: readonly { status: string }[]): number | false {
  return payments.some(p => ["created", "awaiting_payment", "overdue", "processing", "in_analysis"].includes(p.status)) ? 8000 : false;
}

export function encodeCheckoutDraft(fields: readonly string[], value: Record<string, string>, now = Date.now()): string {
  const draft: Record<string, string> = {};
  for (const field of fields) if (typeof value[field] === "string") draft[field] = value[field].slice(0, 200);
  return JSON.stringify({ version: 1, expiresAt: now + CHECKOUT_DRAFT_TTL, draft });
}

export function decodeCheckoutDraft(fields: readonly string[], raw: string | null, now = Date.now()): Record<string, string> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + CHECKOUT_DRAFT_TTL || !value.draft || typeof value.draft !== "object") return null;
    const draft: Record<string, string> = {};
    for (const field of fields) if (typeof value.draft[field] === "string") draft[field] = value.draft[field].slice(0, 200);
    return draft;
  } catch { return null; }
}