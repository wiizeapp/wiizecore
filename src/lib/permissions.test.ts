import { describe, expect, it } from "vitest";
import { effectivePermissions } from "./permissions";
describe("permissões", () => {
  it("colaborador nunca recebe saque", () => {
    expect(effectivePermissions("viewer", ["withdrawals.request", "finance.view"])).not.toContain("withdrawals.request");
    expect(effectivePermissions("finance")).not.toContain("bank_accounts.manage");
  });
  it("admin e proprietário têm permissões críticas", () => {
    expect(effectivePermissions("admin")).toContain("withdrawals.request");
    expect(effectivePermissions("owner")).toContain("team.manage");
  });
  it("ignora permissões desconhecidas", () => {
    expect(effectivePermissions("viewer", ["hack.all"])).not.toContain("hack.all");
  });
});
