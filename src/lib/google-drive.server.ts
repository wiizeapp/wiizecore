import { decryptSecret, encryptSecret } from "./crypto.server";

type Admin = { from: (t: string) => any };

export const DRIVE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];
const FOLDER_NAME = "WiizePay – Contratos";

export function driveConfigured() {
  return Boolean(process.env["GOOGLE_DRIVE_CLIENT_ID"] && process.env["GOOGLE_DRIVE_CLIENT_SECRET"]);
}

export function redirectUri(origin: string) {
  return `${origin}/api/public/google-drive/callback`;
}

export function buildAuthUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env["GOOGLE_DRIVE_CLIENT_ID"]!, redirect_uri: redirectUri(origin), response_type: "code",
    scope: DRIVE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export function signState(v: { t: string; u: string; o: string }) {
  return encodeURIComponent(encryptSecret(JSON.stringify({ ...v, e: Date.now() + 10 * 60_000 })));
}
export function readState(s: string): { t: string; u: string; o: string } | null {
  try {
    const v = JSON.parse(decryptSecret(decodeURIComponent(s)));
    if (!v?.t || !v?.u || !v?.o || Date.now() > v.e) return null;
    return v;
  } catch { return null; }
}

async function tokenCall(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env["GOOGLE_DRIVE_CLIENT_ID"]!, client_secret: process.env["GOOGLE_DRIVE_CLIENT_SECRET"]!, ...body }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("google token", res.status, j?.error); throw new Error(j?.error === "invalid_grant" ? "drive_revoked" : "Falha ao falar com o Google."); }
  return j as { access_token: string; refresh_token?: string; id_token?: string };
}

export async function exchangeCode(code: string, origin: string) {
  const t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, email: (info?.email as string) ?? null };
}

export async function getConnection(admin: Admin, tenantId: string) {
  const { data } = await admin.from("google_drive_connections").select("id, status, google_email, root_folder_id, refresh_token_ciphertext, updated_at").eq("tenant_id", tenantId).maybeSingle();
  return data && data.status === "active" && data.refresh_token_ciphertext ? data : null;
}

async function accessToken(admin: Admin, tenantId: string) {
  const c = await getConnection(admin, tenantId);
  if (!c) throw new Error("Conecte o Google Drive em Configurações → Integrações.");
  try {
    const t = await tokenCall({ refresh_token: decryptSecret(c.refresh_token_ciphertext), grant_type: "refresh_token" });
    return { token: t.access_token, conn: c };
  } catch (e) {
    if (e instanceof Error && e.message === "drive_revoked") {
      await admin.from("google_drive_connections").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
      throw new Error("O acesso ao Google Drive foi removido. Conecte novamente em Integrações.");
    }
    throw e;
  }
}

async function gfetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) { const t = await res.text(); console.error("drive", res.status, t.slice(0, 300)); throw new Error("Não foi possível acessar o Google Drive."); }
  return res;
}

async function createFolder(token: string, name: string, parent?: string) {
  const r = await gfetch(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
  });
  return ((await r.json()) as { id: string }).id;
}

