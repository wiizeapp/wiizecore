import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Chaves de criptografia do servidor, por versão. Nunca chegam ao navegador.
 * v1 = WIIZEPAY_ENCRYPTION_KEY (aceita o nome antigo WISE_PAY_ENCRYPTION_KEY).
 * Para trocar a chave no futuro, crie WIIZEPAY_ENCRYPTION_KEY_V2 e mude CURRENT_VERSION.
 * O "salt" interno abaixo nunca pode mudar, senão os dados já guardados ficam ilegíveis.
 */
const CURRENT_VERSION = 1;
const keyCache = new Map<number, Buffer>();
function keyFor(version: number): Buffer {
  const cached = keyCache.get(version);
  if (cached) return cached;
  const raw =
    version === 1
      ? (process.env["WIIZEPAY_ENCRYPTION_KEY"] ??
        process.env["WISE_PAY_ENCRYPTION_KEY"])
      : (process.env[`WIIZEPAY_ENCRYPTION_KEY_V${version}`] ??
        process.env[`WISE_PAY_ENCRYPTION_KEY_V${version}`]);
  if (!raw)
    throw new Error(`Chave de criptografia v${version} não configurada`);
  const key = scryptSync(
    raw,
    version === 1 ? "wise-pay-master-v1" : `wise-pay-master-v${version}`,
    32,
  );
  keyCache.set(version, key);
  return key;
}

/** Criptografa um segredo (AES-256-GCM) com prefixo de versão: `v1:<base64>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(CURRENT_VERSION), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `v${CURRENT_VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")}`;
}

/** Lê o formato com versão e também o formato antigo (sem prefixo = v1). */
export function decryptSecret(stored: string): string {
  const match = /^v(\d+):(.+)$/s.exec(stored);
  const version = match ? Number(match[1]) : 1;
  const buffer = Buffer.from(match ? match[2]! : stored, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyFor(version), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

/** Indica se um valor já está na versão de chave atual (para recriptografar aos poucos). */
export function needsReencrypt(stored: string): boolean {
  return !stored.startsWith(`v${CURRENT_VERSION}:`);
}

/** Hash com salt aleatório para a senha financeira e códigos de recuperação. */
export function hashSecretValue(value: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(value.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifySecretValue(value: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64");
  const expected = Buffer.from(parts[2]!, "base64");
  const derived = scryptSync(value.normalize("NFKC"), salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Impressão digital de um documento de contrato (versionamento e assinatura). */
export function documentHash(content: string): string {
  return createHash("sha256")
    .update(content.normalize("NFKC"), "utf8")
    .digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomNumericCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function randomRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i += 1) {
    code += alphabet[bytes[i]! % alphabet.length];
    if (i === 4) code += "-";
  }
  return code;
}
