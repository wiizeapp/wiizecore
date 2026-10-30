import type { Cell, SheetData } from "write-excel-file/universal";
import { safeSpreadsheetRows } from "./spreadsheet-safety";

function columnName(index: number): string {
  let value = index + 1; let name = "";
  while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return name;
}
export function spreadsheetData(rows: Record<string, unknown>[], money: string[] = []): SheetData {
  const safe = safeSpreadsheetRows(rows);
  const headers = rows.length ? Object.keys(rows[0] ?? {}) : ["Sem dados"];
  const format = '"R$" #,##0.00;-"R$" #,##0.00';
  const data: SheetData = [headers.map((value) => ({ value, type: String, fontWeight: "bold" }))];
  for (const row of safe) data.push(headers.map((key): Cell => {
    const value = row[key];
    return typeof value === "number" && Number.isFinite(value) ? { value, type: Number, ...(money.includes(key) ? { format } : {}) } : { value: value == null ? "" : String(value), type: String };
  }));
  if (rows.length && money.length) data.push(headers.map((key, i): Cell => money.includes(key) ? { value: `SUM(${columnName(i)}2:${columnName(i)}${rows.length + 1})`, type: "Formula", format } : { value: i === 0 ? "Total" : "", type: String }));
  return data;
}
export function spreadsheetCsv(rows: Record<string, unknown>[]): string {
  const headers = Object.keys(rows[0] ?? {});
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + [headers, ...safeSpreadsheetRows(rows).map((r) => headers.map((h) => r[h]))].map((r) => r.map(quote).join(",")).join("\r\n");
}
export async function downloadSpreadsheet(rows: Record<string, unknown>[], fileName: string, sheet = "Dados", money: string[] = []): Promise<void> {
  let blob: Blob;
  if (fileName.endsWith(".csv")) blob = new Blob([spreadsheetCsv(rows)], { type: "text/csv;charset=utf-8" });
  else {
    const { default: write } = await import("write-excel-file/universal");
    blob = await write(spreadsheetData(rows, money), { sheet: sheet.slice(0, 31), stickyRowsCount: 1, columns: Object.keys(rows[0] ?? { "Sem dados": "" }).map((h) => ({ width: Math.max(12, h.length + 4) })) });
  }
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}