async function rootFolder(admin: Admin, tenantId: string, token: string, current: string | null) {
  if (current) {
    const ok = await fetch(`https://www.googleapis.com/drive/v3/files/${current}?fields=id,trashed`, { headers: { Authorization: `Bearer ${token}` } });
    if (ok.ok && !(await ok.json()).trashed) return current;
  }
  const id = await createFolder(token, FOLDER_NAME);
  await admin.from("google_drive_connections").update({ root_folder_id: id, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  return id;
}

async function findChild(token: string, parent: string, name: string) {
  const q = encodeURIComponent(`'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`);
  const r = await gfetch(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  return ((await r.json()) as { files: { id: string }[] }).files[0]?.id ?? null;
}

/** Envia um arquivo para a pasta do contrato no Drive da empresa. Retorna o ID do arquivo. */
export async function uploadToDrive(admin: Admin, tenantId: string, input: { folderName: string; fileName: string; mime: string; bytes: Uint8Array; replaceId?: string | null; rootName?: string }) {
  const { token, conn } = await accessToken(admin, tenantId);
  const root = input.rootName
    ? (await findChild(token, "root", input.rootName)) ?? (await createFolder(token, input.rootName))
    : await rootFolder(admin, tenantId, token, conn.root_folder_id);
  const folderName = input.folderName.replace(/[\\/]+/g, "-").slice(0, 120);
  const folder = (await findChild(token, root, folderName)) ?? (await createFolder(token, folderName, root));
  const boundary = `wiizepay${Date.now()}`;
  const meta = JSON.stringify(input.replaceId ? { name: input.fileName } : { name: input.fileName, parents: [folder] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${input.mime}\r\n\r\n`,
    input.bytes as unknown as BlobPart, `\r\n--${boundary}--`,
  ]);
  const url = input.replaceId
    ? `https://www.googleapis.com/upload/drive/v3/files/${input.replaceId}?uploadType=multipart&fields=id`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
  const r = await gfetch(token, url, { method: input.replaceId ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  return ((await r.json()) as { id: string }).id;
}

export async function downloadFromDrive(admin: Admin, tenantId: string, fileId: string) {
  const { token } = await accessToken(admin, tenantId);
  const r = await gfetch(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Baixa um arquivo pelo link do Drive (só funciona para arquivos que a conta conectada pode abrir). */
export async function importFromDriveLink(admin: Admin, tenantId: string, fileId: string) {
  const { token } = await accessToken(admin, tenantId);
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meta.ok) {
    // Com acesso restrito, o Drive só abre arquivos criados pela Wiize Recebe. Para links públicos, baixamos a versão compartilhada.
    for (const u of [`https://docs.google.com/document/d/${fileId}/export?format=pdf`, `https://drive.google.com/uc?export=download&id=${fileId}`]) {
      const r = await fetch(u, { redirect: "follow" }).catch(() => null);
      if (!r?.ok) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes.length <= 12 * 1024 * 1024) return { name: "documento-drive.pdf", bytes };
    }
    throw new Error("Não conseguimos abrir esse link. No Drive, deixe o arquivo como “Qualquer pessoa com o link” ou arraste o arquivo para cá.");
  }
  const m = (await meta.json()) as { name: string; mimeType: string; size?: string };
  if (Number(m.size ?? 0) > 12 * 1024 * 1024) throw new Error("Arquivo maior que 12 MB.");
  let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  let mime = m.mimeType;
  if (m.mimeType.startsWith("application/vnd.google-apps.")) { url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`; mime = "application/pdf"; }
  if (mime !== "application/pdf") throw new Error("Pelo link, aceitamos PDF ou Google Docs. Para Word, envie o arquivo.");
  const r = await gfetch(token, url);
  return { name: m.name.replace(/\.pdf$/i, "") + ".pdf", bytes: new Uint8Array(await r.arrayBuffer()) };
}

export async function revokeDrive(admin: Admin, tenantId: string) {
  const { data } = await admin.from("google_drive_connections").select("refresh_token_ciphertext").eq("tenant_id", tenantId).maybeSingle();
  if (data?.refresh_token_ciphertext) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(data.refresh_token_ciphertext))}`, { method: "POST" }); } catch { /* ignora */ }
  }
  await admin.from("google_drive_connections").update({ status: "disconnected", refresh_token_ciphertext: null, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
}

export function extractDriveId(url: string) {
  const m = /\/d\/([a-zA-Z0-9_-]{15,})/.exec(url) ?? /[?&]id=([a-zA-Z0-9_-]{15,})/.exec(url);
  return m?.[1] ?? null;
}

/** Move para a lixeira do Drive um arquivo criado pela Wiize Recebe. */
export async function trashOnDrive(admin: Admin, tenantId: string, fileId: string) {
  const { token } = await accessToken(admin, tenantId);
  await gfetch(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  });
}
