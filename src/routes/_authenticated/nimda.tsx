import { AdminSuggestions } from "@/components/admin/admin-suggestions";
import { AdminInbox } from "@/components/admin/admin-inbox";
import { AdminWiizeCredentials } from "@/components/admin/admin-wiize-credentials";
import { AdminTracking } from "@/components/admin/admin-tracking";
import { AdminLimits } from "@/components/admin-limits";
import { AdminOnboarding } from "@/components/admin/admin-onboarding";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ADMIN_LABELS, useAdminSection, type AdminSection } from "@/components/admin/admin-nav";
import { AdminDunning } from "@/components/admin/admin-dunning";
import { AdminFeeSettings, AdminPerformance, AdminTpvSimulator, AdminUnitEconomics } from "@/components/admin/admin-unit-economics";
import { AdminFinanceDashboard, AdminReceivables, AdminRefunds, AdminRevenue, AdminTransactions, PeriodBar, useAdminFinance } from "@/components/admin/admin-finance";
import { EmptyState } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { getAdminOverview, getAdminStatus, getTenantAccounts, getTenantDetail, listAdminWithdrawals, reviewWithdrawal, updatePlatformSetting } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { AiReconciliation } from "@/components/ai-reconciliation";
import { AdminActivations } from "@/components/admin-activations";
import { AdminDashboard, AdminRecoveries, AdminUsers } from "@/components/admin-console";
import { AdminAuditSecurity } from "@/components/admin/admin-audit-security";
import { AdminUnlockGate } from "@/components/admin/admin-unlock-gate";
import { AdminPld } from "@/components/admin/admin-pld";
import { AdminCardRisk } from "@/components/admin/admin-card-risk";
import { AdminChargebacks } from "@/components/admin/admin-chargebacks";

