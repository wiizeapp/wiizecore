import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/lib/admin.functions.ts", "utf8");
const approve = src.slice(src.indexOf("export const reviewWithdrawal"), src.indexOf("complete_withdrawal"));

describe("aprovação de saque", () => {
  it("não aceita aprovar de novo um saque já em envio", () => {
    expect(approve).toContain(`const editableStatuses = ['requested', 'in_analysis'];`);
  });
  it("reserva o saque antes de enviar o Pix, só uma vez", () => {
    const claim = approve.indexOf(`.in("status", ["requested", "in_analysis"])`);
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(approve.indexOf("createTransfer"));
    expect(approve).toContain(`.is("provider_transfer_id", null)`);
  });
});
