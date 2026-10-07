/**
 * Promoção de lançamento (regras puras, sem banco).
 * Contas novas: 0% de taxa percentual no Pix à vista e no boleto à vista por 3 meses de calendário.
 * Tarifa fixa e todas as outras modalidades (parcelado, recorrente, cartão, antecipação) ficam inalteradas.
 */

/** Só contas criadas a partir deste instante participam (contas antigas não recebem retroativamente). */
export const LAUNCH_PROMO_START = "2026-10-07T14:00:00Z";
export const LAUNCH_PROMO_MONTHS = 3;
export const LAUNCH_PROMO_REMINDER_DAYS = 7;

/** Soma meses de calendário (não 90 dias). Dia inexistente vira o último dia do mês (31/10 + 3 → 31/01; 30/11 + 3 → 28/02). */
export function addCalendarMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Fim da promoção da conta, ou null se a conta não participa (criada antes do lançamento ou data inválida). */
export function launchPromoEndsAt(accountCreatedAt: string | Date | null | undefined): Date | null {
  if (!accountCreatedAt) return null;
  const created = new Date(accountCreatedAt);
  if (Number.isNaN(created.getTime())) return null;
  if (created.getTime() < new Date(LAUNCH_PROMO_START).getTime()) return null;
  return addCalendarMonths(created, LAUNCH_PROMO_MONTHS);
}

/** A promoção vale enquanto agora < fim (no instante exato do fim ela já terminou). */
export function isLaunchPromoActive(accountCreatedAt: string | Date | null | undefined, now: Date): boolean {
  const end = launchPromoEndsAt(accountCreatedAt);
  return !!end && now.getTime() < end.getTime();
}

/** Somente Pix à vista e boleto à vista (uma única cobrança, sem parcelas nem recorrência). */
export function isLaunchPromoMethod(paymentMethod: string, singleCashCharge: boolean): boolean {
  return singleCashCharge && (paymentMethod === "pix" || paymentMethod === "boleto");
}

/** Dias inteiros que faltam até o fim (arredondado para cima). */
export function daysUntil(end: Date, now: Date) {
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

/** Lembrete: só quando faltam 7 dias ou menos e a promoção ainda vale. O envio único é garantido no servidor. */
export function shouldSendPromoReminder(accountCreatedAt: string | Date | null | undefined, now: Date): boolean {
  const end = launchPromoEndsAt(accountCreatedAt);
  if (!end || now.getTime() >= end.getTime()) return false;
  return daysUntil(end, now) <= LAUNCH_PROMO_REMINDER_DAYS;
}