export const Route = createFileRoute("/_authenticated/nimda")({
  head: () => ({
    meta: [
      { title: "Nimda — WiizePay" },
      { name: "description", content: "Acompanhe receita, movimentações e aprove saques da plataforma WiizePay." },
      { property: "og:title", content: "Nimda — WiizePay" },
      { property: "og:description", content: "Acompanhe receita, movimentações e aprove saques da plataforma WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    try {
      const status = await getAdminStatus();
      if (!status?.isAdmin) throw notFound();
    } catch {
      throw notFound();
    }
  },
  validateSearch: (s: Record<string, unknown>) => ({ secao: typeof s["secao"] === "string" ? s["secao"] : undefined }),
  component: AdminPage,
});

const statusLabels: Record<string, string> = {
  requested: "Aguardando aprovação",
  in_analysis: "Em análise",
  processing: "Processando",
  completed: "Aprovado",
  failed: "Recusado",
  cancelled: "Cancelado",
};
const kindLabels: Record<string, string> = {
  payment: "Recebimento",
  platform_fee: "Receita WiizePay",
  provider_fee: "Taxa do provedor",
  refund: "Estorno",
  withdrawal: "Saque",
  adjustment: "Ajuste",
};
const feeMethodLabels: Record<string, string> = {
  pix: "Pix",
  pix_recurring: "Pix Automático",
  boleto: "Boleto",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  credit_card_installment: "Cartão parcelado",
};

function AdminPage() {
  return <AdminUnlockGate><AdminContent /></AdminUnlockGate>;
}

function AdminContent() {
  const section = useAdminSection();
  const fin = useAdminFinance();
  const [drill, setDrill] = useState<{ title: string; filter: (t: any) => boolean } | null>(null);
  const navigate = useNavigate();
  const overview = useServerFn(getAdminOverview);
  const [tenantView, setTenantView] = useState<string | null>(null);
  const withdrawalsFn = useServerFn(listAdminWithdrawals);
  const { data } = useQuery({ queryKey: ["admin-overview"], queryFn: () => overview() });
  const { data: withdrawals } = useQuery({ queryKey: ["admin-withdrawals"], queryFn: () => withdrawalsFn() });
  const [review, setReview] = useState<{ id: string; decision: "approve" | "reject" } | null>(null);
  const [setting, setSetting] = useState<{ key: string; value: number; description: string | null } | null>(null);
  const queue = (withdrawals ?? []).filter((w) => ["requested", "in_analysis", "processing"].includes(w.status));
  const periodSections = ["dashboard", "unit", "transacoes", "receitas", "receber", "estornos"];
  const onDrill = (title: string, filter: (t: any) => boolean) => { setDrill({ title, filter }); void navigate({ to: "/nimda", search: { secao: "transacoes" } }); };

  const saquesView = (<div className="surface-panel p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Solicitado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Transferir</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(withdrawals ?? []).map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.tenantName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {w.bank ? (
                      <>
                        {w.bank.holder_name} · {w.bank.holder_document}
                        <br />
                        Banco {w.bank.bank_code} · Ag {w.bank.agency} · Cc {w.bank.account_number}
                        {w.bank.pix_key ? <><br />Pix: {w.bank.pix_key}</> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatDate(w.requestedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={w.status === "completed" ? "default" : "secondary"}>{statusLabels[w.status] ?? w.status}</Badge>
                    {w.reference || w.reason ? <p className="mt-1 text-xs text-muted-foreground">{w.reference ?? w.reason}</p> : null}
                  </TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(w.net)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {["requested", "in_analysis", "processing"].includes(w.status) ? (
                      <>
                        <Button size="sm" onClick={() => setReview({ id: w.id, decision: "approve" })}>
                          Aprovar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReview({ id: w.id, decision: "reject" })}>
                          Recusar
                        </Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!withdrawals?.length ? <Empty cols={6} text="Nenhum saque solicitado." /> : null}
            </TableBody>
          </Table>
          <p className="px-3 pb-2 pt-3 text-xs text-muted-foreground">
            Aprovar cria a transferência bancária e conclui o saque no sistema. Recusar devolve o valor ao saldo da empresa.
          </p></div>);
  const movView = (<div className="surface-panel p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.transactions ?? []).map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{formatDate(x.occurred_at)}</TableCell>
                  <TableCell>{x.tenantName}</TableCell>
                  <TableCell>{kindLabels[x.kind] ?? x.kind}</TableCell>
                  <TableCell className="text-muted-foreground">{x.description}</TableCell>
                  <TableCell className="numeric-tabular text-right">
                    {x.kind === "platform_fee" ? <span className="text-primary">+{formatBRL(-x.amount)}</span> : formatBRL(x.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {!data?.transactions.length ? <Empty cols={5} text="Nenhuma movimentação." /> : null}
            </TableBody>
          </Table></div>);
  const empView = (<div className="surface-panel p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Taxas</TableHead>
                <TableHead className="text-right">A liberar</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
                <TableHead className="text-right">Em saque</TableHead>
                <TableHead className="text-right">Sacado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tenants ?? []).map((x) => (
                <TableRow key={x.id} className="cursor-pointer" onClick={() => setTenantView(x.id)}>
                  <TableCell className="font-medium text-primary underline-offset-4 hover:underline">{x.name}</TableCell>
                  {[x.received, x.fees, x.pending, x.available, x.blocked, x.withdrawn].map((v, i) => (
                    <TableCell key={i} className="numeric-tabular text-right">
                      {formatBRL(v)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!data?.tenants.length ? <Empty cols={7} text="Nenhuma empresa." /> : null}
            </TableBody>
          </Table>
          <p className="px-2 py-2 text-xs text-muted-foreground">Clique em uma empresa para ver o painel completo.</p>
          </div>);
  const taxasView = (<div className="surface-panel p-2">
          <h3 className="px-2 pt-2 text-sm font-semibold">Taxas WiizePay por pagamento (valores em uso)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forma de pagamento</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.paymentFees ?? []).map((f) => (
                <TableRow key={`${f.method}-${f.min}`}>
                  <TableCell>{feeMethodLabels[f.method] ?? f.method}</TableCell>
                  <TableCell>{f.min === f.max ? `${f.min}x` : `${f.min}x a ${f.max}x`}</TableCell>
                  <TableCell className="numeric-tabular text-right">
                    {[f.pct > 0 ? `${f.pct.toLocaleString("pt-BR")}%` : null, f.fixed > 0 ? formatBRL(f.fixed) : null].filter(Boolean).join(" + ") || "Grátis"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <h3 className="px-2 pt-6 text-sm font-semibold">Taxa de antecipação (ao mês)</h3>
          <Table>
            <TableBody>
              {(data?.anticipationFees ?? []).map((f) => (
                <TableRow key={f.method}>
                  <TableCell>{feeMethodLabels[f.method] ?? f.method}</TableCell>
                  <TableCell className="numeric-tabular text-right">{f.pct.toLocaleString("pt-BR")}% a.m.</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <h3 className="px-2 pt-6 text-sm font-semibold">Regras de saque</h3>
          <Table>
            <TableBody>
              {(data?.settings ?? []).map((x) => (
                <TableRow key={x.key}>
                  <TableCell>{x.key === "minimum_withdrawal_amount" ? "Valor mínimo de saque" : x.key === "pix_daily_limit" ? "Limite diário de saque Pix (por empresa)" : "Taxa por saque"}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(x.value)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSetting(x)}>
                      Alterar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>);
  const soon = (title: string, text: string) => <EmptyState title={title} text={text} />;

  const views: Record<AdminSection, ReactNode> = {
    dashboard: <div className="space-y-6"><AdminPerformance f={fin} /><AdminFinanceDashboard f={fin} onDrill={onDrill} /></div>,
    unit: <AdminUnitEconomics f={fin} />,
    regua: <AdminDunning />,
    simulador: <AdminTpvSimulator />,
    visao: <AdminDashboard />,
    transacoes: <AdminTransactions f={fin} preset={drill} />,
    receitas: <AdminRevenue f={fin} />,
    despesas: soon("Nenhuma despesa própria registrada", "Os custos do provedor já aparecem em Receitas e Taxas. O cadastro de despesas internas da WiizePay (infraestrutura, software, marketing etc.) será a próxima etapa."),
    taxas: <div className="space-y-6"><AdminFeeSettings />{taxasView}</div>,
    contas: <div className="surface-panel p-2"><ContasEmpresas /></div>,
    receber: <AdminReceivables f={fin} />,
    pagar: saquesView,
    conciliacao: <div className="space-y-6"><div className="surface-panel p-2"><AiReconciliation tenants={(data?.tenants ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))} /></div><AdminDashboard /></div>,
    pagamentos: movView,
    cobrancas: <AdminReceivables f={fin} />,
    clientes: empView,
    faturas: soon("Notas fiscais", "As taxas de notas fiscais autorizadas aparecem em Receitas. Nenhuma nota adicional para revisar aqui."),
    saques: saquesView,
    chargebacks: <AdminChargebacks />,
    estornos: <AdminRefunds f={fin} />,
    empresas: <div className="space-y-6"><div className="surface-panel p-4"><AdminUsers /></div>{empView}</div>,
    publico: <AdminOnboarding />,
    analise: <AdminActivations />,
    aprovacoes: <div className="space-y-6">{saquesView}<div className="surface-panel p-2"><AdminRecoveries /></div></div>,
    caixa: <AdminInbox />,
    sugestoes: <AdminSuggestions />,
    suporte: soon("Suporte", "Os atendimentos são feitos pelo canal oficial de contato da WiizePay."),
    auditoria: <AdminAuditSecurity />,
    pld: <AdminPld />,
    antifraude: <AdminCardRisk />,
    configuracoes: <div className="space-y-6"><AdminWiizeCredentials /><AdminTracking />{taxasView}<AdminLimits /></div>,
    permissoes: soon("Permissões", "Hoje existe um único papel administrativo, com verificação em duas etapas obrigatória. Papéis separados (financeiro, suporte, leitura) virão numa próxima etapa."),
    admins: <div className="surface-panel p-4"><AdminUsers /></div>,
  };

  return (
    <div>
      <PageHeader title={section === "dashboard" ? "Dashboard Admin" : ADMIN_LABELS[section]} description={section === "dashboard" ? "Centro de controle financeiro da WiizePay." : "Área administrativa WiizePay."} />
      {periodSections.includes(section) ? <PeriodBar f={fin} /> : null}
      {section === "transacoes" && drill ? <div className="mb-3"><Button size="sm" variant="ghost" onClick={() => setDrill(null)}>Limpar filtro “{drill.title}”</Button></div> : null}
      {views[section]}
      <TenantDetailDialog tenantId={tenantView} onClose={() => setTenantView(null)} />
      <ReviewDialog review={review} onClose={() => setReview(null)} />
      <SettingDialog setting={setting} onClose={() => setSetting(null)} />
    </div>
  );
}

function ReviewDialog({ review, onClose }: { review: { id: string; decision: "approve" | "reject" } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(reviewWithdrawal);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: () => fn({ data: { withdrawalId: review!.id, decision: review!.decision, note, financialPassword: password } }),
    onSuccess: () => {
      toast.success(review?.decision === "approve" ? "Saque aprovado." : "Saque recusado.");
      setNote("");
      setPassword("");
      onClose();
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={Boolean(review)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{review?.decision === "approve" ? "Aprovar saque" : "Recusar saque"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>{review?.decision === "approve" ? "Observação interna (opcional)" : "Motivo da recusa"}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} required={review?.decision === "reject"} />
          </div>
          <div className="space-y-2">
            <Label>Sua senha financeira</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
          </div>
          <Button className="w-full" variant={review?.decision === "reject" ? "destructive" : "default"} disabled={mut.isPending}>
            {review?.decision === "approve" ? "Aprovar e transferir" : "Confirmar recusa"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingDialog({ setting, onClose }: { setting: { key: string; value: number; description: string | null } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(updatePlatformSetting);
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: () => fn({ data: { key: setting!.key as never, value: Number(value.replace(",", ".")), financialPassword: password } }),
    onSuccess: () => {
      toast.success("Configuração atualizada.");
      setValue("");
      setPassword("");
      onClose();
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={Boolean(setting)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{setting?.description ?? setting?.key}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Novo valor (atual: {setting?.value})</Label>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Sua senha financeira</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
          </div>
          <p className="text-xs text-muted-foreground">Vale apenas para novas cobranças e saques. A alteração fica registrada na auditoria.</p>
          <Button className="w-full" disabled={mut.isPending}>
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`numeric-tabular mt-2 text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
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

function ContasEmpresas() {
  const fn = useServerFn(getTenantAccounts);
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["admin-accounts"], queryFn: () => fn() });
  const labels: Record<string, string> = { gross_amount: "Valor da cobrança", platform_fee: "Taxa WiizePay" };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 px-2 pt-2">
        <p className="text-sm text-muted-foreground">
          Saldo real na conta de cada empresa comparado com o saldo do sistema (disponível + em saque). Valores a liberar ainda não entram no saldo real.
        </p>
        <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>Atualizar</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead className="text-right">A liberar</TableHead>
            <TableHead className="text-right">Saldo no sistema</TableHead>
            <TableHead className="text-right">Saldo real</TableHead>
            <TableHead className="text-right">Diferença</TableHead>
            <TableHead className="text-right">Alertas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <Empty cols={7} text="Carregando…" /> : null}
          {(data?.rows ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(r.pending)}</TableCell>
              <TableCell className="numeric-tabular text-right">{formatBRL(r.systemBalance)}</TableCell>
              <TableCell className="numeric-tabular text-right">{r.providerBalance == null ? "—" : formatBRL(r.providerBalance)}</TableCell>
              <TableCell className={`numeric-tabular text-right ${r.difference ? "text-destructive" : ""}`}>{r.difference == null ? "—" : formatBRL(r.difference)}</TableCell>
              <TableCell className="text-right">{r.issues ? <Badge variant="destructive">{r.issues}</Badge> : "0"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <h3 className="px-2 font-medium">Divergências de valores</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">WiizePay</TableHead>
              <TableHead className="text-right">Provedor</TableHead>
              <TableHead>Detectado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.issues ?? []).map((i, idx) => (
              <TableRow key={idx}>
                <TableCell>{i.tenant}</TableCell>
                <TableCell>{labels[i.kind] ?? i.kind}</TableCell>
                <TableCell className="numeric-tabular text-right">{formatBRL(i.expected)}</TableCell>
                <TableCell className="numeric-tabular text-right">{formatBRL(i.actual)}</TableCell>
                <TableCell>{formatDate(i.created_at)}</TableCell>
              </TableRow>
            ))}
            {!data?.issues.length ? <Empty cols={5} text="Nenhuma divergência encontrada." /> : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const PAY_STATUS: Record<string, string> = {
  created: "Criada", awaiting_payment: "Aguardando", processing: "Processando", paid: "Paga", overdue: "Vencida",
  cancelled: "Cancelada", refunded: "Estornada", in_analysis: "Em análise", failed: "Falhou",
};
const ANT_STATUS: Record<string, string> = { pending: "Pendente", processing: "Em processamento", completed: "Concluída", failed: "Falhou", cancelled: "Cancelada" };

function TenantDetailDialog({ tenantId, onClose }: { tenantId: string | null; onClose: () => void }) {
  const fetchDetail = useServerFn(getTenantDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tenant", tenantId],
    queryFn: () => fetchDetail({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });
  const paid = (data?.payments ?? []).filter((p) => p.status === "paid");
  const wiize = paid.reduce((s, p) => s + p.fee - p.providerFee, 0);
  return (
    <Dialog open={!!tenantId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.tenant.name ?? "Empresa"}</DialogTitle>
        </DialogHeader>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
        {data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Recebido (bruto)" value={formatBRL(data.wallet.received)} />
              <Stat label="A liberar" value={formatBRL(data.wallet.pending)} />
              <Stat label="Disponível" value={formatBRL(data.wallet.available)} highlight />
              <Stat label="Em saque" value={formatBRL(data.wallet.blocked)} />
              <Stat label="Sacado" value={formatBRL(data.wallet.withdrawn)} />
              <Stat label="Taxas pagas à WiizePay" value={formatBRL(data.wallet.fees)} />
              <Stat label="Lucro WiizePay (após custo)" value={formatBRL(wiize)} highlight />
              <Stat label="Cobranças pagas" value={String(paid.length)} />
            </div>

            <div>
              <h3 className="mb-2 font-medium">Cobranças</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead>Previsão / Liberado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.customer}</TableCell>
                      <TableCell><Badge variant={p.status === "paid" ? "default" : "outline"}>{PAY_STATUS[p.status] ?? p.status}</Badge></TableCell>
                      <TableCell>{formatDate(p.dueOn)}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(p.gross)}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(p.fee)}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(p.net)}</TableCell>
                      <TableCell>{p.releasedAt ? <>Liberado {formatDate(p.releasedAt)}</> : p.availableOn ? <>Previsão {formatDate(p.availableOn)}</> : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!data.payments.length ? <Empty cols={7} text="Nenhuma cobrança." /> : null}
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 font-medium">Antecipações</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Taxa WiizePay</TableHead>
                    <TableHead className="text-right">Custo provedor</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.anticipations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{formatDate(a.createdAt)}</TableCell>
                      <TableCell title={a.reason ?? undefined}>{ANT_STATUS[a.status] ?? a.status}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(a.gross)}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(a.fee)}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(a.providerFee)}</TableCell>
                      <TableCell className="numeric-tabular text-right">{formatBRL(a.net)}</TableCell>
                    </TableRow>
                  ))}
                  {!data.anticipations.length ? <Empty cols={6} text="Nenhuma antecipação." /> : null}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
