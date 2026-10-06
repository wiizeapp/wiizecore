import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import "@/i18n";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { CookieConsent } from "@/components/cookies/cookie-consent";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { useLanguageBootstrap } from "@/components/language-switcher";
import i18n, { DEFAULT_LANG } from "@/i18n";

const OAUTH_THEME_BOOTSTRAP = `(function(){try{var u=new URL(window.location.href),t=null,o=false;if(u.pathname==='/oauth/authorize'){t=u.searchParams.get('ui_theme');o=true}else if(u.pathname==='/auth'){var n=u.searchParams.get('next');if(n&&n.indexOf('/oauth/authorize?')===0){t=new URL(n,window.location.origin).searchParams.get('ui_theme');o=true}}else if(u.pathname==='/reset-password'){var r=u.searchParams.get('theme');if(r==='light'||r==='dark')t=r;else if(r==='system')t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var s=localStorage.getItem('wiize-theme');if(t!=='light'&&t!=='dark')t=s==='light'||s==='dark'?s:s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':o?'light':'dark';if(u.pathname.indexOf('/pagar/')===0)t='light';document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;if(o)document.documentElement.dataset.oauthUiTheme=t}catch(e){}})();`;

const translatedText = new WeakMap<Text, { source: string; applied: string }>();
const translatedAttributes = new WeakMap<Element, Map<string, { source: string; applied: string }>>();

let everTranslated = false;
function translateVisiblePage() {
  if (typeof document === "undefined" || window.location.pathname.startsWith("/nimda")) return;
  const language = i18n.resolvedLanguage ?? i18n.language;
  if (language === DEFAULT_LANG && !everTranslated) return;
  if (language !== DEFAULT_LANG) everTranslated = true;
  const translate = (value: string) => {
    if (language === DEFAULT_LANG || value === "Wiize" || value === "Pay") return value;
    // Busca direta no dicionário: textos com ":" ou "." quebravam a busca padrão.
    const dict = (i18n.store.data[language]?.["ui"] ?? {}) as Record<string, string>;
    const key = value.replace(/\s+/g, " ");
    const direct = dict[key] ?? dict[key.trim()];
    if (direct) return direct;
    // Textos com números variáveis ("32 dias", "R$50.00"): procura o modelo com "#".
    const numbers = key.match(/\d+(?:[.,]\d+)*/g);
    if (numbers) {
      const template = dict[key.replace(/\d+(?:[.,]\d+)*/g, "#")];
      if (template) { let i = 0; return template.replace(/#/g, () => numbers[i++] ?? "#"); }
    }
    return value;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest("script,style,textarea,[contenteditable='true'],[data-i18n-native]")) {
      const current = textNode.data;
      const previous = translatedText.get(textNode);
      const state = !previous || current !== previous.applied ? { source: current, applied: current } : previous;
      translatedText.set(textNode, state);
      const source = state.source;
      const trimmed = source.trim();
      if (trimmed) {
        const next = source.replace(trimmed, translate(trimmed));
        state.applied = next;
        if (next !== current) textNode.data = next;
      }
    }
    node = walker.nextNode();
  }
  for (const element of document.body.querySelectorAll("[placeholder],[title],[aria-label],[alt]")) {
    if (element.closest("[data-i18n-native]")) continue;
    let values = translatedAttributes.get(element);
    if (!values) { values = new Map(); translatedAttributes.set(element, values); }
    for (const attribute of ["placeholder", "title", "aria-label", "alt"]) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      const previous = values.get(attribute);
      const state = !previous || current !== previous.applied ? { source: current, applied: current } : previous;
      values.set(attribute, state);
      const next = translate(state.source);
      state.applied = next;
      if (next !== current) element.setAttribute(attribute, next);
    }
  }
}

function VisiblePageTranslator() {
  useEffect(() => {
    let scheduled = false;
    const apply = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => { scheduled = false; translateVisiblePage(); }, 120);
    };
    const handleLanguageChanged = () => apply();
    apply();
    i18n.on("languageChanged", handleLanguageChanged);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "alt"] });
    return () => { observer.disconnect(); i18n.off("languageChanged", handleLanguageChanged); };
  }, []);
  return null;
}

function NotFoundComponent() {
  const { t: ui } = useTranslation("ui");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{ui("Página não encontrada")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            
            {ui("Voltar ao início")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  const { t: ui } = useTranslation("ui");
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{ui("Esta página não carregou")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            
            {ui("Tentar novamente")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            
            {ui("Voltar ao início")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WiizePay" },
      { name: "description", content: "Pagamentos e gestão financeira para prestadores de serviços." },
      { property: "og:title", content: "WiizePay" },
      { property: "og:description", content: "Pagamentos e gestão financeira para prestadores de serviços." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&family=Dancing+Script:wght@600&family=Great+Vibes&family=Allura&family=Satisfy&family=Homemade+Apple&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: OAUTH_THEME_BOOTSTRAP }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const routerLoading = useRouterState({ select: (state) => state.isLoading });
  // Só mostra a barra se a navegação demorar de verdade (evita piscar a cada clique).
  const [isNavigating, setIsNavigating] = useState(false);
  useEffect(() => {
    if (!routerLoading) { setIsNavigating(false); return; }
    const t = setTimeout(() => setIsNavigating(true), 700);
    return () => clearTimeout(t);
  }, [routerLoading]);
  const { t: ui } = useTranslation("ui");
  useLanguageBootstrap();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VisiblePageTranslator />
        <div
          className={`navigation-progress ${isNavigating ? "is-visible" : ""}`}
          role="progressbar"
          aria-label={ui("Carregando página")}
          aria-hidden={!isNavigating}
        />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-right" closeButton expand duration={5000} />
        <CookieConsent />
        <ConfirmDialogHost />
      </AuthProvider>
    </QueryClientProvider>
  );
}
