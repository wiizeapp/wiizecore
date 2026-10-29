import { describe, expect, it } from "vitest";
import { CHECKOUT_CUSTOMER_FIELDS, CHECKOUT_DRAFT_TTL, checkoutPollInterval, decodeCheckoutDraft, encodeCheckoutDraft } from "./checkout-resume";

describe("checkout draft safety", () => {
  it("recovers typed contact and address values", () => {
    const raw = encodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, { email: "teste@example.com", phone: "11999999999", addressNumber: "42" }, 100);
    expect(decodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, raw, 200)).toEqual({ email: "teste@example.com", phone: "11999999999", addressNumber: "42" });
  });
  it("never persists card data, signatures, consent or payment status", () => {
    const raw = encodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, { email: "teste@example.com", number: "4111111111111111", expiry: "12/30", ccv: "123", signature: "signature", acceptedTerms: "true", status: "paid", session: "credential" }, 100);
    expect(JSON.parse(raw).draft).toEqual({ email: "teste@example.com" });
  });
  it("also rejects injected unapproved fields when restoring", () => {
    expect(decodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, JSON.stringify({ version: 1, expiresAt: 500, draft: { email: "teste@example.com", status: "paid", acceptedTerms: "true", ccv: "123" } }), 100)).toEqual({ email: "teste@example.com" });
  });
  it("expires after two hours", () => {
    const raw = encodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, { phone: "11999999999" }, 100);
    expect(decodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, raw, 100 + CHECKOUT_DRAFT_TTL - 1)).toEqual({ phone: "11999999999" });
    expect(decodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, raw, 100 + CHECKOUT_DRAFT_TTL)).toBeNull();
  });
  it("ignores corrupt and future-dated drafts", () => {
    expect(decodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, "broken")).toBeNull();
    expect(decodeCheckoutDraft(CHECKOUT_CUSTOMER_FIELDS, JSON.stringify({ version: 1, expiresAt: CHECKOUT_DRAFT_TTL + 101, draft: {} }), 100)).toBeNull();
  });
});

describe("official payment status monitoring", () => {
  for (const status of ["created", "awaiting_payment", "overdue", "processing", "in_analysis"]) {
    it(`keeps refreshing ${status}`, () => { expect(checkoutPollInterval([{ status }])).toBe(8000); });
  }
  for (const status of ["paid", "cancelled", "refunded", "failed"]) {
    it(`does not poll terminal ${status}`, () => { expect(checkoutPollInterval([{ status }])).toBe(false); });
  }
  it("keeps monitoring the next recurring or installment payment", () => {
    expect(checkoutPollInterval([{ status: "paid" }, { status: "awaiting_payment" }])).toBe(8000);
  });
});