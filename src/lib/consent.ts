// Consentimento de cookies (LGPD) — fonte única de verdade no frontend.
// As categorias "necessary" cobrem funcionamento do site, segurança,
// autenticação, rastreamento interno de uso e atribuição do programa de
// parceiros (comissões) — por isso são obrigatórias e não podem ser desligadas.

export type ConsentPrefs = {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

export const CONSENT_KEY = "cookie-consent";
export const CONSENT_PREFS_KEY = "cookie-preferences";
export const CONSENT_ANON_KEY = "cookie-anon-id";
export const CONSENT_EVENT = "wiize:consent-change";
export const CONSENT_VERSION = "v3";
export const CONSENT_VERSION_KEY = "cookie-consent-version";

export const DEFAULT_PREFS: ConsentPrefs = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export const ALL_GRANTED: ConsentPrefs = {
  necessary: true,
  functional: true,
  analytics: true,
  marketing: true,
};

export function hasConsentDecision(): boolean {
  try {
    if (!localStorage.getItem(CONSENT_KEY)) {
      // Recupera a decisão guardada em cookie (caso o armazenamento local tenha sido limpo).
      const m = document.cookie.match(/(?:^|; )wz_consent=([^;]+)/);
      if (!m || m[1] !== CONSENT_VERSION) return false;
      localStorage.setItem(CONSENT_KEY, "true");
      localStorage.setItem(CONSENT_VERSION_KEY, CONSENT_VERSION);
      return true;
    }
    // Decisões feitas em versões anteriores do aviso precisam ser refeitas.
    return localStorage.getItem(CONSENT_VERSION_KEY) === CONSENT_VERSION;
  } catch {
    return false;
  }
}

/** Reabre o aviso de cookies (limpa a decisão salva neste navegador). */
export function resetConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_VERSION_KEY);
    localStorage.removeItem(CONSENT_PREFS_KEY);
  } catch {}
}

export function getConsent(): ConsentPrefs {
  try {
    const raw = localStorage.getItem(CONSENT_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ConsentPrefs>;
    return { ...DEFAULT_PREFS, ...parsed, necessary: true };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function getAnonId(): string {
  try {
    let id = localStorage.getItem(CONSENT_ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CONSENT_ANON_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

export function saveConsent(prefs: ConsentPrefs) {
  const value: ConsentPrefs = { ...prefs, necessary: true };
  try {
    localStorage.setItem(CONSENT_PREFS_KEY, JSON.stringify(value));
    localStorage.setItem(CONSENT_KEY, "true");
    localStorage.setItem(CONSENT_VERSION_KEY, CONSENT_VERSION);
  } catch {}
  try { document.cookie = `wz_consent=${CONSENT_VERSION}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`; } catch {}
  applyConsentToTags(value);
  window.dispatchEvent(new CustomEvent<ConsentPrefs>(CONSENT_EVENT, { detail: value }));
}

export function onConsentChange(cb: (prefs: ConsentPrefs) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<ConsentPrefs>).detail ?? getConsent());
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

/* ------------------------------------------------------------------ */
/* Google Consent Mode v2 + Meta Pixel — prontos para receber as tags   */
/* configuradas no admin (GTM, GA4, Google Ads, Pixel).                 */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    fbq?: any;
    _fbq?: any;
  }
}

export function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    } as any;
  }
}

/** Consent Mode padrão: tudo negado até o visitante decidir. */
export function initConsentMode() {
  ensureDataLayer();
  const prefs = hasConsentDecision() ? getConsent() : DEFAULT_PREFS;
  window.gtag!("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    personalization_storage: "denied",
    wait_for_update: 500,
  });
  if (hasConsentDecision()) applyConsentToTags(prefs);
}

export function applyConsentToTags(prefs: ConsentPrefs) {
  ensureDataLayer();
  const granted = (v: boolean) => (v ? "granted" : "denied");

  window.gtag?.("consent", "update", {
    ad_storage: granted(prefs.marketing),
    ad_user_data: granted(prefs.marketing),
    ad_personalization: granted(prefs.marketing),
    analytics_storage: granted(prefs.analytics),
    functionality_storage: granted(prefs.functional || true),
    personalization_storage: granted(prefs.functional),
    security_storage: "granted",
  });

  window.dataLayer!.push({
    event: "wiize_consent_update",
    consent_functional: prefs.functional,
    consent_analytics: prefs.analytics,
    consent_marketing: prefs.marketing,
  });

  try {
    window.fbq?.("consent", prefs.marketing ? "grant" : "revoke");
  } catch {}
}
