import { describe, expect, it } from "vitest";
import { contrastIssues, contrastRatio, DEFAULT_APPEARANCE, headerTextColors, normalizeAppearance, THEMES } from "./checkout-appearance";

describe("aparência do checkout", () => {
  it("temas prontos são legíveis", () => {
    for (const t of Object.values(THEMES)) expect(contrastIssues(t)).toEqual([]);
  });
  it("detecta baixo contraste", () => {
    expect(contrastIssues({ ...THEMES.wiize, text: "#EEEEEE" })).toContain("text");
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
  it("rejeita HTML e volta ao padrão", () => {
    expect(normalizeAppearance({ title: "<script>alert(1)</script>" })).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ background: "red" })).toEqual(DEFAULT_APPEARANCE);
  });
  it("aceita textos simples", () => {
    expect(normalizeAppearance({ title: "Confirme seus dados" }).title).toBe("Confirme seus dados");
  });
  it("versões antigas sem cabeçalho usam a cor das superfícies", () => {
    const old = { ...THEMES.dark, theme: "dark" } as Record<string, unknown>;
    delete old["header"];
    expect(normalizeAppearance(old).header).toBe(THEMES.dark.surface);
    expect(normalizeAppearance({ ...THEMES.dark, theme: "dark", header: "#123456" }).header).toBe("#123456");
  });
  it("texto do cabeçalho continua legível em qualquer cor", () => {
    const colors = headerTextColors({ header: "#0B0F14", text: "#111827", mutedText: "#5B6472" });
    expect(contrastRatio(colors.text, "#0B0F14")).toBeGreaterThanOrEqual(4.5);
  });
  it("fundo da página com texto ilegível é bloqueado", () => {
    expect(contrastIssues({ ...THEMES.wiize, background: "#111111" })).toContain("background");
  });
});
