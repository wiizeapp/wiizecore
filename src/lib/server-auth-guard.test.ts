import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Proteção contra regressão: toda função do servidor exige login,
 * exceto a lista abaixo, que é pública de propósito (links com código, taxas públicas).
 */
const PUBLIC_ALLOWED: Record<string, string[]> = {
  "checkout.functions.ts": ["*"],
  "signup.functions.ts": ["signUpProtected"],
  // Public contract capability, tenant/version/recipient checks and atomic rate limits precede email delivery.
  "contract-signing.functions.ts": ["requestContractSigningCode"],
  "fees.functions.ts": ["*"],
  "contract-docs.functions.ts": ["getSignerView", "getSignerPdf", "signAsExtraSigner", "getCustomerPdf", "verifyContract"],
  "contract-links.functions.ts": ["*"],
  "pix-automatic.functions.ts": ["*"],
  "team.functions.ts": ["getInvite"],
  // Antes do login não há sessão: só grava referência pseudônima, limitado por IP.
  "auth-events.functions.ts": ["recordLoginFailure"],
  "wiize-integration.functions.ts": ["startWiizeLogin"],
  // Portal: protegido por sessão própria do cliente (e-mail + documento, hash, 30 min).
  "portal.functions.ts": ["*"],
  // Celular: protegido por link de uso único + código, sessão curta.
  "activation-handoff.functions.ts": ["verifyActivationHandoff", "getMobileActivation", "saveMobileActivation", "uploadMobileActivationDocument", "finishActivationHandoff"],
  // Checkout de teste: protegido pelo código sbx_ do link; só lê/altera registros do simulador.
  "ext-portal.functions.ts": ["getSandboxCheckout", "paySandboxCheckout"],
  // Link aberto de serviço: comprador sem login; protegido pelo código do link, limite por IP,
  // preço vindo só da versão salva e sessão curta de 2 h. Criar/listar links continua exigindo login.
  "service-checkout.functions.ts": ["getServiceCheckout", "startServiceCheckout", "chooseServiceCheckoutMethod"],
  // Janelas embutidas da Wiize: protegidas por passe de uso único + sessão curta de 30 min.
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
