import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Confere a senha das tarefas automáticas. Usa WIIZEPAY_CRON_SECRET;
 * aceita LOVABLE_CRON_SECRET apenas como alternativa para não quebrar ambientes antigos.
 */
export function authenticateWiizePayCron(request: Request): Response | null {
  const secrets = [
    process.env["WIIZEPAY_CRON_SECRET"],
    process.env["WIIZEPAY_CRON_SECRET_PREVIOUS"],
    process.env["LOVABLE_CRON_SECRET"],
    process.env["LOVABLE_CRON_SECRET_PREVIOUS"],
  ].filter((s): s is string => !!s);
  if (secrets.length === 0)
    return new Response("Server configuration error", { status: 500 });

  const token = /^Bearer ([^\s,]+)$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  const provided = digest(token);
  let ok = false;
  for (const s of secrets) if (timingSafeEqual(provided, digest(s))) ok = true;
  return ok ? null : new Response("Unauthorized", { status: 401 });
}
