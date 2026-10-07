/** Célula de CSV segura: escapa aspas e neutraliza fórmulas (=, +, -, @, tab) que o Excel executaria. */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
