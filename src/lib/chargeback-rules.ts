export const MAX_DEFENSE_FILES = 11;
export const MAX_DEFENSE_BYTES = 5 * 1024 * 1024;
export function validateDefenseFile(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_DEFENSE_BYTES) throw new Error("O arquivo deve ter até 5 MB.");
  const sig = Array.from(bytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ext = mime === "application/pdf" && sig.startsWith("255044462d") ? "pdf" : mime === "image/jpeg" && sig.startsWith("ffd8ff") ? "jpg" : mime === "image/png" && sig === "89504e470d0a1a0a" ? "png" : null;
  if (!ext) throw new Error("Envie um PDF, JPG ou PNG válido.");
  return ext;
}
export function defenseEditable(c: { status: string; defense_state: string; dispute_deadline: string | null }, today: string) {
  return c.status === "REQUESTED" && c.defense_state === "idle" && (!c.dispute_deadline || c.dispute_deadline >= today);
}
export function disputeConfirmed(body: unknown, id: string): boolean {
  if (!body || typeof body !== "object") return false;
  const r = body as Record<string, unknown>;
  const files = r["files"];
  return r["chargebackId"] === id && ["REQUESTED", "ACCEPTED", "REJECTED"].includes(String(r["status"])) && Array.isArray(files) && files.length > 0 && files.every((f) => typeof f === "string");
}