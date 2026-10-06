import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ptNav from "@/locales/pt-BR/navigation.json";
import enNav from "@/locales/en/navigation.json";
import esNav from "@/locales/es/navigation.json";
import ptFooter from "@/locales/pt-BR/footer.json";
import enFooter from "@/locales/en/footer.json";
import esFooter from "@/locales/es/footer.json";
import ptGloss from "@/locales/pt-BR/glossary.json";
import enGloss from "@/locales/en/glossary.json";
import esGloss from "@/locales/es/glossary.json";
import ptFees from "@/locales/pt-BR/fees.json";
import enFees from "@/locales/en/fees.json";
import esFees from "@/locales/es/fees.json";
import ptUi from "@/locales/pt-BR/ui.json";
import enUi from "@/locales/en/ui.json";
import esUi from "@/locales/es/ui.json";
import flagPtUrl from "@/assets/flag-pt.webp";
const flagPt = { url: flagPtUrl };
import flagEnUrl from "@/assets/flag-en.png";
const flagEn = { url: flagEnUrl };
import flagEsUrl from "@/assets/flag-es.webp";
const flagEs = { url: flagEsUrl };

/** Idiomas suportados. Para adicionar um novo: criar src/locales/<código>/ e registrar aqui. */
export const LANGUAGES = [
  { code: "pt-BR", short: "PT", flag: "🇧🇷", flagSrc: flagPt.url, label: "Português (Brasil)" },
  { code: "en", short: "EN", flag: "🇺🇸", flagSrc: flagEn.url, label: "English" },
  { code: "es", short: "ES", flag: "🇪🇸", flagSrc: flagEs.url, label: "Español" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LANG: Lang = "pt-BR";
export const LANG_STORAGE_KEY = "wiize_lang";

export const resources = {
  "pt-BR": { navigation: ptNav, footer: ptFooter, glossary: ptGloss, fees: ptFees, ui: ptUi },
  en: { navigation: enNav, footer: enFooter, glossary: enGloss, fees: enFees, ui: enUi },
  es: { navigation: esNav, footer: esFooter, glossary: esGloss, fees: esFees, ui: esUi },
} as const;

export function normalizeLang(value: string | null | undefined): Lang | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.startsWith("pt")) return "pt-BR";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("es")) return "es";
  return null;
}

/** Locale de formatação (números/datas) do idioma ativo. A moeda NÃO muda com o idioma. */
export function currentLocale(): string {
  return (i18n.language as Lang) || DEFAULT_LANG;
}

if (!i18n.isInitialized) {
  // Sempre inicia em pt-BR (igual ao SSR); o idioma salvo é aplicado após a hidratação.
  void i18n.use(initReactI18next).init({
    resources, lng: DEFAULT_LANG, fallbackLng: DEFAULT_LANG, defaultNS: "navigation",
    interpolation: { escapeValue: false }, returnObjects: true, react: { useSuspense: false },
  });
} else {
  // Recarregamento do módulo: aplica as traduções novas sem exigir recarregar a página.
  for (const [lng, namespaces] of Object.entries(resources)) {
    for (const [ns, bundle] of Object.entries(namespaces)) i18n.addResourceBundle(lng, ns, bundle, true, true);
  }
  void i18n.changeLanguage(i18n.language);
}

export async function setLanguage(lang: Lang) {
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* sem armazenamento */ }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  await i18n.changeLanguage(lang);
}

/** Idioma salvo → idioma do navegador → pt-BR. */
export function detectLanguage(): Lang {
  try {
    const saved = normalizeLang(localStorage.getItem(LANG_STORAGE_KEY));
    if (saved) return saved;
  } catch { /* ignore */ }
  return normalizeLang(typeof navigator !== "undefined" ? navigator.language : null) ?? DEFAULT_LANG;
}

export default i18n;
