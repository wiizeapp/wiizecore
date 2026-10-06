import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getWithdrawalSecurity, setWithdrawalSecurity } from "@/lib/withdrawal-security.functions";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";

/** Preferência opcional: pedir código 2FA, além da senha financeira, para sacar. */
export function WithdrawalTwoFactorCard() {
  const qc = useQueryClient();
  const fetchSec = useServerFn(getWithdrawalSecurity);
  const save = useServerFn(setWithdrawalSecurity);
  const { data: sec } = useQuery({ queryKey: ["withdrawal-security"], queryFn: () => fetchSec() });
  const { data: mfa } = useQuery({ queryKey: ["mfa-state-sec"], queryFn: getMfaState });
  const [pending, setPending] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const mut = useMutation({
    mutationFn: async (required: boolean) => {
      await ensureTwoFactor(code, true);
      return save({ data: { required, financialPassword: password } });
    },
    onSuccess: (r) => {
      toast.success(r.required ? "Saques agora pedem o código 2FA." : "Saques voltam a pedir só a senha financeira.");
      setPending(null);
      setPassword("");
      setCode("");
      void qc.invalidateQueries({ queryKey: ["withdrawal-security"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enabled = sec?.required === true;
  const hasFactor = Boolean(mfa?.factorId);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span>
          <div>
            <h2 className="font-semibold">Código 2FA para saques</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Opcional. Quando ligado, todo saque pede a senha financeira e o código do autenticador.
            </p>
            {!hasFactor && mfa ? <p className="mt-2 text-xs text-muted-foreground">Ative a verificação em duas etapas abaixo para poder ligar esta opção.</p> : null}
          </div>
        </div>
        <Switch
          checked={pending ?? enabled}
          disabled={!sec || !hasFactor || mut.isPending}
          onCheckedChange={(v) => setPending(v === enabled ? null : v)}
          aria-label="Exigir código 2FA para saques"
        />
      </div>
      {pending !== null ? (
        <form
          className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate(pending);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="w2fa-pass">Senha financeira</Label>
            <Input id="w2fa-pass" type="password" autoComplete="off" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w2fa-code">Código do autenticador</Label>
            <Input id="w2fa-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder={mfa?.isAal2 ? "Já confirmado" : "000000"} required={!mfa?.isAal2} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setPending(null)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Salvando…" : pending ? "Ligar" : "Desligar"}</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
