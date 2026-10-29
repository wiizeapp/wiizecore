/**
 * Identificação centralizada do IP do cliente (função pura, testável).
 *
 * Diferenças importantes:
 * - IP do cliente: endereço público do visitante, informado pela borda da hospedagem.
 * - IP do proxy: endereços intermediários (CDN/balanceador) que aparecem em X-Forwarded-For.
 * - IP de saída do servidor: endereço usado pelo nosso backend ao chamar a Asaas; nunca é o do cliente.
 *
 * Regras:
 * - Só cabeçalhos definidos pela borda da hospedagem são aceitos, na ordem configurada.
 * - O primeiro valor de X-Forwarded-For NUNCA é usado (o cliente pode escrevê-lo).
 * - IPs inválidos, vazios ou com vários valores são rejeitados (resultado null + motivo).
 * - Não existe IP "padrão" compartilhado: sem IP confiável, o chamador decide o tratamento.
 *
 * Dependência operacional: a hospedagem precisa sobrescrever o cabeçalho escolhido.
 * Produção (Vercel) define `x-real-ip`; a hospedagem Lovable (Cloudflare) define `cf-connecting-ip`.
 * Configure TRUSTED_CLIENT_IP_HEADERS no servidor para fixar a ordem em cada ambiente.
 */

export const DEFAULT_TRUSTED_HEADERS = ["cf-connecting-ip", "x-real-ip"] as const;

export type ClientIpResult =
  | { ip: string; source: string; reason: null }
  | { ip: null; source: null; reason: "missing" | "invalid" | "ambiguous" };

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidIpv4(v: string): boolean {
  return IPV4.test(v);
}

export function isValidIpv6(v: string): boolean {
  if (v.length < 2 || v.length > 45 || !/^[0-9a-fA-F:.]+$/.test(v)) return false;
  const parts = v.split("::");
  if (parts.length > 2) return false;
  let tail = v;
  let groupsNeeded = 8;
  // IPv4 embutido no final (ex.: ::ffff:192.0.2.1)
  const lastColon = v.lastIndexOf(":");
  const last = v.slice(lastColon + 1);
  if (last.includes(".")) {
    if (!isValidIpv4(last)) return false;
    tail = v.slice(0, lastColon + 1) + "0:0";
    groupsNeeded = 8;
  }
  const [head = "", rest] = tail.split("::");
  const groups = (s: string) => (s === "" ? [] : s.split(":"));
  const h = groups(head);
  const r = rest === undefined ? null : groups(rest);
  const all = r ? [...h, ...r] : h;
  if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  return r ? all.length < groupsNeeded : all.length === groupsNeeded;
}

export function normalizeIp(raw: string): string | null {
  const v = raw.trim();
  if (isValidIpv4(v)) return v;
  if (isValidIpv6(v)) return v.toLowerCase();
  return null;
}

/** Lê a ordem de cabeçalhos confiáveis da configuração; ignora nomes estranhos e nunca aceita X-Forwarded-For. */
export function parseTrustedHeaders(config: string | undefined | null): string[] {
  if (!config) return [...DEFAULT_TRUSTED_HEADERS];
  const list = config
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9-]{1,64}$/.test(h) && h !== "x-forwarded-for");
  return list.length ? list : [...DEFAULT_TRUSTED_HEADERS];
}

export function resolveClientIp(
  getHeader: (name: string) => string | null | undefined,
  trustedHeaders: readonly string[] = DEFAULT_TRUSTED_HEADERS,
): ClientIpResult {
  let sawInvalid = false;
  for (const name of trustedHeaders) {
    const raw = getHeader(name);
    if (raw == null || raw.trim() === "") continue;
    if (raw.includes(",")) return { ip: null, source: null, reason: "ambiguous" };
    const ip = normalizeIp(raw);
    if (ip) return { ip, source: name, reason: null };
    sawInvalid = true;
  }
  return { ip: null, source: null, reason: sawInvalid ? "invalid" : "missing" };
}
