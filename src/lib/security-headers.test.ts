import { describe, expect, it } from "vitest";
import { applySecurityHeaders, buildCsp, cacheControlFor } from "./security-headers";

const SUPA = "https://abc.supabase.co";

describe("security headers", () => {
  it("permite Turnstile em produção somente na origem oficial para script, conexão e janela", () => {
    const csp = buildCsp({ preview: false, dev: false });
    for (const directive of ["script-src", "connect-src", "frame-src"]) {
      const values = csp.split(";").find((part) => part.trim().startsWith(`${directive} `));
      expect(values).toContain("https://challenges.cloudflare.com");
      expect(values).not.toContain("https://*.cloudflare.com");
    }
  });
  it("produção: CSP restrita, sem curingas e sem eval", () => {
    const csp = buildCsp({ supabaseUrl: SUPA, preview: false, dev: false });
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("lovable.dev https");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("wss://abc.supabase.co");
    expect(csp.split(";").find((part) => part.trim().startsWith("img-src"))).toContain("https://baas.asaas.com");
  });
  it("dados privados nunca ficam em cache", () => {
    for (const p of ["/painel", "/pagar/x", "/portal/k", "/api/public/v1/charges", "/_serverFn/abc", "/nimda", "/auth"]) {
      expect(cacheControlFor(p)).toContain("no-store");
    }
    expect(cacheControlFor("/taxas")).toContain("public");
  });
  it("produção recebe X-Frame-Options e COOP same-origin", () => {
    const h = new Headers({ "X-Powered-By": "x" });
    applySecurityHeaders(h, { pathname: "/painel", host: "www.wiizepay.com", supabaseUrl: SUPA, dev: false });
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(h.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(h.get("X-Powered-By")).toBeNull();
    expect(h.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
