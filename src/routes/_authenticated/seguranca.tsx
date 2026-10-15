import { useTranslation } from "react-i18next";
import { WithdrawalTwoFactorCard } from "@/components/withdrawal-2fa-card";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { assertStrongPassword } from "@/lib/password-policy";
import { PasswordChecklist } from "@/components/password-checklist";
import { useState } from "react";
import { MfaRecoveryCard } from "@/components/mfa-recovery-card";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/ds";
import {
  generateRecoveryCodes,
  getSecurityStatus,
  recordMfaChange,
  setFinancialPassword,
} from "@/lib/security.functions";
import { listAuditLogs } from "@/lib/contracts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { disableMfaWithRecoveryCode } from "@/lib/mfa-recovery.functions";

export const Route = createFileRoute("/_authenticated/seguranca")({
  head: () => ({
    meta: [
      { title: "Segurança — Wiize Core" },
      { name: "description", content: "Gerencie 2FA, senha financeira e auditoria da conta Wiize Core." },
      { property: "og:title", content: "Segurança — Wiize Core" },
      { property: "og:description", content: "Gerencie 2FA, senha financeira e auditoria da conta Wiize Core." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Seguranca,
});

function Seguranca() {
  const { t: ui } = useTranslation("ui");
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getSecurityStatus);
  const savePassword = useServerFn(setFinancialPassword);
  const makeCodes = useServerFn(generateRecoveryCodes);
  const logMfa = useServerFn(recordMfaChange);
  const disableWithRecoveryCode = useServerFn(disableMfaWithRecoveryCode);
  const fetchLogs = useServerFn(listAuditLogs);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [disableMode, setDisableMode] = useState<"totp" | "recovery">("totp");
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  const { data: status } = useQuery({ queryKey: ["security-status"], queryFn: () => fetchStatus({}) });
  const { data: logs } = useQuery({ queryKey: ["audit-logs"], queryFn: () => fetchLogs({}) });
  const { data: factors, refetch: refetchFactors } = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data.totp ?? [];
    },
  });

  const verifiedFactor = factors?.find((factor) => factor.status === "verified") ?? null;

  const passwordMutation = useMutation({
    mutationFn: async () => {
      assertStrongPassword(newPassword, "A senha financeira");
      if (newPassword !== confirmPassword) throw new Error("As senhas não coincidem.");
      return savePassword({
        data: currentPassword ? { newPassword, currentPassword } : { newPassword },
      });
    },
    onSuccess: () => {
      toast.success("Senha financeira salva.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      void queryClient.invalidateQueries({ queryKey: ["security-status"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function startEnrollment() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) {
      toast.error("Não foi possível iniciar a verificação em duas etapas.");
      return;
    }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnrollment(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment) return;
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (challenge.error) {
      toast.error("Não foi possível validar o código.");
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: challenge.data.id,
      code: totpCode.trim(),
    });
    if (verify.error) {
      toast.error("Código inválido. Tente novamente.");
      return;
    }
    setEnrollment(null);
    setTotpCode("");
    toast.success("Verificação em duas etapas ativada.");
    try {
      await supabase.auth.refreshSession();
      await logMfa({ data: { enabled: true } }).catch(() => null);
      const result = await makeCodes({});
      setCodes(result.codes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o código reserva.");
    } finally {
      void refetchFactors();
      void queryClient.invalidateQueries({ queryKey: ["security-status"] });
    }
  }

  async function removeFactor(factorId: string) {
    setDisabling(true);
    try {
      if (disableMode === "recovery") {
        await disableWithRecoveryCode({ data: { code: disableCode } });
      } else {
        if (!/^\d{6}$/.test(disableCode)) throw new Error("Informe o código de 6 dígitos do autenticador.");
        const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code: disableCode });
        if (verified.error) throw new Error("Código do autenticador inválido.");
        const removed = await supabase.auth.mfa.unenroll({ factorId });
        if (removed.error) throw new Error("Não foi possível desativar agora.");
        await logMfa({ data: { enabled: false } });
      }
      setCodes(null);
      setDisableCode("");
      setShowDisable(false);
      toast.success("Verificação em duas etapas desativada.");
      await refetchFactors();
      void queryClient.invalidateQueries({ queryKey: ["security-status"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desativar agora.");
    } finally {
      setDisabling(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Segurança")} description="Verificação em duas etapas, senha financeira e auditoria." />
      {verifiedFactor ? <MfaRecoveryCard /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold tracking-tight">Verificação em duas etapas</h2>
            {verifiedFactor ? (
              <StatusBadge tone="success"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Ativa</StatusBadge>
            ) : (
              <StatusBadge tone="warning"><ShieldAlert className="mr-1 h-3.5 w-3.5" />Inativa</StatusBadge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Opcional. Quando ativa, é pedida em todo login e também pode ser exigida nos saques (opção abaixo).
          </p>

          {verifiedFactor ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm">
                Códigos de recuperação disponíveis:{" "}
                <span className="font-medium">{status?.recoveryCodesAvailable ?? 0}</span>
              </p>
              <p className="text-xs text-muted-foreground">O código reserva foi exibido somente na ativação e não pode ser mostrado ou gerado novamente.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowDisable((value) => !value)}>
                  Desativar
                </Button>
              </div>
              {showDisable ? (
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-medium">Confirme antes de desativar</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={disableMode === "totp" ? "default" : "outline"} onClick={() => { setDisableMode("totp"); setDisableCode(""); }}>Código do autenticador</Button>
                    <Button type="button" size="sm" variant={disableMode === "recovery" ? "default" : "outline"} onClick={() => { setDisableMode("recovery"); setDisableCode(""); }}>Código reserva</Button>
                  </div>
                  <Input
                    inputMode={disableMode === "totp" ? "numeric" : "text"}
                    maxLength={disableMode === "totp" ? 6 : 11}
                    autoComplete="one-time-code"
                    placeholder={disableMode === "totp" ? "000000" : "XXXXX-XXXXX"}
                    value={disableCode}
                    onChange={(event) => setDisableCode(event.target.value.toUpperCase())}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="destructive" size="sm" disabled={disabling} onClick={() => removeFactor(verifiedFactor.id)}>{disabling ? "Desativando..." : "Confirmar desativação"}</Button>
                    <Button type="button" variant="ghost" size="sm" disabled={disabling} onClick={() => { setShowDisable(false); setDisableCode(""); }}>Cancelar</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : enrollment ? (
            <form className="mt-5 space-y-4" onSubmit={confirmEnrollment}>
              <div className="w-fit rounded-lg bg-card p-3 ring-1 ring-border" style={{ background: "white" }}>
                <img
                  src={enrollment.qr.startsWith("data:") ? enrollment.qr : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qr)}`}
                  alt="QR code para o aplicativo autenticador"
                  className="h-52 w-52"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
              <p className="break-all text-xs text-muted-foreground">
                Ou digite a chave no aplicativo: <span className="font-medium">{enrollment.secret}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="totp">Código de 6 dígitos</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Confirmar</Button>
                <Button type="button" variant="ghost" onClick={() => setEnrollment(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button className="mt-5" onClick={startEnrollment}>
              Ativar agora
            </Button>
          )}

          {codes ? (
            <div className="mt-5 rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Guarde este código reserva em local seguro</p>
              <p className="mt-1 text-xs text-muted-foreground">Ele será mostrado somente agora, funciona uma vez e não poderá ser gerado novamente.</p>
              <ul className="numeric-tabular mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="surface-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold tracking-tight">Senha financeira</h2>
            {status?.hasFinancialPassword ? <StatusBadge tone="success">Cadastrada</StatusBadge> : <StatusBadge tone="warning">Pendente</StatusBadge>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Independente da senha de login. Pedimos ela para assinar contratos e solicitar saques.
          </p>
          {status?.financialPasswordLockedUntil ? (
            <p className="mt-3 text-sm text-destructive">
              Bloqueada até {formatDateTime(status.financialPasswordLockedUntil)} por tentativas incorretas.
            </p>
          ) : null}

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              passwordMutation.mutate();
            }}
          >
            {status?.hasFinancialPassword ? (
              <div className="space-y-2">
                <Label htmlFor="current">Senha financeira atual</Label>
                <Input
                  id="current"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="new">Nova senha financeira</Label>
              <Input
                id="new"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordChecklist value={newPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Repita a nova senha</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={passwordMutation.isPending}>
              {status?.hasFinancialPassword ? "Trocar senha financeira" : "Criar senha financeira"}
            </Button>
          </form>
        </section>
      </div>

      <WithdrawalTwoFactorCard />

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-base font-semibold tracking-tight">Histórico de auditoria</h2>
          <p className="text-sm text-muted-foreground">Últimas 50 ações registradas na sua empresa.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs && logs.length > 0 ? (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(log.created_at)}</TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>{log.resource ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={log.result === "success" ? "default" : "destructive"}>
                      {log.result === "success" ? "Sucesso" : "Falha"}
                    </Badge>
                  </TableCell>
                  <TableCell className="numeric-tabular text-sm text-muted-foreground">
                    {log.ip_address ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum registro ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
