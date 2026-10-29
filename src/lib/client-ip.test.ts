import { describe, expect, it } from "vitest";
import { parseTrustedHeaders, resolveClientIp, isValidIpv6 } from "./client-ip";

const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;

describe("resolveClientIp", () => {
  it("ignora o primeiro valor de X-Forwarded-For escrito pelo cliente", () => {
    const r = resolveClientIp(h({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.9" }));
    expect(r.ip).toBe("203.0.113.9");
  });
  it("sem cabeçalho confiável, não inventa IP", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "1.2.3.4" }))).toEqual({ ip: null, source: null, reason: "missing" });
  });
  it("rejeita IP inválido", () => {
    expect(resolveClientIp(h({ "cf-connecting-ip": "999.1.1.1" })).reason).toBe("invalid");
    expect(resolveClientIp(h({ "cf-connecting-ip": "abc" })).reason).toBe("invalid");
  });
  it("rejeita lista com vários IPs", () => {
    expect(resolveClientIp(h({ "x-real-ip": "1.1.1.1, 2.2.2.2" })).reason).toBe("ambiguous");
  });
  it("aceita IPv6 e normaliza", () => {
    expect(resolveClientIp(h({ "cf-connecting-ip": "2001:DB8::1" })).ip).toBe("2001:db8::1");
    expect(isValidIpv6("::ffff:192.0.2.1")).toBe(true);
    expect(isValidIpv6("1:2:3:4:5:6:7:8:9")).toBe(false);
    expect(isValidIpv6("1::2::3")).toBe(false);
  });
  it("respeita a ordem configurada e nunca aceita X-Forwarded-For na configuração", () => {
    expect(parseTrustedHeaders("x-forwarded-for")).toEqual(["cf-connecting-ip", "x-real-ip"]);
    const order = parseTrustedHeaders("x-real-ip");
    expect(resolveClientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" }), order).ip).toBe("2.2.2.2");
  });
});
