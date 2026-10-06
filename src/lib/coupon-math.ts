/** Regras puras de cupom. O valor definitivo é sempre recalculado no banco (reserve_coupon). */
export const MIN_CHARGE = 5;

export function normalizeCouponCode(raw: string) {
  return raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toUpperCase();
}

export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export function computeCouponDiscount(input: { type: "percent" | "fixed"; value: number; maxDiscount?: number | null; base: number }) {
  if (!(input.base > 0) || !(input.value > 0)) return 0;
  let d = input.type === "percent" ? Math.round(input.base * Math.min(input.value, 100)) / 100 : input.value;
  if (input.maxDiscount != null && input.maxDiscount > 0) d = Math.min(d, input.maxDiscount);
  d = Math.min(d, Math.max(input.base - MIN_CHARGE, 0));
  return Math.max(0, Math.round(d * 100) / 100);
}

export function applyDiscount(total: number, discount: number) {
  return Math.max(MIN_CHARGE, Math.round((total - discount) * 100) / 100);
}
