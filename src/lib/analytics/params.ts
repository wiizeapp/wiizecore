/** Filtro final de parâmetros: nada pessoal sai para provedores externos. */
export type EventParams = Record<string, string | number | boolean | null | undefined>;

const FORBIDDEN_KEYS = /(email|e_mail|phone|telefone|cpf|cnpj|document|nome|name_full|full_name|razao|password|senha|token|card|cartao|cvv|pix_key|chave|iban|account_number|address|endereco|message|mensagem|query_text)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DIGITS = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{10,}/; // CPF, CNPJ, telefones, cartões
const URLISH = /https?:\/\/|[?&][a-z_]+=/i;

export function sanitizeParams(params: EventParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v == null || FORBIDDEN_KEYS.test(k) || !/^[a-z][a-z0-9_]{0,39}$/.test(k)) continue;
    if (typeof v === "string") {
      if (EMAIL.test(v) || DIGITS.test(v) || URLISH.test(v)) continue;
      out[k] = v.slice(0, 100);
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = v;
    } else out[k] = v;
  }
  return out;
}

export const EVENT_NAME = /^[a-z][a-z0-9_]{1,39}$/;
