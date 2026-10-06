import { decryptSecret, encryptSecret } from "./crypto.server";

export type BankSensitive = { holder_document: string; agency: string; account_number: string; pix_key: string | null };

const mask = (v: string | null | undefined, keep = 4) => {
  if (!v) return v ?? null;
  return v.length <= keep ? "•".repeat(v.length) : `${"•".repeat(Math.min(6, v.length - keep))}${v.slice(-keep)}`;
};

/** Criptografa os dados de saque e devolve as versões mascaradas para as colunas visíveis. */
export function sealBank(data: BankSensitive) {
  return {
    sensitive_enc: encryptSecret(JSON.stringify(data)),
    holder_document: mask(data.holder_document, 4)!,
    agency: mask(data.agency, 2)!,
    account_number: mask(data.account_number, 3)!,
    pix_key: mask(data.pix_key, 4),
  };
}

/** Lê os dados completos (só no servidor). Linhas antigas ainda sem criptografia usam as colunas atuais. */
export function openBank<T extends Partial<BankSensitive> & { sensitive_enc?: string | null }>(row: T): T {
  if (!row?.sensitive_enc) return row;
  try {
    return { ...row, ...(JSON.parse(decryptSecret(row.sensitive_enc)) as BankSensitive) };
  } catch {
    return row;
  }
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Criptografa contas antigas que ainda estão em texto (sem perder dados). */
export async function sealLegacyBankAccounts(admin: Admin) {
  const { data } = await admin
    .from("bank_accounts")
    .select("id, holder_document, agency, account_number, pix_key")
    .is("sensitive_enc", null)
    .limit(200);
  for (const row of data ?? []) {
    await admin.from("bank_accounts").update(sealBank(row as BankSensitive)).eq("id", row.id).is("sensitive_enc", null);
  }
}
