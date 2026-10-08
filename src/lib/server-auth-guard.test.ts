import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Proteção contra regressão: toda função do servidor exige login,
 * exceto a lista abaixo, que é pública de propósito (links com código, taxas públicas).
 */
const PUBLIC_ALLOWED: Record<string, string[]> = {
  "checkout.functions.ts": ["*"],
  "fees.functions.ts": ["*"],
  "contract-docs.functions.ts": ["getSignerView", "getSignerPdf", "signAsExtraSigner", "getCustomerPdf", "verifyContract"],
  "contract-links.functions.ts": ["*"],
  "pix-automatic.functions.ts": ["*"],
  "team.functions.ts": ["getInvite"],
  "wiize-integration.functions.ts": ["startWiizeLogin"],
  // Portal: protegido por sessão própria do cliente (e-mail + documento, hash, 30 min).
  "portal.functions.ts": ["*"],
  // Celular: protegido por link de uso único + código, sessão curta.
  "activation-handoff.functions.ts": ["verifyActivationHandoff", "getMobileActivation", "saveMobileActivation", "uploadMobileActivationDocument", "finishActivationHandoff"],
  // Janelas embutidas da Wiize: protegidas por passe de uso único + sessão curta de 30 min.
  "embed.functions.ts": ["*"],
};

describe("funções do servidor exigem login", () => {
  const dir = __dirname;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".functions.ts"))) {
    it(file, () => {
      const src = readFileSync(join(dir, file), "utf8");
      const re = /export const (\w+) = createServerFn\([^)]*\)([\s\S]*?)\.handler\(/g;
      const unprotected: string[] = [];
      for (const m of src.matchAll(re)) {
        if (!m[2]!.includes(".middleware(")) unprotected.push(m[1]!);
      }
      const allowed = PUBLIC_ALLOWED[file] ?? [];
      const bad = allowed.includes("*") ? [] : unprotected.filter((n) => !allowed.includes(n));
      expect(bad).toEqual([]);
    });
  }
});
