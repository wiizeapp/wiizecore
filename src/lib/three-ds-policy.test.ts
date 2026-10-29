import { describe, expect, it } from "vitest";
import { threeDsOperationallyEnabled, threeDsEvidenceLabel } from "./three-ds-policy";
describe("controle de homologação 3DS", () => {
  it("não liga sem configuração de ambiente", () => expect(threeDsOperationallyEnabled(false, true)).toBe(false));
  it("não liga sem liberação operacional", () => expect(threeDsOperationallyEnabled(true, false)).toBe(false));
  it("exige as duas liberações", () => expect(threeDsOperationallyEnabled(true, true)).toBe(true));
  it("evidência de confirmação não equivale à autenticação comprovada", () => {
    expect(threeDsEvidenceLabel("authenticated")).not.toBe("Autenticado");
    expect(threeDsEvidenceLabel("returned")).not.toBe(threeDsEvidenceLabel("authenticated"));
  });
});