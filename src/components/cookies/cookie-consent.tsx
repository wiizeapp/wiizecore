import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
type CookieTexts = { aria: string; text: string; pol: string; and: string; priv: string; no: string; yes: string };
import {
  ALL_GRANTED, CONSENT_VERSION, DEFAULT_PREFS, type ConsentPrefs, ensureDataLayer,
  getAnonId, getConsent, hasConsentDecision, initConsentMode, onConsentChange, saveConsent,
} from "@/lib/consent";

type Tracking = { enabled: boolean; gtm_id: string | null; ga4_id: string | null; meta_pixel_id: string | null };

// Aviso só nas páginas públicas. Área interna e páginas de pagamento ficam de fora.
const INTERNAL = ["antecipacao","integracoes","lembrete-de-cobranca","regua-de-cobranca","ativacao","clientes","cobrancas","configuracoes","contratos","equipe","extrato","financas","financeiro","limites","nimda","notas-fiscais","painel","perfil","recebiveis","seguranca","servicos","pagar","c","oauth","assinar","autorizar","convite","embed"];
const HIDDEN = [new RegExp(`^/(${INTERNAL.join("|")})(/|$)`)];

const loaded = new Set<string>();
function script(tag: string, src: string) {
  if (loaded.has(tag)) return;
  loaded.add(tag);
  const s = document.createElement("script");
  s.async = true; s.src = src; s.dataset["tag"] = tag;
  document.head.appendChild(s);
}

