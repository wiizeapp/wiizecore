import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./security-headers";

const origins = ["https://wiize.com.br"];
function run(pathname: string) {
  const h = new Headers();
  applySecurityHeaders(h, { pathname, host: "wiizepay.com", dev: false, embedOrigins: origins });
  return h;
}

describe("janelas do Wiize", () => {
  it("permite só o Wiize em /embed", () => {
    const h = run("/embed/cobranca");
    expect(h.get("Content-Security-Policy")).toContain("frame-ancestors 'self' https://wiize.com.br;");
    expect(h.get("X-Frame-Options")).toBeNull();
    expect(h.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("continua bloqueando o resto do site", () => {
    const h = run("/painel");
    expect(h.get("Content-Security-Policy")).toContain("frame-ancestors 'self';");
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
