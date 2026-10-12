import { describe, expect, it } from "vitest";
import { EXT_EVENTS } from "./ext-webhooks";
import { buildExtAiPrompt, EXT_EVENT_NAMES } from "./ext-docs";

describe("ext docs", () => {
  it("lista de eventos da tela bate com a real", () => expect([...EXT_EVENT_NAMES]).toEqual([...EXT_EVENTS]));
  it("prompt não tem chaves e limpa quebras de linha", () => {
    const p = buildExtAiPrompt({ saas: "Meu\nApp", language: "", database: "", hosting: "", services: "", methods: "" });
    expect(p).toContain('"Meu App"');
    expect(p).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{6}/);
  });
});
