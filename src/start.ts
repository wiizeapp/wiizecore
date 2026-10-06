import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachBearer } from "@/lib/auth-bearer";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Cabeçalhos de segurança em todas as respostas.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (response instanceof Response) {
    try {
      const h = response.headers;
      h.set("X-Content-Type-Options", "nosniff");
      h.set("Referrer-Policy", "strict-origin-when-cross-origin");
      h.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
      h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      h.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
      // Impede que outros sites exibam o WiizePay escondido dentro de uma moldura (clickjacking).
      h.set(
        "Content-Security-Policy",
        "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev; base-uri 'self'; object-src 'none'",
      );
      if (new URL(response.url || "http://x/").pathname.startsWith("/api/") || h.get("content-type")?.includes("json")) {
        h.set("Cache-Control", "no-store");
      }
    } catch {
      // cabeçalhos imutáveis: ignora
    }
  }
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachBearer],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware],
}));
