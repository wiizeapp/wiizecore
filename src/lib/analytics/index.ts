/**
 * Analytics WiizeCore — ponto ÚNICO de envio no navegador.
 * Regras: GTM configurado → só dataLayer (GA4 direto desligado); sem GTM → GA4 direto via gtag.
 * Nada é enviado sem consentimento de análise; endereços são normalizados e parâmetros filtrados.
 * Compras/receita NUNCA saem do navegador (ver docs/analytics.md).
 */
import { ensureDataLayer, getConsent, hasConsentDecision, type ConsentPrefs } from "@/lib/consent";
import { mergeAttribution, touchFromUrl, type Attribution } from "./attribution";
import { EVENT_NAME, sanitizeParams, type EventParams } from "./params";
import { clicksAllowed, deviceCategory, normalizePath, pageGroup } from "./paths";

export type TrackingConfig = { enabled: boolean; gtm_id: string | null; ga4_id: string | null; meta_pixel_id: string | null };
export type Provider = "gtm" | "ga4" | null;

/** Qual provedor recebe os eventos do Google (nunca os dois). */
export function activeProvider(cfg: TrackingConfig | null): Provider {
  if (!cfg?.enabled) return null;
  if (cfg.gtm_id) return "gtm";
  if (cfg.ga4_id) return "ga4";
  return null;
}

/** Interações aceitas via data-analytics-event; qualquer outro valor é ignorado. */
export const CLICK_EVENTS = ["cta_clicked", "navigation_clicked", "pricing_plan_selected", "modal_opened", "tab_selected", "filter_applied", "feature_used", "contact_clicked"] as const;

const ATTR_KEY = "wz_attribution";
const KEEP_QUERY = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "gclid", "gbraid", "wbraid"];

/** page_location seguro: origem + rota normalizada + só parâmetros de campanha. */
export function safeLocation(href: string, marketing: boolean): string {
  const u = new URL(href);
  const out = new URL(u.origin + normalizePath(u.pathname));
  for (const k of [...KEEP_QUERY, ...(marketing ? ["fbclid"] : [])]) {
    const v = u.searchParams.get(k);
    if (v) out.searchParams.set(k, v.slice(0, 200));
  }
  return out.toString();
}

type State = { cfg: TrackingConfig | null; prefs: ConsentPrefs; loaded: Set<string>; lastPage: string; prevPage: string | null; auth: "signed_in" | "signed_out"; pending: boolean; clicks: boolean; touched: boolean };
const s: State = { cfg: null, prefs: { necessary: true, functional: false, analytics: false, marketing: false }, loaded: new Set(), lastPage: "", prevPage: null, auth: "signed_out", pending: false, clicks: false, touched: false };

const canMeasure = () => typeof window !== "undefined" && s.prefs.analytics && activeProvider(s.cfg) !== null;

function loadScript(tag: string, src: string) {
  if (s.loaded.has(tag) || document.querySelector(`script[data-tag="${tag}"]`)) { s.loaded.add(tag); return; }
  s.loaded.add(tag);
  const el = document.createElement("script");
  el.async = true; el.src = src; el.dataset["tag"] = tag;
  el.onerror = () => { /* bloqueador ou rede: o site segue normalmente */ };
  document.head.appendChild(el);
}

