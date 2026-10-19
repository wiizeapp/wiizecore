/**
 * Atribuição de origem (regras puras). Janela de 90 dias.
 * - Primeiro toque: gravado uma vez por janela; só é refeito quando expira.
 * - Último toque: atualizado por qualquer visita com origem identificada; acesso direto NÃO sobrescreve.
 * - Guardamos apenas o TIPO do identificador de clique (gclid/gbraid/wbraid/fbclid), nunca o valor.
 */
import { normalizePath, referrerHost } from "./paths";

export const ATTRIBUTION_WINDOW_DAYS = 90;
const DAY = 86_400_000;

export type Touch = {
  source: string; medium: string; campaign: string | null; content: string | null; term: string | null;
  click_id_type: "gclid" | "gbraid" | "wbraid" | "fbclid" | null; landing_page: string; at: number;
};
export type Attribution = { first: Touch; last: Touch };

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu)\./;
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|t\.co|twitter|x\.com|youtube|tiktok|whatsapp|pinterest)/;
const cut = (v: string | null, n = 100) => (v ? v.trim().toLowerCase().slice(0, n) || null : null);

export function touchFromUrl(href: string, referrer: string, now: number): Touch {
  const u = new URL(href);
  const q = u.searchParams;
  const click = (["gclid", "gbraid", "wbraid", "fbclid"] as const).find((k) => q.get(k)) ?? null;
  const ref = referrerHost(referrer, u.hostname);
  let source = cut(q.get("utm_source"));
  let medium = cut(q.get("utm_medium"));
  if (!source && (click === "gclid" || click === "gbraid" || click === "wbraid")) { source = "google"; medium = "cpc"; }
  if (!source && click === "fbclid") { source = "facebook"; medium = medium ?? "paid_social"; }
  if (!source && ref) { source = ref; medium = SEARCH.test(ref) ? "organic" : SOCIAL.test(ref) ? "social" : "referral"; }
  return {
    source: source ?? "(direct)", medium: medium ?? (source ? "(not set)" : "(none)"),
    campaign: cut(q.get("utm_campaign")), content: cut(q.get("utm_content")), term: cut(q.get("utm_term")),
    click_id_type: click, landing_page: normalizePath(u.pathname), at: now,
  };
}

export const isDirect = (t: Touch) => t.source === "(direct)";

export function mergeAttribution(prev: Attribution | null, touch: Touch): Attribution {
  const expired = !prev || touch.at - prev.first.at > ATTRIBUTION_WINDOW_DAYS * DAY;
  if (expired) return { first: touch, last: touch };
  if (isDirect(touch)) return prev;
  return { first: prev.first, last: touch };
}
