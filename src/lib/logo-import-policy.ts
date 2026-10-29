/** Exact destination allowlist; no wildcards, credentials, alternate ports or redirects. */
export function approvedLogoUrl(value: string, approvedHosts: string | undefined) {
  const url = new URL(value);
  const hosts = (approvedHosts ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !hosts.includes(host)
    || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    throw new Error("Este endereço de logo não é permitido.");
  }
  return url;
}

export async function boundedImageBytes(response: Response, maxBytes: number) {
  if (!response.body) throw new Error("Arquivo de imagem inválido.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); throw new Error("A imagem desse endereço é maior que 2 MB."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}