function applyTags(cfg: Tracking, p: ConsentPrefs) {
  if (!cfg.enabled) return;
  ensureDataLayer();
  if (cfg.gtm_id && (p.analytics || p.marketing) && !loaded.has("gtm")) {
    window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
    script("gtm", `https://www.googletagmanager.com/gtm.js?id=${cfg.gtm_id}`);
  }
  if (cfg.ga4_id && p.analytics && !loaded.has("ga4")) {
    script("ga4", `https://www.googletagmanager.com/gtag/js?id=${cfg.ga4_id}`);
    window.gtag!("js", new Date());
    window.gtag!("config", cfg.ga4_id, { send_page_view: false });
    window.gtag!("event", "page_view", { page_path: location.pathname + location.search });
  }
  if (cfg.meta_pixel_id && p.marketing && !loaded.has("fbq")) {
    const n: any = (window.fbq = function (...a: unknown[]) { n.callMethod ? n.callMethod(...a) : n.queue.push(a); });
    window._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    script("fbq", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", cfg.meta_pixel_id);
    window.fbq("track", "PageView");
  }
}

export function CookieConsent() {
  useTranslation();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);
  const [custom, setCustom] = useState(false);
  const [prefs, setPrefs] = useState<ConsentPrefs>(DEFAULT_PREFS);
  const [cfg, setCfg] = useState<Tracking | null>(null);
  const last = useRef("");

  useEffect(() => {
    initConsentMode();
    if (!hasConsentDecision()) { setShow(true); requestAnimationFrame(() => setVisible(true)); }
    const open = () => { setPrefs(getConsent()); setCustom(true); setShow(true); requestAnimationFrame(() => setVisible(true)); };
    window.addEventListener("wiize:open-cookie-settings", open);
    void supabase.from("tracking_settings").select("enabled, gtm_id, ga4_id, meta_pixel_id").maybeSingle()
      .then(({ data }) => data && setCfg(data as Tracking));
    return () => { window.removeEventListener("wiize:open-cookie-settings", open); };
  }, []);

  // Logado: a decisão salva no servidor vale para sempre, em qualquer navegador.
  useEffect(() => {
    if (!user?.id) return;
    let off = false;
    void (async () => {
      const { data } = await supabase.from("cookie_consents")
        .select("functional, analytics, marketing").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (off) return;
      if (data) {
        if (!hasConsentDecision()) {
          saveConsent({ necessary: true, functional: data.functional, analytics: data.analytics, marketing: data.marketing });
          setVisible(false); setShow(false);
        }
      } else if (hasConsentDecision()) {
        const p = getConsent();
        await supabase.from("cookie_consents").insert({
          user_id: user.id, anon_id: getAnonId(), necessary: true,
          functional: p.functional, analytics: p.analytics, marketing: p.marketing,
          policy_version: CONSENT_VERSION, page_url: window.location.href.slice(0, 2048),
          user_agent: navigator.userAgent.slice(0, 512), language: (i18n.language || "pt-BR").slice(0, 10),
        });
      }
    })();
    return () => { off = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!cfg) return;
    if (hasConsentDecision()) applyTags(cfg, getConsent());
    return onConsentChange((p) => applyTags(cfg, p));
  }, [cfg]);

  useEffect(() => {
    const path = pathname + location.search;
    if (last.current === path) return;
    const first = !last.current; last.current = path;
    if (first || !hasConsentDecision() || !getConsent().analytics) return;
    window.gtag?.("event", "page_view", { page_path: path });
  }, [pathname]);

  const decide = async (p: ConsentPrefs) => {
    saveConsent(p);
    setVisible(false);
    setTimeout(() => { setShow(false); setCustom(false); }, 400);
    await supabase.from("cookie_consents").insert({
      user_id: user?.id ?? null, anon_id: getAnonId(), necessary: true,
      functional: p.functional, analytics: p.analytics, marketing: p.marketing,
      policy_version: CONSENT_VERSION, page_url: window.location.href.slice(0, 2048),
      user_agent: navigator.userAgent.slice(0, 512), language: (i18n.language || "pt-BR").slice(0, 10),
    });
  };

  if (!show || HIDDEN.some((r) => r.test(pathname)) || (typeof window !== "undefined" && new URLSearchParams(location.search).get("embed") === "1")) return null;

  const cats: { key: keyof ConsentPrefs; title: string; desc: string }[] = [
    { key: "necessary", title: "Necessários", desc: "Login, segurança e funcionamento do site. Sempre ativos." },
    { key: "functional", title: "Funcionais", desc: "Lembram preferências como idioma e tema." },
    { key: "analytics", title: "Análise", desc: "Ajudam a entender como o site é usado (Google Analytics)." },
    { key: "marketing", title: "Marketing", desc: "Medem campanhas e anúncios (Google Ads, Meta)." },
  ];

  const lang = (i18n.resolvedLanguage || i18n.language || "pt-BR").slice(0, 2);
  const C = ({
    en: { aria: "Cookie notice", text: "We use cookies to keep your session secure, analyze site usage and improve your experience. Learn more in the", pol: "Cookie Policy", and: "and the", priv: "Privacy Notice", no: "Decline", yes: "Accept cookies" },
    es: { aria: "Aviso de cookies", text: "Usamos cookies para mantener tu sesión segura, analizar el uso del sitio y mejorar tu experiencia. Más información en la", pol: "Política de Cookies", and: "y en el", priv: "Aviso de Privacidad", no: "No aceptar", yes: "Aceptar cookies" },
  } as Record<string, CookieTexts>)[lang] ?? { aria: "Aviso de cookies", text: "Usamos cookies para manter sua sessão segura, analisar o uso do site e melhorar sua experiência. Saiba mais na", pol: "Política de Cookies", and: "e no", priv: "Aviso de Privacidade", no: "Não aceitar", yes: "Aceitar cookies" };

  return (
    <div role="dialog" aria-label={C.aria} data-no-auto-translate
      className={`fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-card text-card-foreground shadow-2xl transition-all duration-200 ${visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}>
      <div className="mx-auto max-h-[75vh] w-full max-w-[1400px] overflow-y-auto px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Cookie className="size-5" /></span>
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {C.text}{" "}
              <Link to="/politica-de-cookies" className="font-semibold text-foreground underline underline-offset-2">{C.pol}</Link> {C.and}{" "}
              <Link to="/politica-de-privacidade" className="font-semibold text-foreground underline underline-offset-2">{C.priv}</Link>.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row lg:shrink-0">
            <button type="button" onClick={() => decide(DEFAULT_PREFS)} className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted sm:text-sm">{C.no}</button>
            <button type="button" onClick={() => decide(ALL_GRANTED)} className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:text-sm">{C.yes}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
