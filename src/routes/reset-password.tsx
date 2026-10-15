import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { passwordProblems } from "@/lib/password-policy";
import { PasswordChecklist } from "@/components/password-checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/brand";
import { useServerFn } from "@tanstack/react-start";
import { resetPasswordWithRecoveryCode } from "@/lib/mfa-recovery.functions";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Wiize Recebe" },
      { name: "description", content: "Crie uma nova senha para sua conta Wiize Recebe." },
      { property: "og:title", content: "Redefinir senha — Wiize Recebe" },
      { property: "og:description", content: "Crie uma nova senha para sua conta Wiize Recebe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [needsRecoveryCode, setNeedsRecoveryCode] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resetWithCode = useServerFn(resetPasswordWithRecoveryCode);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = query.get("error_code") ?? hash.get("error_code");
    if (errorCode || query.get("error") || hash.get("error")) {
      setLinkError(errorCode === "otp_expired" ? "Este link expirou ou já foi utilizado." : "Este link de recuperação não é válido.");
      return () => data.subscription.unsubscribe();
    }
    if (hash.get("type") === "recovery") setReady(true);
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session && (hash.get("type") === "recovery" || query.has("code"))) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordProblems(password).length) { toast.error("A senha não atende aos requisitos."); return; }
    if (password !== confirm) { toast.error("As senhas não conferem."); return; }
    setBusy(true);
    if (needsRecoveryCode) {
      try {
        await resetWithCode({ data: { code: recoveryCode, password } });
      } catch (error) {
        setBusy(false);
        toast.error(error instanceof Error ? error.message : "Não foi possível alterar a senha.");
        return;
      }
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      if (error?.code === "insufficient_aal" || error?.message.includes("AAL2")) {
        setNeedsRecoveryCode(true);
        setBusy(false);
        toast.error("Sua conta usa 2FA. Informe o código reserva único para confirmar a troca.");
        return;
      }
      if (error) {
        setBusy(false);
        toast.error("Não foi possível alterar a senha. Verifique se o link ainda é válido.");
        return;
      }
    }
    setBusy(false);
    await supabase.auth.signOut({ scope: "others" });
    toast.success("Senha alterada com sucesso.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="surface-panel w-full max-w-md rounded-2xl p-6 shadow-float sm:p-9">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <h1 className="mb-2 text-center text-xl font-semibold">Criar nova senha</h1>
        {linkError ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">{linkError}</p>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/auth" })}>Pedir um novo link</Button>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-muted-foreground">Validando seu link de recuperação...</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="np">Nova senha</Label><Input id="np" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <PasswordChecklist value={password} />
            <div className="space-y-2"><Label htmlFor="cp">Confirmar senha</Label><Input id="cp" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            {needsRecoveryCode ? (
              <div className="space-y-2">
                <Label htmlFor="recovery-code">Código reserva único</Label>
                <Input id="recovery-code" className="uppercase" autoComplete="one-time-code" placeholder="XXXXX-XXXXX" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} required />
                <p className="text-xs text-muted-foreground">O 2FA continuará ativo. Este código será invalidado após a troca.</p>
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Salvando..." : "Salvar nova senha"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
