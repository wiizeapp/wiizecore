import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { generateRecoveryCodes, recordMfaChange } from "@/lib/security.functions";
import { recordAuthEvent } from "@/lib/auth-events.functions";

const MAX_FAILS = 5;

/**
 * Configuração obrigatória do 2FA. Sem botão de fechar ou pular: até confirmar o primeiro código,
 * o servidor recusa qualquer função protegida e o banco recusa qualquer leitura.
 */
export function MandatoryMfaGate({ children }: { children: ReactNode }) {
  const { t: ui } = useTranslation("ui");
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const logMfa = useServerFn(recordMfaChange);
  const makeCodes = useServerFn(generateRecoveryCodes);
  const authEvent = useServerFn(recordAuthEvent);
  const { data, isError, refetch } = useQuery({
    queryKey: ["mfa-gate"],
    queryFn: async () => {
      const { data: f, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return { verified: (f?.totp ?? []).some((x) => x.status === "verified") };
    },
    staleTime: 0,
  });
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [backup, setBackup] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [done, setDone] = useState(false);

  const needsSetup = data && !data.verified && !done;

  useEffect(() => {
    if (!needsSetup || enrollment) return;
    let alive = true;
    (async () => {
      // Remove cadastros não confirmados de tentativas anteriores antes de começar de novo.
      const { data: f } = await supabase.auth.mfa.listFactors();
      for (const x of f?.all ?? []) if (x.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: x.id }).catch(() => null);
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Wiize ${Date.now()}` });
      if (!alive) return;
      if (error || !e) { toast.error(ui("Não foi possível iniciar a verificação em duas etapas.")); return; }
      setEnrollment({ factorId: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
      void authEvent({ data: { kind: "mfa.setup_started" } }).catch(() => null);
    })();
    return () => { alive = false; };
  }, [needsSetup, enrollment]);

  if (!data && !isError) return <Centered><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label={ui("Carregando...")} /></Centered>;
  if (isError) return <Centered><div className="text-center"><p className="font-semibold">{ui("Não foi possível carregar")}</p><Button className="mt-4" onClick={() => void refetch()}>{ui("Tentar novamente")}</Button></div></Centered>;
  if (!needsSetup && !backup) return <>{children}</>;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment || busy) return;
    if (Date.now() < lockedUntil) { toast.error(ui("Muitas tentativas. Aguarde alguns minutos e tente novamente.")); return; }
    if (!/^\d{6}$/.test(code.trim())) { toast.error(ui("Informe o código de 6 dígitos do autenticador.")); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() });
      if (error) {
        const n = fails + 1;
        setFails(n);
        if (n >= MAX_FAILS) { setLockedUntil(Date.now() + 5 * 60000); setFails(0); }
        void authEvent({ data: { kind: "mfa.setup_failed" } }).catch(() => null);
        toast.error(ui("Código inválido. Tente novamente."));
        return;
      }
      await supabase.auth.refreshSession();
      await logMfa({ data: { enabled: true } }).catch(() => null);
      try {
        const r = await makeCodes({});
        setBackup(r.codes[0] ?? null);
      } catch {
        toast.error(ui("Não foi possível emitir o código reserva. Você pode pedir ajuda ao suporte."));
        finish();
      }
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  function finish() {
    setDone(true);
    setBackup(null);
    qc.setQueryData(["mfa-gate"], { verified: true });
    void qc.invalidateQueries();
  }

  return (
    <div className="internal-app fixed inset-0 z-[110] flex min-h-dvh flex-col overflow-y-auto bg-background text-foreground">
      <header className="flex items-center justify-between px-5 py-5 sm:px-10">
        <Brand className="shrink-0" />
        <div className="flex items-center gap-3 text-sm">
          <a href="/suporte" className="text-muted-foreground underline-offset-4 hover:underline">{ui("Precisa de ajuda?")}</a>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>{ui("Sair")}</Button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-14">
        <div className="surface-panel w-full max-w-md space-y-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
            <h1 className="font-display text-xl font-bold">{backup ? ui("Seu código reserva") : ui("Proteja sua conta")}</h1>
          </div>
          {backup ? (
            <>
              <p className="text-sm text-muted-foreground">{ui("Guarde este código em local seguro. Ele aparece só agora e serve uma única vez, caso você perca o celular.")}</p>
              <p className="select-all rounded-lg border border-border bg-muted px-4 py-3 text-center font-mono text-lg tracking-widest" aria-label={ui("Seu código reserva")}>{backup}</p>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={saved} onCheckedChange={(v) => setSaved(Boolean(v))} className="mt-0.5" />
                <span>{ui("Salvei meu código reserva em local seguro")}</span>
              </label>
              <Button className="w-full" disabled={!saved} onClick={() => { void authEvent({ data: { kind: "mfa.recovery_saved" } }).catch(() => null); finish(); }}>{ui("Continuar")}</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{ui("A verificação em duas etapas é obrigatória para usar a Wiize Core.")}</p>
              <ol className="space-y-1 text-sm">
                <li>{ui("1. Instale um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou similar).")}</li>
                <li>{ui("2. Leia o QR Code ou digite a chave abaixo.")}</li>
                <li>{ui("3. Digite o código de 6 dígitos que aparece no aplicativo.")}</li>
              </ol>
              {enrollment ? (
                <>
                  <img
                    src={enrollment.qr.startsWith("data:") ? enrollment.qr : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qr)}`}
                    alt={ui("QR Code para o aplicativo autenticador")}
                    className="mx-auto h-44 w-44 rounded-lg bg-card p-2"
                  />
                  <div className="text-xs text-muted-foreground">
                    {ui("Chave para digitar no aplicativo")}: <span className="select-all break-all font-mono text-foreground">{enrollment.secret}</span>
                  </div>
                  <form onSubmit={confirm} className="space-y-3">
                    <label className="block text-sm font-medium" htmlFor="mfa-setup-code">{ui("Código de 6 dígitos")}</label>
                    <Input id="mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
                    <Button className="w-full" disabled={busy || code.length !== 6}>{busy ? <Loader2 className="animate-spin" /> : null}{ui("Confirmar e ativar")}</Button>
                  </form>
                </>
              ) : (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={ui("Carregando...")} /></div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="internal-app flex min-h-dvh items-center justify-center bg-background p-5">{children}</div>;
}
