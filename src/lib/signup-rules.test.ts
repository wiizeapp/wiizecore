import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { signupSchema, SIGNUP_LIMITS } from "./signup-rules";
import { canDecide } from "./card-risk-rules";

const ok = { fullName: "Maria Teste", email: "maria@example.com", password: "Forte#Senh4Boa" };

describe("cadastro protegido", () => {
  it("aceita cadastro legítimo", () => expect(signupSchema.safeParse(ok).success).toBe(true));
  it("recusa e-mail inválido", () => expect(signupSchema.safeParse({ ...ok, email: "x@" }).success).toBe(false));
  it("recusa senha fraca enviada direto ao servidor", () => expect(signupSchema.safeParse({ ...ok, password: "12345678" }).success).toBe(false));
  it("recusa nome vazio ou com marcação", () => {
    expect(signupSchema.safeParse({ ...ok, fullName: " " }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, fullName: "<script>" }).success).toBe(false);
  });
  it("limites: 10 por IP e 3 por e-mail por hora", () => {
    expect(SIGNUP_LIMITS.ip.maxAttempts).toBe(10);
    expect(SIGNUP_LIMITS.email.maxAttempts).toBe(3);
  });
  it("servidor limita e verifica o CAPTCHA antes de criar a conta", () => {
    const src = readFileSync("src/lib/signup.functions.ts", "utf8");
    const turnstile = src.indexOf("requireTurnstileFor(admin");
    expect(src.indexOf("signup_ip")).toBeLessThan(turnstile);
    expect(turnstile).toBeLessThan(src.indexOf("auth.signUp("));
  });
  it("tela de cadastro usa o servidor, não o cadastro direto", () => {
    const page = readFileSync("src/routes/auth.tsx", "utf8");
    expect(page).not.toMatch(/supabase\.auth\.signUp\(/);
    expect(page).toMatch(/signUpProtected/);
  });
});

describe("decisões do antifraude", () => {
  it("caso aberto aceita todas as decisões", () => expect(canDecide("open", "false_positive")).toBe(true));
  it("caso confirmado só pode ser desbloqueado ou encerrado", () => {
    expect(canDecide("confirmed", "unblock")).toBe(true);
    expect(canDecide("confirmed", "false_positive")).toBe(false);
  });
  it("caso encerrado ou falso positivo não aceita novas decisões", () => {
    expect(canDecide("closed", "unblock")).toBe(false);
    expect(canDecide("false_positive", "confirm")).toBe(false);
  });
  it("Admin exige a dupla confirmação em toda leitura e decisão", () => {
    const src = readFileSync("src/lib/admin-card-risk.server.ts", "utf8");
    expect(src.match(/assertAdminPage\(context/g)?.length).toBe(3);
    expect(src).not.toMatch(/ip_mark|card_mark|subject_mark/);
  });
});
