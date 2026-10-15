/**
 * Cabeçalhos de segurança aplicados a todas as respostas dinâmicas (páginas,
 * funções do servidor e APIs). Funções puras para poderem ser testadas.
 */

/** Páginas de divulgação sem dados pessoais: podem ser revalidadas pelo navegador/CDN. */
const PUBLIC_MARKETING = new Set([
  "/", "/taxas", "/prazos", "/suporte", "/checkout-com-sua-marca", "/cobrancas-e-pagamentos",
  "/contratos-digitais", "/gestao-de-clientes", "/gestao-financeira", "/integracao-crm-wiize",
  "/lembretes-de-cobranca", "/pix-automatico", "/portal-do-cliente", "/seguranca-e-confianca",
  "/politica-de-cancelamento-e-reembolso", "/politica-de-cookies", "/politica-de-pagamentos",
  "/politica-de-privacidade", "/termos-de-uso",
]);

/** Ambientes de edição/preview que precisam ser exibidos dentro do editor. */
export function isPreviewHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? "";
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h.endsWith(".lovable.dev");
}

export function cacheControlFor(pathname: string): string {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (PUBLIC_MARKETING.has(p) || p === "/.well-known/security.txt") return "public, max-age=0, must-revalidate";
  // Painel, checkout, portal, contratos, login, APIs e funções do servidor: nunca guardar.
  return "no-store, max-age=0";
}

export function buildCsp(opts: { supabaseUrl?: string | undefined; preview: boolean; dev: boolean }): string {
  const supa = opts.supabaseUrl ? new URL(opts.supabaseUrl) : null;
  const supaHttp = supa ? supa.origin : "";
  const supaWs = supa ? `wss://${supa.host}` : "";
  const ga = "https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com";
  const fb = "https://connect.facebook.net https://www.facebook.com";
  const frameAncestors = opts.preview
    ? "'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com"
    : "'self'";
  const d: Record<string, string> = {
    "default-src": "'self'",
    // 'unsafe-inline': scripts de hidratação do SSR e o script de tema inicial (ver docs/seguranca-headers.md).
    "script-src": `'self' 'unsafe-inline' https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net`,
    "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src": "'self' data: https://fonts.gstatic.com",
    "img-src": `'self' data: blob: ${supaHttp} https://baas.asaas.com https://*.googleusercontent.com ${ga} https://www.facebook.com`,
    "connect-src": `'self' ${supaHttp} ${supaWs} https://viacep.com.br https://oauth.lovable.app ${ga} ${fb}${opts.dev ? " ws: http://localhost:*" : ""}`,
    "frame-src": "'self' blob: https://oauth.lovable.app https://www.googletagmanager.com",
    "worker-src": "'self' blob:",
    "media-src": "'self' blob:",
    "manifest-src": "'self'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": `'self' ${supaHttp} https://accounts.google.com https://oauth.lovable.app`,
    "frame-ancestors": frameAncestors,
  };
  const parts = Object.entries(d).map(([k, v]) => `${k} ${v.replace(/\s+/g, " ").trim()}`);
  if (!opts.preview) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** O que cada página pode usar do aparelho. Câmera: foto de documento/selfie na ativação. */
export const PERMISSIONS_POLICY = [
  "camera=(self)", "microphone=()", "geolocation=()", "payment=()", "usb=()", "bluetooth=()",
  "serial=()", "hid=()", "midi=()", "accelerometer=()", "gyroscope=()", "magnetometer=()",
  "ambient-light-sensor=()", "display-capture=()", "screen-wake-lock=()", "xr-spatial-tracking=()",
  "browsing-topics=()", "fullscreen=(self)", "clipboard-write=(self)", "publickey-credentials-get=(self)",
].join(", ");

/** Janelas da Wiize Recebe mostradas dentro do Wiize CRM. */
export const isEmbedPath = (pathname: string) => pathname === "/embed" || pathname.startsWith("/embed/");

export function applySecurityHeaders(h: Headers, ctx: { pathname: string; host: string; supabaseUrl?: string | undefined; dev: boolean; embedOrigins?: readonly string[] }) {
  const preview = isPreviewHost(ctx.host);
  const embed = isEmbedPath(ctx.pathname) && (ctx.embedOrigins?.length ?? 0) > 0;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", embed ? "no-referrer" : "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", PERMISSIONS_POLICY);
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  h.set("X-Permitted-Cross-Domain-Policies", "none");
  h.set("X-DNS-Prefetch-Control", "off");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  // Preview usa janela de login do editor; produção usa redirecionamento e pode isolar totalmente.
  h.set("Cross-Origin-Opener-Policy", preview ? "same-origin-allow-popups" : "same-origin");
  let csp = buildCsp({ supabaseUrl: ctx.supabaseUrl, preview, dev: ctx.dev });
  if (embed) {
    // Só o Wiize oficial (e o editor, no preview) pode exibir estas telas.
    const fa = `'self' ${ctx.embedOrigins!.join(" ")}${preview ? " https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com" : ""}`;
    csp = csp.replace(/frame-ancestors [^;]+/, `frame-ancestors ${fa}`);
  }
  if (preview) {
    // No editor só a proteção de moldura é obrigatória; o resto é monitorado para não quebrar ferramentas do editor.
    h.set("Content-Security-Policy", `frame-ancestors ${csp.match(/frame-ancestors ([^;]+)/)?.[1] ?? "'self'"}; base-uri 'self'; object-src 'none'`);
    h.set("Content-Security-Policy-Report-Only", csp);
  } else {
    h.set("Content-Security-Policy", csp);
    if (embed) h.delete("X-Frame-Options");
    else h.set("X-Frame-Options", "SAMEORIGIN");
  }
  h.set("Cache-Control", cacheControlFor(ctx.pathname));
  if (!cacheControlFor(ctx.pathname).startsWith("public")) h.set("Pragma", "no-cache");
  h.delete("X-Powered-By");
  h.delete("Server");
}
