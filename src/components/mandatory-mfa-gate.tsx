import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Check, Copy, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
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
  const [copied, setCopied] = useState(false);

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
      <main className="flex flex-1 items-center justify-center px-5 pb-8">
        <div className={`surface-panel w-full space-y-5 p-6 sm:p-8 ${backup ? "max-w-md" : "max-w-4xl"}`}>
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
          ) : enrollment ? (
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{ui("A verificação em duas etapas é obrigatória para usar a WiizePay.")}</p>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4 text-primary" />{ui("Por que ativar?")}</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{ui("Mesmo que alguém descubra sua senha, não conseguirá entrar sem o seu celular.")}</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{ui("Protege seu saldo, saques e os dados dos seus clientes.")}</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{ui("Segue o padrão de segurança exigido por instituições financeiras.")}</li>
                  </ul>
                </div>
                <ol className="space-y-4">
                  <Step n={1} title={ui("Instale um aplicativo autenticador")}>
                    <p>{ui("Use o Google Authenticator, Microsoft Authenticator ou outro de sua preferência. Eles são gratuitos na loja do seu celular.")}</p>
                  </Step>
                  <Step n={2} title={ui("Leia o QR Code com o aplicativo")}>
                    <p>{ui("No aplicativo, toque em adicionar conta e aponte a câmera para o código abaixo.")}</p>
                  </Step>
                  <Step n={3} title={ui("Digite o código de 6 dígitos")}>
                    <p>{ui("Informe o número que aparece no aplicativo. Ele muda a cada 30 segundos.")}</p>
                  </Step>
                </ol>
              </div>
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/40 p-5">
                <img
                  src={enrollment.qr.startsWith("data:") ? enrollment.qr : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qr)}`}
                  alt={ui("QR Code para o aplicativo autenticador")}
                  className="h-40 w-40 rounded-xl border border-border bg-white p-2 shadow-sm"
                />
                <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                  <span className="flex-1 select-all break-all font-mono text-xs text-foreground">{enrollment.secret}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(enrollment.secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? ui("Copiado!") : ui("Copiar")}
                  </Button>
                </div>
                <form onSubmit={confirm} className="w-full space-y-3">
                  <p className="text-center text-sm font-medium">{ui("Código de 6 dígitos")}</p>
                  <div className="flex justify-center">
                    <InputOTP id="mfa-setup-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} autoFocus inputMode="numeric" autoComplete="one-time-code" aria-label={ui("Código de 6 dígitos")}>
                      <InputOTPGroup className="gap-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-11 rounded-lg border bg-background text-lg font-semibold first:rounded-lg last:rounded-lg" />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button className="w-full" disabled={busy || code.length !== 6}>{busy ? <Loader2 className="animate-spin" /> : null}{ui("Confirmar e ativar")}</Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={ui("Carregando...")} /></div>
          )}
        </div>
      </main>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </li>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="internal-app flex min-h-dvh items-center justify-center bg-background p-5">{children}</div>;
}
