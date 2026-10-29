/** Only an explicit authorization denial counts as inaccessible, never a service error. */
export async function isolationRows(response: Response): Promise<unknown[]> {
  const body: unknown = await response.json();
  if (response.ok) {
    if (!Array.isArray(body)) throw new Error("Isolation response must be an array");
    return body;
  }
  const code = body && typeof body === "object" && "code" in body ? body.code : null;
  if ((response.status === 401 || response.status === 403) && code === "42501") return [];
  throw new Error(`Isolation check inconclusive: HTTP ${response.status}`);
}

export async function assertIsolationDenied(response: Response) {
  if (response.ok) throw new Error("Unauthorized operation unexpectedly succeeded");
  await isolationRows(response);
}