/** A remote result is durable only when the expected row is returned by the write. */
export async function requireChargeSaved(write: PromiseLike<{ error: unknown; data?: unknown }>) {
  const result = await write;
  if (result.error || !result.data) throw new Error("charge_save_incomplete");
}