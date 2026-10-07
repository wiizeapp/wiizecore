import { describe, expect, it } from "vitest";
import { calculateFeeFromConfig } from "./fee-engine.server";
import { addCalendarMonths, isLaunchPromoActive, isLaunchPromoMethod, launchPromoEndsAt, shouldSendPromoReminder } from "./launch-promotion";

const NEW = "2026-10-07T15:00:00Z";
const OLD = "2026-09-01T12:00:00Z";
const cfg = { id: "c", fixed_fee: "1.99", percentage_fee: "1.49" };
const fee = (promo: boolean) => calculateFeeFromConfig({ grossAmount: "100", installments: 1, paymentMethod: "pix", config: promo ? { ...cfg, percentage_fee: 0 } : cfg });

describe("promoção de lançamento", () => {
  it("3 meses de calendário, não 90 dias", () => {
    expect(launchPromoEndsAt(NEW)!.toISOString()).toBe("2027-01-07T15:00:00.000Z");
    expect(addCalendarMonths(new Date("2026-10-31T12:00:00Z"), 3).toISOString()).toBe("2027-01-31T12:00:00.000Z");
    expect(addCalendarMonths(new Date("2026-11-30T12:00:00Z"), 3).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });
  it("conta nova hoje: ativa; no instante do fim e depois: expirada", () => {
    expect(isLaunchPromoActive(NEW, new Date("2026-10-08T00:00:00Z"))).toBe(true);
    expect(isLaunchPromoActive(NEW, new Date("2027-01-07T14:59:59.999Z"))).toBe(true);
    expect(isLaunchPromoActive(NEW, new Date("2027-01-07T15:00:00Z"))).toBe(false);
    expect(isLaunchPromoActive(NEW, new Date("2027-03-01T00:00:00Z"))).toBe(false);
  });
  it("conta antiga nunca recebe", () => {
    expect(isLaunchPromoActive(OLD, new Date("2026-10-08T00:00:00Z"))).toBe(false);
    expect(isLaunchPromoActive(null, new Date())).toBe(false);
  });
  it("somente Pix e boleto à vista", () => {
    expect(isLaunchPromoMethod("pix", true)).toBe(true);
    expect(isLaunchPromoMethod("boleto", true)).toBe(true);
    expect(isLaunchPromoMethod("boleto", false)).toBe(false); // parcelado
    expect(isLaunchPromoMethod("pix", false)).toBe(false); // parcelado
    expect(isLaunchPromoMethod("pix_recurring", true)).toBe(false);
    expect(isLaunchPromoMethod("credit_card", true)).toBe(false);
    expect(isLaunchPromoMethod("debit_card", true)).toBe(false);
  });
  it("0% percentual mantém a tarifa fixa; fora dela usa a taxa original", () => {
    expect(fee(true).percentageFeeCents).toBe(0);
    expect(fee(true).fixedFeeCents).toBe(199);
    expect(fee(false).percentageFeeCents).toBe(149);
    expect(fee(false).totalFeeCents).toBe(348);
  });
  it("cálculo repetido não renova: o fim depende só da criação da conta", () => {
    const a = launchPromoEndsAt(NEW)!.getTime();
    for (let i = 0; i < 5; i++) expect(launchPromoEndsAt(NEW)!.getTime()).toBe(a);
  });
  it("lembrete: 8 dias não; 7 dias sim; depois do fim não", () => {
    expect(shouldSendPromoReminder(NEW, new Date("2026-12-30T15:00:00Z"))).toBe(false);
    expect(shouldSendPromoReminder(NEW, new Date("2026-12-31T15:00:00Z"))).toBe(true);
    expect(shouldSendPromoReminder(NEW, new Date("2027-01-07T15:00:00Z"))).toBe(false);
  });
});