function loadProviders() {
  const cfg = s.cfg, p = s.prefs;
  if (!cfg?.enabled) return;
  ensureDataLayer();
  const provider = activeProvider(cfg);
  if (provider === "gtm" && (p.analytics || p.marketing) && !s.loaded.has("gtm")) {
    window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
    loadScript("gtm", `https://www.googletagmanager.com/gtm.js?id=${cfg.gtm_id}`);
  }
  if (provider === "ga4" && p.analytics && !s.loaded.has("ga4")) {
    loadScript("ga4", `https://www.googletagmanager.com/gtag/js?id=${cfg.ga4_id}`);
    window.gtag!("js", new Date());
    window.gtag!("config", cfg.ga4_id, { send_page_view: false, page_location: safeLocation(location.href, p.marketing), page_referrer: "" });
  }
  if (cfg.meta_pixel_id && p.marketing && !s.loaded.has("fbq")) {
    const n: any = (window.fbq = function (...a: unknown[]) { n.callMethod ? n.callMethod(...a) : n.queue.push(a); });
    window._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    loadScript("fbq", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", cfg.meta_pixel_id);
  }
}

function send(name: string, params: EventParams) {
  if (!canMeasure() || !EVENT_NAME.test(name)) return;
  const clean = sanitizeParams(params);
  try {
    if (activeProvider(s.cfg) === "gtm") window.dataLayer!.push({ event: name, ...clean });
    else window.gtag?.("event", name, clean);
  } catch { /* falha de terceiro nunca quebra a aplicação */ }
}

function captureAttribution() {
  if (s.touched || !s.prefs.analytics) return;
  s.touched = true;
  try {
    const prev = JSON.parse(localStorage.getItem(ATTR_KEY) || "null") as Attribution | null;
    localStorage.setItem(ATTR_KEY, JSON.stringify(mergeAttribution(prev, touchFromUrl(location.href, document.referrer, Date.now()))));
  } catch { /* armazenamento indisponível */ }
}

export function getAttribution(): Attribution | null {
  if (!s.prefs.analytics) return null;
  try { return JSON.parse(localStorage.getItem(ATTR_KEY) || "null"); } catch { return null; }
}

function emitPageView() {
  const template = normalizePath(location.pathname);
  s.pending = false;
  const params = {
    page_location: safeLocation(location.href, s.prefs.marketing), page_path: template, page_template: template,
    page_group: pageGroup(template), previous_page_path: s.prevPage, language: (document.documentElement.lang || "pt-BR").slice(0, 10),
    device_category: deviceCategory(window.innerWidth), auth_state: s.auth, page_referrer: "",
  };
  if (activeProvider(s.cfg) === "ga4") window.gtag?.("set", { page_location: params.page_location, page_referrer: "" });
  send("page_view", params);
  try { if (s.prefs.marketing && s.cfg?.meta_pixel_id) window.fbq?.("track", "PageView"); } catch {}
}

/** Uma page view por rota real (mudança de template). Antes do consentimento, fica pendente. */
export function trackPage(pathname: string) {
  const template = normalizePath(pathname);
  if (template === s.lastPage) return;
  s.prevPage = s.lastPage || null;
  s.lastPage = template;
  if (!canMeasure()) { s.pending = true; return; }
  captureAttribution();
  emitPageView();
}

/** Evento de negócio/interação. Use nomes estáveis (snake_case). */
export function track(name: string, params: EventParams = {}) {
  send(name, { page_path: s.lastPage || undefined, page_group: s.lastPage ? pageGroup(s.lastPage) : undefined, auth_state: s.auth, ...params });
}

export function setAuthState(signedIn: boolean) { s.auth = signedIn ? "signed_in" : "signed_out"; }

function onClick(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest?.("[data-analytics-event]") as HTMLElement | null;
  if (!el || el.closest("[data-analytics-ignore]") || !clicksAllowed(location.pathname)) return;
  const name = el.dataset["analyticsEvent"] ?? "";
  if (!(CLICK_EVENTS as readonly string[]).includes(name)) return;
  const href = el.getAttribute("href");
  let destination: string | undefined;
  if (href) {
    try { const u = new URL(href, location.href); destination = u.origin === location.origin ? normalizePath(u.pathname) : u.hostname; } catch {}
  }
  track(name, { element_name: el.dataset["analyticsName"], placement: el.dataset["analyticsLocation"], element_type: el.tagName.toLowerCase(), destination, interaction_type: "click" });
}

/** Chamado pelo aviso de cookies com a configuração do Admin e a escolha atual. */
export function configureAnalytics(cfg: TrackingConfig | null, prefs: ConsentPrefs) {
  s.cfg = cfg; s.prefs = prefs;
  if (!prefs.analytics) { s.touched = false; try { localStorage.removeItem(ATTR_KEY); } catch {} }
  loadProviders();
  if (!s.clicks && typeof document !== "undefined") { s.clicks = true; document.addEventListener("click", onClick, { capture: true, passive: true }); }
  if (s.pending && canMeasure()) { captureAttribution(); emitPageView(); }
}

export function currentPrefs(): ConsentPrefs { return hasConsentDecision() ? getConsent() : s.prefs; }

/** Somente para testes. */
export function __resetAnalytics() {
  s.cfg = null; s.loaded.clear(); s.lastPage = ""; s.prevPage = null; s.pending = false; s.touched = false;
  s.prefs = { necessary: true, functional: false, analytics: false, marketing: false };
}
