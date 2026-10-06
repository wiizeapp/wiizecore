import { decryptSecret, encryptSecret } from "./crypto.server";

type Form = Record<string, string>;
// Só campos não sensíveis ficam legíveis no banco; o restante (CPF, RG, nascimento,
// contato, endereço, faturamento, responsável legal) fica apenas criptografado.
const PLAIN_KEYS = new Set(["legalName", "tradeName", "companyType", "city", "state", "businessModel", "expectedVolume"]);

export function sealForm(form: Form) {
  const plain: Form = {};
  for (const [k, v] of Object.entries(form ?? {})) if (PLAIN_KEYS.has(k)) plain[k] = v;
  return { form_data: plain, form_enc: encryptSecret(JSON.stringify(form ?? {})) };
}

/** Formulário completo (somente no servidor). Linhas antigas sem criptografia usam form_data. */
export function openForm(row: { form_data?: unknown; form_enc?: string | null } | null | undefined): Form {
  const base = ((row?.form_data ?? {}) as Form);
  if (!row?.form_enc) return { ...base };
  try {
    return { ...base, ...(JSON.parse(decryptSecret(row.form_enc)) as Form) };
  } catch {
    return { ...base };
  }
}
