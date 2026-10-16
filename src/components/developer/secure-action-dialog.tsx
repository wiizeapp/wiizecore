import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";

/**
 * Confirmação segura dentro da página (sem window.prompt/confirm, que o navegador pode bloquear).
 * Pede senha financeira (opcional) e o código de 2 etapas quando a pessoa tem 2FA ativo.
 */
export function SecureActionDialog({ open, onOpenChange, title, description, confirmLabel, destructive, needsPassword, children, canConfirm = true, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; confirmLabel: string;
  destructive?: boolean; needsPassword?: boolean; children?: ReactNode; canConfirm?: boolean;
  onConfirm: (v: { password: string }) => Promise<void>;
}) {
  const { t } = useTranslation("ui");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setPassword(""); setOtp(""); setError(null); return; }
    void getMfaState().then((s) => setNeedOtp(Boolean(s.factorId && !s.isAal2))).catch(() => setNeedOtp(false));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (needOtp) await ensureTwoFactor(otp);
      await onConfirm({ password });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Algo deu errado."));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {needsPassword && (
            <div className="space-y-1.5">
              <label htmlFor="sad-pass" className="text-sm font-medium">{t("Senha financeira")}</label>
              <Input id="sad-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} autoFocus />
            </div>
          )}
          {needOtp && (
            <div className="space-y-1.5">
              <label htmlFor="sad-otp" className="text-sm font-medium">{t("Código do app autenticador")}</label>
              <Input id="sad-otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            </div>
          )}
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("Cancelar")}</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy || !canConfirm || (needsPassword && !password) || (needOtp && otp.length !== 6)}>
              {busy ? t("Aguarde…") : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
