/** Exact server-approved hostnames only; no suffix or wildcard trust. */
export function approvedWebhookDestination(raw: string, approvedHosts: string | undefined): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  if (!host.includes(".") || host.includes(":") || host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host) || /\.(localhost|local|internal)$/.test(host)) return false;
  const list = (approvedHosts ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return list.includes(host);
}