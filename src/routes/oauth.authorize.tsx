import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { decideAuthorize, getAuthorizeDetails } from "@/lib/wiize-pay-oauth.functions";
import { applyOAuthUiTheme, parseOAuthUiTheme } from "@/lib/oauth-ui-theme";

type P = Record<string, string | undefined>;
const KEYS = ["response_type", "client_id", "redirect_uri", "scope", "state", "code_challenge", "code_challenge_method"] as const;
const oauthParams = (search: P) => Object.fromEntries(KEYS.map((key) => [key, search[key]]));

export const Route = createFileRoute("/oauth/authorize")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): P => ({
    ...Object.fromEntries(KEYS.map((k) => [k, typeof s[k] === "string" ? String(s[k]).slice(0, 500) : undefined])),
    ui_theme: parseOAuthUiTheme(s["ui_theme"]),
  }),
  head: () => ({
    meta: [
      { title: "Autorizar conexão — WiizePay" },
      { name: "description", content: "Autorize um aplicativo a criar cobranças na sua conta WiizePay." },
      { property: "og:title", content: "Autorizar conexão — WiizePay" },
      { property: "og:description", content: "Tela segura de autorização da WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthorizePage,
  errorComponent: () => <Shell><p className="text-sm text-muted-foreground">Não foi possível carregar a autorização. Volte ao Wiize e tente novamente.</p></Shell>,
});

type Details = { error?: string | undefined; clientName?: string; redirectHost?: string; tenantName?: string; canApprove?: boolean; scopes?: string[] };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="surface-panel w-full max-w-md space-y-5 p-6">
        <Brand />
        {children}
      </div>
    </main>
  );
}

function AuthorizePage() {
  const search = Route.useSearch();
  useLayoutEffect(() => { applyOAuthUiTheme(parseOAuthUiTheme(search["ui_theme"])); }, [search["ui_theme"]]);
  const { session, loading, user } = useAuth();
  const get = useServerFn(getAuthorizeDetails);
  const decide = useServerFn(decideAuthorize);
  const [d, setD] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const next = `/oauth/authorize?${new URLSearchParams(Object.entries(search).filter(([, v]) => v) as [string, string][]).toString()}`;
      window.location.replace(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    get({ data: oauthParams(search) }).then(setD).catch(() => setD({ error: "Não foi possível validar o pedido." }));
  }, [loading, session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(approve: boolean) {
    setBusy(true);
    try {
      const r = await decide({ data: { ...oauthParams(search), approve } });
      if (r.redirect) window.location.assign(r.redirect);
      else { setD({ error: r.error }); setBusy(false); }
    } catch { setD({ error: "Não foi possível concluir. Tente novamente." }); setBusy(false); }
  }

  if (!d) return <Shell><div className="skeleton-shimmer h-40 rounded-lg" /></Shell>;
  if (d.error) return <Shell><h1 className="font-display text-lg font-semibold">Pedido inválido</h1><p className="text-sm text-muted-foreground">{d.error}</p></Shell>;
  return (
    <Shell>
      <div>
        <h1 className="font-display text-xl font-semibold">Conectar {d.clientName} à WiizePay</h1>
        <p className="mt-1 text-sm text-muted-foreground">Isso permite que {d.clientName} use a WiizePay em nome da empresa <b>{d.tenantName}</b>.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="text-xs uppercase text-muted-foreground">Conta</p>
        <p className="font-medium">{user?.email}</p>
        <button className="mt-1 text-xs text-primary underline" onClick={() => supabase.auth.signOut()}>Trocar de conta</button>
        <p className="mt-3 text-xs uppercase text-muted-foreground">Retorno para</p>
        <p className="font-medium">{d.redirectHost}</p>
      </div>
      <ul className="space-y-2 text-sm">
        {d.scopes?.map((sc) => <li key={sc} className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-primary" />{sc}</li>)}
      </ul>
      <p className="text-xs text-muted-foreground">Isso não ignora as permissões nem as regras de segurança da WiizePay. Você pode desconectar quando quiser.</p>
      {d.canApprove ? (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => act(true)}>Autorizar</Button>
          <Button className="flex-1" variant="outline" disabled={busy} onClick={() => act(false)}>Cancelar conexão</Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Apenas o dono ou um administrador da empresa pode autorizar esta conexão.</p>
          <Button variant="outline" disabled={busy} onClick={() => act(false)}>Cancelar conexão</Button>
        </>
      )}
    </Shell>
  );
}
