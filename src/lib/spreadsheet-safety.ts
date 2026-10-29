/** Treat user-authored text as text, including whitespace-prefixed formula markers. */
export function safeSpreadsheetRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    typeof value === "string" && /^[\s\uFEFF]*[=+@-]/u.test(value) ? `'${value}` : value,
  ])) as T);
}