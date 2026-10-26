import { describe, expect, it } from "vitest";
import { adminGrantValid, freshChallengeValid } from "./admin-session-policy";

const grant = { userId: "admin", sessionId: "session", issuedAt: 0, lastActivity: 0, revoked: false };
describe("liberação administrativa", () => {
  it("bloqueia após cinco minutos sem atividade", () => {
    expect(adminGrantValid(grant, "admin", "session", 299999)).toBe(true);
    expect(adminGrantValid(grant, "admin", "session", 300000)).toBe(false);
  });
  it("expira em trinta minutos mesmo com atividade", () => {
    expect(adminGrantValid({ ...grant, lastActivity: 1799999 }, "admin", "session", 1800000)).toBe(false);
  });
  it("não permite outra conta ou sessão", () => {
    expect(adminGrantValid(grant, "other", "session", 1)).toBe(false);
    expect(adminGrantValid(grant, "admin", "other", 1)).toBe(false);
  });
  it("recusa sessão revogada", () => {
    expect(adminGrantValid({ ...grant, revoked: true }, "admin", "session", 1)).toBe(false);
  });
  it("desafio novo expira em dois minutos e não pode ser reutilizado", () => {
    expect(freshChallengeValid(0, false, 119999)).toBe(true);
    expect(freshChallengeValid(0, false, 120000)).toBe(false);
    expect(freshChallengeValid(0, true, 1)).toBe(false);
  });
});