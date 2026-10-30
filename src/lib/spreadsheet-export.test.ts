import { describe, expect, it } from "vitest";
import { spreadsheetCsv, spreadsheetData } from "./spreadsheet-export";
describe("safe spreadsheet writer", () => {
  it("untrusted formulas stay text and application totals remain formulas", () => {
    const data = spreadsheetData([{ Cliente: "=malicious()", Valor: 60 }], ["Valor"]);
    expect(data[1]?.[0]).toEqual({ value: "'=malicious()", type: String });
    expect(data[1]?.[1]).toMatchObject({ value: 60, type: Number });
    expect(data[2]?.[1]).toMatchObject({ value: "SUM(B2:B2)", type: "Formula" });
  });
  it("CSV escapes untrusted values and quotes", () => {
    expect(spreadsheetCsv([{ Nome: '=cmd("x")' }])).toContain('"\'=cmd(""x"")"');
  });
});