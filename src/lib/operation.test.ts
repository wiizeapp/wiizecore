import { describe, expect, it } from "vitest";
import { canUseFinancialScreens, isOperation } from "./operation";

describe("seletor de operação", () => {
  it("aceita somente brasil e global", () => {
    expect(isOperation("brasil")).toBe(true);
    expect(isOperation("global")).toBe(true);
    expect(isOperation("usd")).toBe(false);
  });
  it("Global fica bloqueada enquanto não habilitada", () => {
    expect(canUseFinancialScreens("global", false)).toBe(false);
    expect(canUseFinancialScreens("brasil", false)).toBe(true);
  });
});
