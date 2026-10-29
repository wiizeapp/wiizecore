import { describe, expect, it } from "vitest";
import { defenseEditable, disputeConfirmed, MAX_DEFENSE_FILES, validateDefenseFile } from "./chargeback-rules";
describe("defesa de contestação", () => {
  it("limita a onze arquivos", () => expect(MAX_DEFENSE_FILES).toBe(11));
  it("rejeita conteúdo disfarçado de PDF", () => expect(() => validateDefenseFile(new TextEncoder().encode("<script>"), "application/pdf")).toThrow());
  it("aceita assinatura de PDF", () => expect(validateDefenseFile(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).toBe("pdf"));
  it("bloqueia prazo vencido", () => expect(defenseEditable({ status: "REQUESTED", defense_state: "idle", dispute_deadline: "2026-10-28" }, "2026-10-29")).toBe(false));
  it("bloqueia repetição em resposta incerta", () => expect(defenseEditable({ status: "REQUESTED", defense_state: "uncertain", dispute_deadline: null }, "2026-10-29")).toBe(false));
  it("exige confirmação do mesmo chargeback", () => expect(disputeConfirmed({ chargebackId: "other", status: "REQUESTED", files: ["a.pdf"] }, "cb_1")).toBe(false));
  it("não confirma resposta vazia", () => expect(disputeConfirmed({}, "cb_1")).toBe(false));
  it("confirma recebimento sem prometer reversão", () => expect(disputeConfirmed({ chargebackId: "cb_1", status: "REQUESTED", files: ["a.pdf"] }, "cb_1")).toBe(true));
});