import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader, SummaryStrip } from "@/components/ds";
import { addBankAccount, cancelWithdrawal, requestWithdrawal, syncBalances } from "@/lib/finance.functions";
import { getWithdrawalSecurity } from "@/lib/withdrawal-security.functions";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDate } from "@/lib/format";
import { mergeFeeRows } from "@/lib/tx-display";
import { summarize, type SummaryRow } from "@/lib/financial-summary";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — WiizePay" },
      { name: "description", content: "Veja saldos, extrato, liberações e solicite saques na WiizePay." },
      { property: "og:title", content: "Financeiro — WiizePay" },
      { property: "og:description", content: "Veja saldos, extrato, liberações e solicite saques na WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Financeiro,
});

const kindLabels: Record<string, string> = {
  payment: "Recebimento",
  platform_fee: "Taxa WiizePay",
  provider_fee: "Taxa do provedor",
  refund: "Estorno",
  withdrawal: "Saque",
  adjustment: "Ajuste",
};
const withdrawalLabels: Record<string, string> = {
  requested: "Solicitado",
  in_analysis: "Em análise",
  processing: "Processando",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

function newKey() {
  return crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
}

function Financeiro() {
  const { t: ui } = useTranslation("ui");
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const qc = useQueryClient();
  const sync = useServerFn(syncBalances);

  useEffect(() => {
    if (!tenantId) return;
    void sync({}).then((r) => {
      if (r.checked > 0) void qc.invalidateQueries();
    });
  }, [tenantId, sync, qc]);

  const enabled = Boolean(tenantId);
  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet", tenantId],
    enabled,
    queryFn: async () => (await supabase.from("wallets").select("*").eq("tenant_id", tenantId!).maybeSingle()).data,
  });
  const { data: settings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("key, value");
      return Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
    },
  });
  const { data: transactions } = useQuery({
    queryKey: ["transactions", tenantId],
    enabled,
    queryFn: async () =>
      (
        await supabase
          .from("transactions")
          .select("id, kind, description, amount, occurred_at, payment_id")
          .eq("tenant_id", tenantId!)
          .order("occurred_at", { ascending: false })
          .limit(200)
      ).data ?? [],
  });
  const paymentsSummary = useQuery({
    queryKey: ["financial-summary", tenantId],
    enabled,
    queryFn: async () => {
      const rows: SummaryRow[] = [];
      for (let page = 0; page < 400; page += 1) {
        const { data, error } = await supabase
          .from("payments")
          .select("status, gross_amount, net_amount, platform_fee_amount, refunded_amount, due_on")
          .eq("tenant_id", tenantId!)
          .range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as SummaryRow[]));
        if (!data || data.length < 1000) break;
      }
      return summarize(rows);
    },
  });
  const { data: releases } = useQuery({
    queryKey: ["releases", tenantId],
    enabled,
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select("id, description, net_amount, estimated_available_at, settlement_status")
          .eq("tenant_id", tenantId!)
          .eq("status", "paid")
          .is("released_at", null)
          .order("estimated_available_at")
      ).data ?? [],
  });
  const { data: banks } = useQuery({
    queryKey: ["banks", tenantId],
    enabled,
    queryFn: async () =>
      (await supabase.from("bank_accounts").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: withdrawals } = useQuery({
    queryKey: ["withdrawals", tenantId],
    enabled,
    queryFn: async () =>
      (await supabase.from("withdrawals").select("*").eq("tenant_id", tenantId!).order("requested_at", { ascending: false })).data ?? [],
  });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const cancel = useServerFn(cancelWithdrawal);
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { withdrawalId: id } }),
    onSuccess: () => {
      toast.success("Saque cancelado e valor devolvido ao saldo.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const minimum = settings?.['minimum_withdrawal_amount'] ?? 50;
  const fee = settings?.['withdrawal_fee_amount'] ?? 0;
  const hold = settings?.['withdrawal_hold_days'] ?? 32;

  return (
    <div>
      <PageHeader
        title={ui("Financeiro")}
        description={`Valores confirmados ficam disponíveis para saque ${hold} dias após o pagamento.`}
        action={
          <Button onClick={() => {
            if (!banks?.length) { toast.info("Cadastre uma conta bancária para receber seus saques."); setBankOpen(true); return; }
            if (banks[0]?.verification_status !== "verified") { toast.info("Sua conta bancária será liberada para saque assim que o cadastro WiizePay for aprovado."); return; }
            setWithdrawOpen(true);
          }}>
            {banks?.length ? "Solicitar saque" : "Cadastrar conta para saque"}
          </Button>
        }
      />

      <SummaryStrip items={[
        { label: "Disponível para saque", value: walletLoading ? null : formatBRL(wallet?.available_balance), accent: true },
        { label: "A liberar", value: walletLoading ? null : formatBRL(wallet?.pending_balance) },
        { label: "Em saque", value: walletLoading ? null : formatBRL(wallet?.blocked_balance) },
        { label: "Total sacado", value: walletLoading ? null : formatBRL(wallet?.total_withdrawn) },
      ]} />

      <h2 className="mb-3 font-display text-base font-semibold">Cobranças e recebimentos</h2>
      <SummaryStrip cols={5} items={[
        { label: ui("Faturado"), value: paymentsSummary.isLoading ? null : formatBRL(paymentsSummary.data?.billed) },
        { label: ui("Pago"), value: paymentsSummary.isLoading ? null : formatBRL(paymentsSummary.data?.paid), accent: true },
        { label: ui("A receber"), value: paymentsSummary.isLoading ? null : formatBRL(paymentsSummary.data?.pending) },
        { label: "Em atraso", value: paymentsSummary.isLoading ? null : formatBRL(paymentsSummary.data?.overdue) },
        { label: "Líquido", value: paymentsSummary.isLoading ? null : formatBRL(paymentsSummary.data?.net), hint: paymentsSummary.data ? `Taxas ${formatBRL(paymentsSummary.data.fees)}` : undefined },
      ]} />

      <Tabs defaultValue="extrato" className="mt-6">
        <TabsList className="ds-tabs">
          <TabsTrigger value="extrato">Extrato</TabsTrigger>
          <TabsTrigger value="liberacoes">Próximas liberações</TabsTrigger>
          <TabsTrigger value="saques">Saques</TabsTrigger>
          <TabsTrigger value="conta">Conta bancária</TabsTrigger>
        </TabsList>

        <TabsContent value="extrato" className="surface-panel mt-4 p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mergeFeeRows(transactions ?? []).slice(0, 10).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDate(t.occurred_at)}</TableCell>
                  <TableCell>{kindLabels[t.kind] ?? t.kind}</TableCell>
                  <TableCell className="text-muted-foreground">{t.description}</TableCell>
                  <TableCell className={`numeric-tabular text-right ${Number(t.amount) < 0 ? "text-destructive" : "text-primary"}`}>
                    {formatBRL(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {!transactions?.length ? <Empty cols={4} text="Nenhuma movimentação ainda." /> : null}
            </TableBody>
          </Table>
          <div className="flex justify-end border-t border-border p-2"><Button asChild size="sm" variant="ghost"><Link to="/extrato">Ver extrato completo</Link></Button></div>
        </TabsContent>

        <TabsContent value="liberacoes" className="surface-panel mt-4 p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cobrança</TableHead>
                <TableHead>Previsão de liberação</TableHead>
                <TableHead className="text-right">Valor líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(releases ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.description ?? "Cobrança"}</TableCell>
                  <TableCell>{r.estimated_available_at ? formatDate(r.estimated_available_at) : "—"}<div className="text-xs text-muted-foreground">Previsão. Libera quando o dinheiro for confirmado.</div></TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.net_amount)}</TableCell>
                </TableRow>
              ))}
              {!releases?.length ? <Empty cols={3} text="Nada aguardando liberação." /> : null}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="saques" className="surface-panel mt-4 p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solicitado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(withdrawals ?? []).map((w) => (
                <TableRow key={w.id}>
                  <TableCell>{formatDate(w.requested_at)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{withdrawalLabels[w.status] ?? w.status}</Badge>
                  </TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(w.amount)}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(w.net_amount)}</TableCell>
                  <TableCell className="text-right">
                    {w.status === "requested" || w.status === "in_analysis" ? (
                      <Button size="sm" variant="ghost" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(w.id)}>
                        Cancelar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!withdrawals?.length ? <Empty cols={5} text="Nenhum saque solicitado." /> : null}
            </TableBody>
          </Table>
          <p className="px-3 pb-2 pt-3 text-xs text-muted-foreground">
            Saques solicitados ficam reservados e são enviados via Pix após a análise. Mínimo {formatBRL(minimum)} · taxa{" "}
            {formatBRL(fee)} · <Link to="/limites" className="text-primary underline">ver limites da conta</Link>.
          </p>
        </TabsContent>

        <TabsContent value="conta" className="surface-panel mt-4 p-6">
          {banks?.[0] ? (
            <div className="text-sm">
              <p className="font-medium">{banks[0].holder_name}</p>
              <p className="text-muted-foreground">
                Banco {banks[0].bank_code} · Agência {banks[0].agency} · Conta •••{banks[0].account_number.slice(-3)}
              </p>
              {banks[0].pix_key ? <p className="text-muted-foreground">Chave Pix cadastrada</p> : null}
              <Badge className="mt-2" variant={banks[0].verification_status === "verified" ? "default" : "secondary"}>
                {banks[0].verification_status === "verified" ? "Conta validada para saque" : "Aguardando validação"}
              </Badge>
              {banks[0].verification_status !== "verified" && banks[0].verification_notes ? <p className="mt-1 text-xs text-muted-foreground">{banks[0].verification_notes}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cadastre a conta que receberá seus saques.</p>
          )}
          <Button className="mt-4" variant="outline" onClick={() => setBankOpen(true)}>
            {banks?.length ? "Trocar conta bancária" : "Cadastrar conta bancária"}
          </Button>
        </TabsContent>
      </Tabs>

      <WithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        bankId={banks?.[0]?.id ?? null}
        available={Number(wallet?.available_balance ?? 0)}
        minimum={minimum}
        fee={fee}
      />
      <BankDialog open={bankOpen} onOpenChange={setBankOpen} />
    </div>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function useMfaState(open: boolean) {
  return useQuery({ queryKey: ["mfa-state", open], enabled: open, queryFn: getMfaState });
}

function WithdrawDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bankId: string | null;
  available: number;
  minimum: number;
  fee: number;
}) {
  const qc = useQueryClient();
  const request = useServerFn(requestWithdrawal);
  const { data: mfa } = useMfaState(props.open);
  const fetchSec = useServerFn(getWithdrawalSecurity);
  const { data: sec } = useQuery({ queryKey: ["withdrawal-security"], enabled: props.open, queryFn: () => fetchSec() });
  const needCode = sec?.required === true;
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [key, setKey] = useState(newKey);

  useEffect(() => {
    if (props.open) {
      setAmount("");
      setPassword("");
      setCode("");
      setKey(newKey());
    }
  }, [props.open]);

  const mut = useMutation({
    mutationFn: async () => {
      const value = Number(amount.replace(",", "."));
      if (!props.bankId) throw new Error("Cadastre uma conta bancária.");
      if (needCode) await ensureTwoFactor(code, true);
      return request({ data: { bankAccountId: props.bankId, amount: value, financialPassword: password, idempotencyKey: key } });
    },
    onSuccess: () => {
      toast.success("Saque solicitado.");
      props.onOpenChange(false);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar saque</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Disponível: <span className="font-medium text-foreground">{formatBRL(props.available)}</span> · mínimo{" "}
          {formatBRL(props.minimum)} · taxa {formatBRL(props.fee)}
        </p>
        {needCode && mfa && !mfa.factorId ? (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            Seu saque exige código 2FA, mas o autenticador não está ativo. Veja a página Segurança.
          </p>
        ) : null}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </div>
          <div className="space-y-2">
            <Label>Senha financeira</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
          </div>
          {needCode && mfa && !mfa.isAal2 ? (
            <div className="space-y-2">
              <Label>Código do autenticador</Label>
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={mut.isPending || !sec || (needCode && !mfa?.factorId)}>
            {mut.isPending ? "Enviando…" : "Confirmar saque"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BankDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const add = useServerFn(addBankAccount);
  const { data: mfa } = useMfaState(open);
  const empty = {
    holderName: "",
    holderDocument: "",
    bankCode: "",
    agency: "",
    accountNumber: "",
    accountType: "checking" as "checking" | "savings",
    pixKey: "",
  };
  const [form, setForm] = useState(empty);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [review, setReview] = useState(false);
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(empty);
      setPassword("");
      setCode("");
      setReview(false);
      setAgree(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mut = useMutation({
    mutationFn: async () => {
      await ensureTwoFactor(code);
      return add({ data: { ...form, holderDocument: form.holderDocument.replace(/\D/g, ""), financialPassword: password, confirmedOwnership: agree } });
    },
    onSuccess: () => {
      toast.success("Conta bancária salva.");
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["banks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conta bancária para saques</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Por segurança, a conta precisa estar no mesmo CPF ou CNPJ do cadastro da empresa. Conferimos os dados antes de liberar saques.</p>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!review) return setReview(true);
            if (agree) mut.mutate();
          }}
        >
          {review ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:col-span-2">
              <p className="font-semibold">Confira os dados antes de salvar</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Titular</dt><dd>{form.holderName}</dd>
                <dt className="text-muted-foreground">CPF/CNPJ</dt><dd>{form.holderDocument}</dd>
                <dt className="text-muted-foreground">Banco / Agência / Conta</dt><dd>{form.bankCode} / {form.agency} / {form.accountNumber}</dd>
                <dt className="text-muted-foreground">Chave Pix</dt><dd className="break-all">{form.pixKey}</dd>
              </dl>
              <p className="text-muted-foreground">O saque vai para esta chave Pix. Ela precisa estar no mesmo CPF/CNPJ da empresa. Na hora do saque, o Asaas confere a chave e recusa se houver erro.</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>Confirmo que conferi os dados e que a conta é da minha empresa. A WiizePay não se responsabiliza por transferências feitas para dados informados errado.</span>
              </label>
              <Button type="button" variant="outline" size="sm" onClick={() => { setReview(false); setAgree(false); }}>Corrigir dados</Button>
            </div>
          ) : null}
          <Field label="Titular" className="sm:col-span-2">
            <Input value={form.holderName} onChange={set("holderName")} required />
          </Field>
          <Field label="CPF/CNPJ do titular">
            <Input value={form.holderDocument} onChange={set("holderDocument")} required />
          </Field>
          <Field label="Código do banco">
            <Input value={form.bankCode} onChange={set("bankCode")} maxLength={3} placeholder="001" required />
          </Field>
          <Field label="Agência">
            <Input value={form.agency} onChange={set("agency")} required />
          </Field>
          <Field label="Conta (com dígito)">
            <Input value={form.accountNumber} onChange={set("accountNumber")} required />
          </Field>
          <Field label="Tipo">
            <Select value={form.accountType} onValueChange={(v) => setForm({ ...form, accountType: v as "checking" | "savings" })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Corrente</SelectItem>
                <SelectItem value="savings">Poupança</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chave Pix (obrigatória)">
            <Input value={form.pixKey} onChange={set("pixKey")} placeholder="CPF, CNPJ, e-mail, celular ou aleatória" required />
            <p className="text-xs text-primary">Os saques são feitos somente via Pix e caem na hora, inclusive fins de semana.</p>
          </Field>
          <Field label="Senha financeira">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
          </Field>
          {mfa && !mfa.isAal2 ? (
            <Field label="Código do autenticador">
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
            </Field>
          ) : null}
          <Button type="submit" className="sm:col-span-2" disabled={mut.isPending || !mfa?.factorId || (review && !agree)}>
            {mfa && !mfa.factorId ? "Ative a verificação em duas etapas primeiro" : mut.isPending ? "Salvando…" : review ? "Confirmar e salvar" : "Revisar dados"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
