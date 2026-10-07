import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// Toda busca do vínculo do usuário precisa exigir vínculo ativo (ex-colaborador nunca passa).
describe("vínculo ativo", () => {
  it("consultas de tenant_members por user_id sempre filtram status ativo", () => {
    const bad: string[] = [];
    for (const f of readdirSync("src/lib").filter((n) => n.endsWith(".functions.ts") || n.endsWith(".server.ts"))) {
      const src = readFileSync(`src/lib/${f}`, "utf8");
      const re = /\.from\("tenant_members"\)\s*\.select\([^)]*\)\s*\.eq\("user_id",[^)]*\)(?!\s*\.eq\("status", "active"\))/g;
      if (re.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
