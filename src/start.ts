import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachBearer } from "@/lib/auth-bearer";
import { applySecurityHeaders } from "@/lib/security-headers";

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

// Cabeçalhos de segurança em todas as respostas (regras em src/lib/security-headers.ts).
const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (response instanceof Response) {
    try {
      const url = new URL(request.url);
      applySecurityHeaders(response.headers, {
        pathname: url.pathname,
        host: request.headers.get("host") ?? url.host,
        supabaseUrl: process.env["SUPABASE_URL"],
        dev: process.env["NODE_ENV"] !== "production",
      });
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
