import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { requestContractSigningCode } from "@/lib/contract-signing.functions";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { MailCheck } from "lucide-react";

export type EmailConfirmation = { challengeId: string; code: string };
export function EmailSigningConfirmation({ token, source, signerName, signerDocument, birthDate, signature, onChange, disabled }: { token: string; source: "customer" | "extra" | "checkout"; signerName: string; signerDocument: string; birthDate: string; signature: unknown; onChange: (proof: EmailConfirmation | null) => void; disabled?: boolean }) {
  const { t } = useTranslation("ui");
  const send = useServerFn(requestContractSigningCode);
  const [challenge, setChallenge] = useState<{ challengeId: string; email: string } | null>(null);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const payload = JSON.stringify({ token, source, signerName, signerDocument, birthDate, signature });
  useEffect(() => { setChallenge(null); setCode(""); onChange(null); }, [payload]);
  useEffect(() => { if (!seconds) return; const timer = setTimeout(() => setSeconds((s) => s - 1), 1000); return () => clearTimeout(timer); }, [seconds]);
  return <section className="space-y-3 border-t border-border pt-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><MailCheck className="size-4 text-primary" />{t("Confirmação por e-mail")}</h3>
    {challenge ? <><p className="text-sm text-muted-foreground">{t("Código enviado para")} {challenge.email}</p><InputOTP aria-label={t("Código de confirmação")} maxLength={6} inputMode="numeric" pattern="[0-9]*" value={code} onChange={(value) => { setCode(value); onChange(value.length === 6 ? { challengeId: challenge.challengeId, code: value } : null); }}><InputOTPGroup>{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="h-11 w-10" />)}</InputOTPGroup></InputOTP></> : null}
    <Button type="button" variant="outline" className="w-full" disabled={busy || seconds > 0 || disabled || !signature || !birthDate || !signerName || !signerDocument} onClick={async () => {
      setBusy(true); setError(""); onChange(null); setCode("");
      try { const r = await send({ data: { token, source, signerName, signerDocument, birthDate, signature } }); setChallenge(r); setSeconds(r.resendAfter); }
      catch (e) { setError(e instanceof Error ? e.message : t("Não foi possível enviar o código.")); }
      finally { setBusy(false); }
    }}>{seconds ? `${t("Reenviar em")} ${seconds}s` : busy ? t("Enviando código…") : challenge ? t("Reenviar código") : t("Enviar código por e-mail")}</Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}