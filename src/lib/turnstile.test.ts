import { describe, it, expect } from "vitest";
import { verifyTurnstileToken, allowedHostnames, TURNSTILE_ACTION_CARD } from "./turnstile";

const ok = (p: unknown) => async () => ({ ok: true, json: async () => p });
const base = { secret: "s", remoteIp: "1.2.3.4", hostnames: ["wiizepay.com"], expectedAction: TURNSTILE_ACTION_CARD };
const good = { success: true, hostname: "wiizepay.com", action: TURNSTILE_ACTION_CARD };

describe("Turnstile siteverify", () => {
  it("aceita token válido", async () => expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: ok(good) })).toEqual({ ok: true }));
  it("recusa token ausente (chamada direta sem tela)", async () => {
    let called = false;
    const r = await verifyTurnstileToken({ ...base, token: undefined, fetchImpl: async () => { called = true; return { ok: true, json: async () => good }; } });
    expect(r).toMatchObject({ ok: false, reason: "missing_token" }); expect(called).toBe(false);
  });
  it("recusa token inválido", async () => expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: ok({ success: false, "error-codes": ["invalid-input-response"] }) })).toMatchObject({ ok: false, reason: "invalid_token" }));
  it("recusa token expirado ou reutilizado", async () => expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: ok({ success: false, "error-codes": ["timeout-or-duplicate"] }) })).toMatchObject({ ok: false, reason: "expired_or_reused" }));
  it("recusa hostname incompatível", async () => expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: ok({ ...good, hostname: "evil.com" }) })).toMatchObject({ ok: false, reason: "hostname_mismatch" }));
  it("recusa ação diferente", async () => expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: ok({ ...good, action: "login" }) })).toMatchObject({ ok: false, reason: "action_mismatch" }));
  it("falha fechada em indisponibilidade", async () => expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: async () => { throw new Error("down"); } })).toMatchObject({ ok: false, reason: "unavailable", retryable: true }));
  it("falha fechada em timeout", async () => {
    const r = await verifyTurnstileToken({ ...base, token: "t", timeoutMs: 20, fetchImpl: (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("abort")))) });
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
  });
  it("falha fechada com resposta HTTP de erro ou inconclusiva", async () => {
    expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: async () => ({ ok: false, json: async () => ({}) }) })).toMatchObject({ ok: false });
    expect(await verifyTurnstileToken({ ...base, token: "t", fetchImpl: ok({}) })).toMatchObject({ ok: false });
  });
  it("recusa sem chave secreta", async () => expect(await verifyTurnstileToken({ ...base, secret: undefined, token: "t" })).toMatchObject({ ok: false, reason: "not_configured" }));
  it("hostnames padrão são do domínio wiizepay.com", () => expect(allowedHostnames(undefined)).toEqual(["wiizepay.com", "www.wiizepay.com"]));
});
