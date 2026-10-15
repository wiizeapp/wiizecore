import { createFileRoute } from "@tanstack/react-router";

function page(ok: boolean, msg: string) {
  const safe = msg.replace(/[<>&"]/g, "");
  return new Response(`<!doctype html><meta charset="utf-8"><title>Google Drive · Wiize Core</title><body style="font-family:system-ui;background:#0b0f0d;color:#e8f0ec;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><p style="font-size:18px">${safe}</p><p style="opacity:.6;font-size:13px">Você pode fechar esta janela.</p></div><script>try{window.opener&&window.opener.postMessage({type:"wiizepay-drive",ok:${ok}},location.origin)}catch(e){}setTimeout(function(){window.close()},1200)</script></body>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Retorno do Google após a empresa autorizar o Drive. A empresa vem do state criptografado. */
export const Route = createFileRoute("/api/public/google-drive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const d = await import("@/lib/google-drive.server");
        const st = d.readState(url.searchParams.get("state") ?? "");
        if (!st) return page(false, "Pedido expirado. Tente conectar de novo.");
        if (url.searchParams.get("error") || !url.searchParams.get("code")) return page(false, "Conexão cancelada.");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: mem } = await supabaseAdmin.from("tenant_members").select("role").eq("tenant_id", st.t).eq("user_id", st.u).eq("status", "active").maybeSingle();
          if (!mem || !["owner", "admin"].includes(mem.role)) return page(false, "Sem permissão para conectar.");
          const t = await d.exchangeCode(url.searchParams.get("code")!, st.o);
          if (!t.refreshToken) return page(false, "O Google não liberou acesso contínuo. Tente de novo.");
          const { encryptSecret } = await import("@/lib/crypto.server");
          const { error } = await supabaseAdmin.from("google_drive_connections").upsert({
            tenant_id: st.t, status: "active", google_email: t.email, refresh_token_ciphertext: encryptSecret(t.refreshToken),
            connected_by: st.u, updated_at: new Date().toISOString(),
          }, { onConflict: "tenant_id" });
          if (error) throw error;
          const { logAudit } = await import("@/lib/audit.server");
          await logAudit(supabaseAdmin, { tenantId: st.t, userId: st.u, action: "google_drive.connected", resource: "google_drive_connections", resourceId: st.t, metadata: { email: t.email } });
          return page(true, "Google Drive conectado!");
        } catch (e) {
          console.error("drive callback", e instanceof Error ? e.message : e);
          return page(false, "Não foi possível conectar o Google Drive.");
        }
      },
    },
  },
});
