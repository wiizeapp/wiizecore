import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ShieldCheck, LockKeyhole } from "lucide-react";
import { beginAdminUnlock, completeAdminUnlock, touchAdminPage, closeAdminPage } from "@/lib/admin-session.functions";
import { setAdminProof } from "@/lib/admin-unlock-state";
import { ADMIN_IDLE_MS } from "@/lib/admin-session-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminUnlockGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("ui");
  const begin = useServerFn(beginAdminUnlock), complete = useServerFn(completeAdminUnlock), touch = useServerFn(touchAdminPage), close = useServerFn(closeAdminPage);
  const qc = useQueryClient();
  const [unlocked, setUnlocked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [code, setCode] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; hasPassword: boolean } | null>(null);
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(Date.now()), expires = useRef(0), lastTouch = useRef(0);
  const lock = () => {
    setAdminProof(null); setUnlocked(false); setChallenge(null); setCode(""); setPassword(""); setConfirmation("");
    void qc.cancelQueries(); qc.clear();
  };
  useEffect(() => {
    const clear = () => { setAdminProof(null); void qc.cancelQueries(); qc.clear(); setUnlocked(false); setChallenge(null); };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    return () => { void close().catch(() => {}); clear(); window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", clear); };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    const activity = () => {
      const now = Date.now();
      if (now - lastActivity.current >= ADMIN_IDLE_MS || now >= expires.current) { lock(); return; }
      lastActivity.current = now; setWarning(false);
      if (now - lastTouch.current > 15000) { lastTouch.current = now; void touch().catch(lock); }
    };
    const check = setInterval(() => {
      const now = Date.now(), remaining = ADMIN_IDLE_MS - (now - lastActivity.current);
      if (remaining <= 0 || now >= expires.current) lock();
      else setWarning(remaining < 60000 || expires.current - now < 60000);
    }, 1000);
    window.addEventListener("pointerdown", activity); window.addEventListener("keydown", activity); window.addEventListener("scroll", activity);
    return () => { clearInterval(check); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); window.removeEventListener("scroll", activity); };
  }, [unlocked]);
  if (unlocked) return <>{warning ? <p role="status" className="mb-4 border border-border bg-muted p-3 text-sm">{t("O acesso ao Admin será bloqueado em breve.")}</p> : null}<div className="mb-4 flex justify-end"><Button variant="outline" size="sm" onClick={() => { void close().catch(() => {}); lock(); }}><LockKeyhole className="mr-2 size-4" />{t("Bloquear Admin")}</Button></div>{children}</>;
  return <section className="mx-auto max-w-md py-12">
    <ShieldCheck className="mb-5 size-9 text-primary" />
    <h1 className="text-2xl font-semibold">{t("Acesso protegido ao Admin")}</h1>
    <form className="mt-6 space-y-5" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        if (!challenge) { setChallenge(await begin()); return; }
        if (!challenge.hasPassword && password !== confirmation) throw new Error(t("As senhas não coincidem."));
        const result = await complete({ data: { challengeId: challenge.challengeId, code, password, createPassword: !challenge.hasPassword } });
        setAdminProof(result.proof); expires.current = Date.parse(result.expiresAt); lastActivity.current = Date.now(); lastTouch.current = Date.now();
        setCode(""); setPassword(""); setConfirmation(""); setUnlocked(true);
      } catch (err) { setError(err instanceof Error ? t(err.message) : t("Não foi possível confirmar sua segurança agora.")); setChallenge(null); setCode(""); setPassword(""); setConfirmation(""); }
      finally { setBusy(false); }
    }}>
      {challenge ? <>
        <div className="space-y-2"><Label htmlFor="admin-code">{t("Código do autenticador")}</Label><Input id="admin-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6} inputMode="numeric" autoComplete="off" required /></div>
        <div className="space-y-2"><Label htmlFor="admin-password">{t(challenge.hasPassword ? "Sua senha financeira" : "Cadastre sua senha financeira")}</Label><Input id="admin-password" type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} maxLength={256} required /></div>
        {!challenge.hasPassword ? <div className="space-y-2"><Label htmlFor="admin-confirm">{t("Confirme a senha financeira")}</Label><Input id="admin-confirm" type="password" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></div> : null}
      </> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" disabled={busy}><LockKeyhole className="mr-2 size-4" />{t(busy ? "Confirmando…" : challenge ? "Liberar Admin" : "Iniciar confirmação")}</Button>
    </form>
  </section>;
}