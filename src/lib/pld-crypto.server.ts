import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export function encryptPld(value: unknown, context: string, secret: string) {
  const iv = randomBytes(12), key = scryptSync(secret, "wiize-pld-v1", 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64")}`;
}
export function decryptPld(value: string, context: string, secret: string): unknown {
  if (!value.startsWith("v1:")) throw new Error("Versão de criptografia indisponível.");
  const bytes = Buffer.from(value.slice(3), "base64");
  if (bytes.length < 29) throw new Error("Conteúdo protegido inválido.");
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(secret, "wiize-pld-v1", 32), bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
}