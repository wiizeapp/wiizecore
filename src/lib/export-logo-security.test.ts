import { expect, it } from "vitest";
import { safeSpreadsheetRows } from "./spreadsheet-safety";
import { approvedLogoUrl, boundedImageBytes } from "./logo-import-policy";

it("texto controlado pelo usuário não vira fórmula na exportação", () => {
  for (const text of ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "\t=1+1", "\r\n=1+1"]) {
    expect(safeSpreadsheetRows([{ Cliente: text }])[0]?.Cliente).toBe(`'${text}`);
  }
});
it("números negativos e texto normal preservam valores", () => expect(safeSpreadsheetRows([{ Valor: -10, Cliente: "Empresa" }])).toEqual([{ Valor: -10, Cliente: "Empresa" }]));
it("importação sem origem aprovada falha fechada", () => expect(() => approvedLogoUrl("https://evil.example/logo.png", undefined)).toThrow());
it("origem exata aprovada funciona", () => expect(approvedLogoUrl("https://assets.example/logo.png", "assets.example").hostname).toBe("assets.example"));
it("não aceita origem parecida, credencial, porta alternativa ou IP", () => {
  for (const url of ["https://assets.example.evil.test/a", "https://u:p@assets.example/a", "https://assets.example:444/a", "https://127.0.0.1/a"]) {
    expect(() => approvedLogoUrl(url, "assets.example,127.0.0.1")).toThrow();
  }
});
it("imagem sem content-length também tem limite real de bytes", async () => await expect(boundedImageBytes(new Response(new Uint8Array(11)), 10)).rejects.toThrow());
it("imagem pequena é lida sem alterar bytes", async () => expect(await boundedImageBytes(new Response(new Uint8Array([1, 2])), 10)).toEqual(new Uint8Array([1, 2])));