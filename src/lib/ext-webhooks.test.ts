import { describe, expect, it } from "vitest";
import { eventForTrigger, nextBackoffMs, sanitizeEvents, signExtWebhook, verifyExtWebhook } from "./ext-webhooks";
import { isSafeWebhookUrl } from "./ext-webhooks.functions";

describe("webhooks da integração externa", () => {
  const now = 1_800_000_000;
  it("assinatura válida passa; corpo alterado, segredo errado e horário velho falham", () => {
    const h = signExtWebhook("whsec_a", now, '{"a":1}');
    expect(verifyExtWebhook("whsec_a", h, '{"a":1}', now)).toBe(true);
    expect(verifyExtWebhook("whsec_a", h, '{"a":2}', now)).toBe(false);
    expect(verifyExtWebhook("whsec_b", h, '{"a":1}', now)).toBe(false);
    expect(verifyExtWebhook("whsec_a", h, '{"a":1}', now + 301)).toBe(false);
    expect(verifyExtWebhook("whsec_a", null, "{}", now)).toBe(false);
  });
  it("mapeia eventos por tipo de cobrança", () => {
    expect(eventForTrigger("payment_received", "one_time", 1)).toBe("payment.confirmed");
    expect(eventForTrigger("payment_received", "recurring", 3)).toBe("subscription.renewed");
    expect(eventForTrigger("cancelled", "recurring", 0)).toBe("subscription.cancelled");
    expect(eventForTrigger("overdue", "installment", 0)).toBe("payment.overdue");
  });
  it("espera cresce e tem teto", () => {
    expect(nextBackoffMs(1)).toBe(60_000);
    expect(nextBackoffMs(3)).toBe(240_000);
    expect(nextBackoffMs(30)).toBe(6 * 3600_000);
  });
  it("só aceita eventos conhecidos e URLs públicas https", () => {
    expect(sanitizeEvents(["payment.confirmed", "x"])).toEqual(["payment.confirmed"]);
    expect(isSafeWebhookUrl("https://app.exemplo.com/wh")).toBe(true);
    for (const u of ["http://a.com", "https://localhost/x", "https://10.0.0.1/", "https://[::1]/", "https://u:p@a.com/"]) expect(isSafeWebhookUrl(u)).toBe(false);
  });
});
