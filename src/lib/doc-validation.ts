export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function validCpf(v: string) {
  const c = onlyDigits(v); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) { let s = 0; for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i); const d = ((s * 10) % 11) % 10; if (d !== Number(c[t])) return false; }
  return true;
}

export function validCnpj(v: string) {
  const c = onlyDigits(v); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => { const w = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; const s = w.reduce((a, x, i) => a + x * Number(c[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export const validDocument = (v: string) => (onlyDigits(v).length === 11 ? validCpf(v) : validCnpj(v));

/** Formato de chave Pix: CPF, CNPJ, e-mail, celular (+55) ou chave aleatória. */
export function validPixKey(k: string) {
  const v = k.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  if (/^\+?55\d{10,11}$/.test(v.replace(/[\s()-]/g, ""))) return true;
  return validDocument(v);
}

/** Tipo da chave Pix no formato exigido pelo Asaas (pixAddressKeyType). */
export function pixKeyType(k: string): { type: "EVP" | "EMAIL" | "PHONE" | "CPF" | "CNPJ"; key: string } | null {
  const v = k.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return { type: "EVP", key: v };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { type: "EMAIL", key: v };
  const d = onlyDigits(v);
  if (d.length === 11 && validCpf(d)) return { type: "CPF", key: d };
  if (d.length === 14 && validCnpj(d)) return { type: "CNPJ", key: d };
  if (/^\+?55\d{10,11}$/.test(v.replace(/[\s()-]/g, ""))) return { type: "PHONE", key: d.replace(/^55/, "") };
  return null;
}
