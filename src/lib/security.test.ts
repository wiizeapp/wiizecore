import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const libDir = join(process.cwd(), "src/lib");
const functionFiles = readdirSync(libDir).filter((f) => f.endsWith(".functions.ts"));

describe("fronteiras de segurança", () => {
  it("nenhum *.functions.ts importa o cliente administrativo no topo do arquivo", () => {
    for (const f of functionFiles) {
      const src = readFileSync(join(libDir, f), "utf8");
      expect(src, f).not.toMatch(/^import .*client\.server/m);
    }
  });

  it("webhook exige token e compara em tempo constante", () => {
    const src = readFileSync(join(process.cwd(), "src/routes/api/public/webhooks/asaas.ts"), "utf8");
    expect(src).toMatch(/asaas-access-token/);
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).toMatch(/status: 401/);
  });

  it("links públicos têm limite de tentativas", () => {
    for (const f of ["checkout.functions.ts", "contract-links.functions.ts", "contract-docs.functions.ts", "pix-automatic.functions.ts", "mfa-recovery.functions.ts"]) {
      expect(readFileSync(join(libDir, f), "utf8"), f).toMatch(/consumeRateLimit/);
    }
  });

  it("nenhum segredo do servidor é lido no navegador", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
    for (const file of walk(join(process.cwd(), "src"))) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(/import\.meta\.env\.[A-Z_]*(SERVICE_ROLE|SECRET|API_KEY|ENCRYPTION)/);
    }
  });

  it("código reserva é único e não pode ser regenerado", () => {
    const src = readFileSync(join(libDir, "security.functions.ts"), "utf8");
    expect(src).toMatch(/single_issued_at/);
    expect(src).toMatch(/já foi emitido e não pode ser mostrado ou gerado novamente/);
    expect(src).toMatch(/Ative e confirme o 2FA antes de emitir o código reserva/);
    expect(src).not.toMatch(/Array\.from\(\{ length: 8 \}/);
  });

  it("desativação e troca de senha com código reserva são protegidas no servidor", () => {
    const recovery = readFileSync(join(libDir, "mfa-recovery.functions.ts"), "utf8");
    const security = readFileSync(join(libDir, "security.functions.ts"), "utf8");
    expect(recovery).toMatch(/resetPasswordWithRecoveryCode/);
    expect(recovery).toMatch(/disableMfaWithRecoveryCode/);
    expect(recovery).toMatch(/\.is\("used_at", null\)/);
    expect(security).toMatch(/Confirme o código do autenticador ou o código reserva antes de desativar/);
  });
});
