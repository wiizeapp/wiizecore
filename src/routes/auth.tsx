import { hasConsentDecision } from "@/lib/consent";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { passwordProblems } from "@/lib/password-policy";
import { PasswordChecklist } from "@/components/password-checklist";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brand } from "@/components/brand";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { startWiizeLogin } from "@/lib/wiize-integration.functions";
import { recoverWithCode } from "@/lib/mfa-recovery.functions";
import { applyOAuthUiTheme, themeFromOAuthReturnPath } from "@/lib/oauth-ui-theme";
import { readTheme } from "@/lib/theme";
import wiizeLogo from "@/assets/ecosystem-wiize.png.asset.json";

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.5 14Z"/><path fill="#EA4335" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z"/></svg>;
}

type Search = { modo?: "entrar" | "criar"; next?: string | undefined };

/** Aceita só caminhos internos da tela de autorização. */
const safeNext = (v: unknown) => (typeof v === "string" && v.startsWith("/oauth/authorize?") && !v.startsWith("//") && v.length < 2000 ? v : undefined);

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    modo: search["modo"] === "criar" ? "criar" : "entrar",
    next: safeNext(search["next"]),
  }),
  head: () => ({
    meta: [
      { title: "Entrar na WiizePay" },
      { name: "description", content: "Acesse sua conta WiizePay para gerenciar cobranças, contratos e saldo." },
      { property: "og:title", content: "Entrar na WiizePay" },
      { property: "og:description", content: "Acesse sua conta WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t: ui } = useTranslation("ui");
  const { modo, next } = Route.useSearch();
  const oauthTheme = themeFromOAuthReturnPath(next);
  useLayoutEffect(() => { if (next) applyOAuthUiTheme(oauthTheme); }, [next, oauthTheme]);
  useEffect(() => { if (next) sessionStorage.setItem("wp_next", next); }, [next]);
  const navigate = useNavigate();
  const goAfter = () => { const n = next ?? (typeof window !== "undefined" ? safeNext(sessionStorage.getItem("wp_next")) : undefined); if (n) { sessionStorage.removeItem("wp_next"); window.location.assign(n); } else navigate({ to: "/painel" }); };
  const { session, loading } = useAuth();
  const [busyAction, setBusyAction] = useState<"signin" | "signup" | "google" | "wiize" | null>(null);
  const busy = busyAction !== null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [mfaFactor, setMfaFactor] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBackup, setMfaBackup] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const recover = useServerFn(recoverWithCode);

  useEffect(() => {
    if (loading || !session) return;
    let alive = true;
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!alive) return;
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data } = await supabase.auth.mfa.listFactors();
        const f = data?.totp?.find((x) => x.status === "verified");
        if (f) { setBusyAction(null); setMfaFactor(f.id); return; }
      }
      goAfter();
    })();
    return () => { alive = false; };
  }, [loading, session, navigate]);

  async function handleMfa(event: React.FormEvent) {
    event.preventDefault();
    if (!mfaFactor) return;
    setMfaBusy(true);
    try {
      if (mfaBackup) {
        await recover({ data: { code: mfaCode.trim() } });
        toast.success(ui("Código reserva aceito. Cadastre o autenticador novamente em Segurança."));
        goAfter();
      } else {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactor, code: mfaCode.trim() });
        if (error) throw new Error(ui("Código inválido. Tente novamente."));
        goAfter();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ui("Código inválido. Tente novamente."));
    } finally { setMfaBusy(false); }
  }

  async function cancelMfa() {
    await supabase.auth.signOut();
    setMfaFactor(null); setMfaCode(""); setMfaBackup(false);
  }

  function needConsent() {
    if (hasConsentDecision()) return false;
    toast.error(ui("Para entrar, aceite ou escolha suas preferências de cookies no aviso abaixo."));
    window.dispatchEvent(new Event("wiize:open-cookie-settings"));
    return true;
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (needConsent()) return;
    setBusyAction("signin");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusyAction(null);
      toast.error(
        error.message.includes("Invalid login")
          ? ui("E-mail ou senha incorretos.")
          : ui("Não foi possível entrar. Tente novamente."),
      );
      return;
    }
    // O redirecionamento acontece uma única vez, quando a sessão chega.
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    if (needConsent()) return;
    const problems = passwordProblems(password);
    if (problems.length) {
      toast.error(ui("Sua senha precisa ter: {{problems}}.", { problems: problems.map((problem) => ui(problem).toLowerCase()).join(", ") }));
      return;
    }
    setBusyAction("signup");
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`,
        data: { full_name: fullName.trim() },
      },
    });
    setBusyAction(null);
    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? ui("Este e-mail já tem conta. Faça login.")
          : ui("Não foi possível criar a conta."),
      );
      return;
    }
    toast.success(ui("Conta criada! Confirme o e-mail que enviamos para continuar."));
  }

  const wiizeLogin = useServerFn(startWiizeLogin);
  async function handleWiize() {
    if (needConsent()) return;
    setBusyAction("wiize");
    try { const { url } = await wiizeLogin(); window.location.href = url; }
    catch (e) { setBusyAction(null); toast.error(e instanceof Error ? e.message : ui("wiize.connect_error")); }
  }
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("wiize");
    if (p === "sem-conta") toast.error(ui("wiize.no_account"));
    else if (p === "erro") toast.error(ui("wiize.connect_error"));
  }, [ui]);

  async function handleGoogle() {
    if (needConsent()) return;
    setBusyAction("google");
    const returnToAuth = next ? `/auth?next=${encodeURIComponent(next)}` : "/auth";
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}${returnToAuth}` });
    if (result.error) {
      setBusyAction(null);
      toast.error(ui("Não foi possível entrar com o Google."));
      return;
    }
    if (result.redirected) return;
    goAfter();
  }

  async function handleReset() {
    if (!email.trim()) {
      toast.error(ui("Informe seu e-mail para receber o link."));
      return;
    }
    const theme = readTheme();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password?theme=${theme}`,
    });
    if (error) {
      toast.error(ui("Não foi possível enviar o link agora."));
      return;
    }
    toast.success(ui("Enviamos um link para redefinir sua senha."));
  }

  return (
    <main className="relative flex h-dvh w-full items-start justify-center overflow-x-hidden overflow-y-scroll bg-background px-3 py-6 [scrollbar-gutter:stable] sm:items-center sm:px-8 sm:py-10">
      <div className="brand-glow pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-70" />
      <Button asChild variant="ghost" size="sm" className="absolute left-3 top-3 z-10 sm:left-7 sm:top-7"><Link to="/"><ArrowLeft className="h-4 w-4" />{ui("Voltar ao início")}</Link></Button>
      <div className="surface-panel relative w-full max-w-full min-w-0 rounded-2xl p-5 shadow-float sm:max-w-md sm:p-9">
        <header className="mb-5 flex flex-col items-center text-center sm:mb-8">
          <Link to="/" aria-label={ui("Ir para a página inicial")}><Brand /></Link>
          <h1 className="mt-4 text-xl font-semibold leading-snug sm:mt-6 sm:text-2xl">{ui("Bem-vindo à WiizePay")}</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{ui("Entre na sua conta ou crie seu acesso para continuar.")}</p>
        </header>

        {mfaFactor ? (
          <form onSubmit={handleMfa} className="space-y-4">
            <div className="text-center">
              <p className="font-medium">{ui("Verificação em duas etapas")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {mfaBackup ? ui("Digite seu código reserva.") : ui("Digite o código de 6 dígitos do seu aplicativo autenticador.")}
              </p>
            </div>
            <Input className="h-11 text-center tracking-widest" autoFocus autoComplete="one-time-code"
              inputMode={mfaBackup ? "text" : "numeric"} maxLength={mfaBackup ? 20 : 6}
              placeholder={mfaBackup ? "XXXXX-XXXXX" : "000000"} required value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.toUpperCase())} />
            <Button type="submit" className="h-11 w-full" disabled={mfaBusy}>
              {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Confirmar")}
            </Button>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setMfaBackup((v) => !v); setMfaCode(""); }}>
                {mfaBackup ? ui("Usar código do autenticador") : ui("Usar código reserva")}
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={cancelMfa}>{ui("Cancelar")}</button>
            </div>
          </form>
        ) : (
        <div>
          <Tabs defaultValue={modo === "criar" ? "criar" : "entrar"}>
            <TabsList className="grid w-full grid-cols-2">
               <TabsTrigger value="entrar">{ui("Entrar")}</TabsTrigger>
               <TabsTrigger value="criar">{ui("Criar conta")}</TabsTrigger>
            </TabsList>

            <TabsContent value="entrar" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{ui("E-mail")}</Label>
                  <Input className="h-11" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                   <Label htmlFor="password">{ui("Senha")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-12"
                    />
                     <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 w-11" onClick={() => setShowPassword((value) => !value)} aria-label={ui(showPassword ? "Ocultar senha" : "Mostrar senha")}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                   {busyAction === "signin" ? <><Loader2 className="animate-spin" />{ui("Entrando...")}</> : ui("Entrar")}
                </Button>
                <Button type="button" onClick={handleReset} variant="link" size="sm" className="w-full text-xs text-muted-foreground">
                   {ui("Esqueci minha senha")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="criar" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{ui("Seu nome")}</Label>
                  <Input className="h-11" id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-new">{ui("E-mail")}</Label>
                  <Input
                    id="email-new"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                 <div className="space-y-2">
                   <Label htmlFor="password-new">{ui("Senha")}</Label>
                  <div className="relative">
                    <Input
                      id="password-new"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-12"
                    />
                     <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 w-11" onClick={() => setShowPassword((value) => !value)} aria-label={ui(showPassword ? "Ocultar senha" : "Mostrar senha")}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                  <PasswordChecklist value={password} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                   {busyAction === "signup" ? <><Loader2 className="animate-spin" />{ui("Criando conta...")}</> : ui("Criar conta")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
             {ui("ou")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full gap-3" onClick={handleGoogle} disabled={busy}>
             {busyAction === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}{ui(busyAction === "google" ? "Conectando..." : "Continuar com Google")}
          </Button>
          <Button variant="outline" className="mt-2 w-full gap-3" onClick={handleWiize} disabled={busy}>{busyAction === "wiize" ? <Loader2 className="animate-spin" /> : <img src={wiizeLogo.url} alt="" className="size-5 rounded" />}{ui(busyAction === "wiize" ? "Conectando..." : "wiize.continue")}</Button>
        </div>
        )}
         <p className="mt-6 border-t border-border pt-6 text-center text-xs leading-5 text-muted-foreground">{ui("Ao continuar, você declara ciência dos")} <Link to="/termos-de-uso" className="font-medium text-primary hover:underline">{ui("Termos de Uso")}</Link> {ui("e da")} <Link to="/politica-de-privacidade" className="font-medium text-primary hover:underline">{ui("Política de Privacidade")}</Link>.</p>
      </div>
    </main>
  );
}
