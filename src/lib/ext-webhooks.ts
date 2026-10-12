import { createHmac, timingSafeEqual } from "node:crypto";

/** Eventos que a Integração Externa realmente envia. */
export const EXT_EVENTS = [
  "checkout.session.created",
  "payment.created",
  "payment.updated",
  "payment.confirmed",
  "payment.overdue",
  "payment.cancelled",
  "payment.refunded",
  "subscription.created",
  "subscription.renewed",
  "subscription.overdue",
  "subscription.cancelled",
] as const;
export type ExtEvent = (typeof EXT_EVENTS)[number];
export const SIGNATURE_TOLERANCE_S = 300;
export const MAX_ATTEMPTS = 12;

export function sanitizeEvents(input: unknown): ExtEvent[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input)].filter((e): e is ExtEvent => (EXT_EVENTS as readonly string[]).includes(e as string));
}

/** Mapeia o motivo interno para o evento público. */
export function eventForTrigger(trigger: string, kind: "one_time" | "installment" | "recurring", paidCount: number): ExtEvent {
  const sub = kind === "recurring";
  switch (trigger) {
    case "created": return sub ? "subscription.created" : "payment.created";
    case "payment_received": return sub && paidCount > 1 ? "subscription.renewed" : "payment.confirmed";
    case "overdue": return sub ? "subscription.overdue" : "payment.overdue";
    case "cancelled": return sub ? "subscription.cancelled" : "payment.cancelled";
    case "refunded": return "payment.refunded";
    default: return "payment.updated";
  }
}

/** Cabeçalho `WiizePay-Signature: t=<unix>,v1=<hex hmac-sha256 de "t.corpo">`. */
export function signExtWebhook(secret: string, timestamp: number, body: string) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** Verificação usada pelo SaaS (também documentada). */
export function verifyExtWebhook(secret: string, header: string | null, body: string, nowS = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts["t"]);
  if (!Number.isInteger(t) || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S || !/^[a-f0-9]{64}$/.test(parts["v1"] ?? "")) return false;
  const expected = Buffer.from(signExtWebhook(secret, t, body).split("v1=")[1]!);
  const got = Buffer.from(parts["v1"]!);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Espera crescente: 1, 2, 4… minutos, até 6 horas. */
export function nextBackoffMs(attempts: number) {
  return Math.min(6 * 3600_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}
