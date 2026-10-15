import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard, StatGrid, StatusBadge } from "@/components/ds";
import { formatBRL, formatDate } from "@/lib/format";
import { getAdminConsole, listAdminUsers, listAuditLogs, listRecoveryRequests, reviewRecoveryRequest } from "@/lib/mfa-recovery.functions";
import { getWalletConsistency } from "@/lib/admin.functions";

const PERIODS = [1, 7, 30, 90] as const;
const METHOD: Record<string, string> = { pix: "Pix", credit_card: "Cartão", boleto: "Boleto", debit_card: "Débito" };

export function AdminDashboard() {
  const [days, setDays] = useState<number>(30);
  const fn = useServerFn(getAdminConsole);
  const { data: d, isLoading } = useQuery({ queryKey: ["admin-console", days], queryFn: () => fn({ data: { days } }) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button key={p} size="sm" variant={days === p ? "default" : "outline"} onClick={() => setDays(p)}>{p === 1 ? "Hoje" : `${p} dias`}</Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Volume processado é dinheiro dos clientes. Receita Wiize Core é só o que fica para a plataforma.</p>
      <StatGrid>
        <StatCard label="Volume processado" loading={isLoading} value={formatBRL(d?.volume ?? 0)} hint={`${d?.paymentsCount ?? 0} pagamentos`} />
        <StatCard label="Receita Wiize Core" loading={isLoading} value={formatBRL(d?.revenue ?? 0)} hint="Cobranças + saques + notas" />
        <StatCard label="Custo do provedor" loading={isLoading} value={formatBRL(d?.providerCost ?? 0)} />
        <StatCard label="Aprovações pendentes" loading={isLoading} value={(d?.pending.withdrawals ?? 0) + (d?.pending.activations ?? 0) + (d?.pending.recoveries ?? 0)} hint={`${d?.pending.withdrawals ?? 0} saques · ${d?.pending.activations ?? 0} ativações · ${d?.pending.recoveries ?? 0} 2FA`} />
      </StatGrid>
      <StatGrid>
        <StatCard label="Margem em cobranças" loading={isLoading} value={formatBRL(d?.chargeMargin ?? 0)} />
        <StatCard label="Taxas de saque" loading={isLoading} value={formatBRL(d?.withdrawalFees ?? 0)} />
        <StatCard label="Taxas de notas fiscais" loading={isLoading} value={formatBRL(d?.invoiceFees ?? 0)} />
        <StatCard label="Empresas cadastradas" loading={isLoading} value={d?.companies ?? 0} />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Rank title="Receita por meio de pagamento" rows={Object.entries(d?.byMethod ?? {}).map(([k, v]) => [METHOD[k] ?? k, v])} />
        <Rank title="Maiores clientes por volume" rows={(d?.topVolume ?? []).map((t) => [t.name, t.volume])} />
        <Rank title="Maiores clientes por receita gerada" rows={(d?.topRevenue ?? []).map((t) => [t.name, t.receita])} />
      </div>
      <Consistency />
    </div>
  );
}

function Consistency() {
  const fn = useServerFn(getWalletConsistency);
  const { data, isLoading, isError } = useQuery({ queryKey: ["wallet-consistency"], queryFn: () => fn() });
  return (
    <section className="surface-panel p-5">
      <h3 className="text-sm font-semibold">Conferência de saldos</h3>
      <p className="mt-1 text-xs text-muted-foreground">Compara o extrato de cada empresa com o saldo da carteira. Só mostra, não altera valores.</p>
      {isLoading ? <p className="mt-3 text-xs text-muted-foreground">Conferindo…</p>
        : isError ? <p className="mt-3 text-xs text-destructive">Não foi possível conferir agora.</p>
        : !data?.length ? <p className="mt-3 text-sm">Tudo certo: nenhuma diferença encontrada.</p>
        : (
          <ul className="mt-3 space-y-2 text-sm">
            {data.map((r) => <li key={r.tenant_id} className="flex justify-between gap-2"><span className="truncate">{r.tenant_name}</span><span className="numeric-tabular font-medium text-destructive">{formatBRL(Number(r.difference))}</span></li>)}
          </ul>
        )}
    </section>
  );
}

function Rank({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <section className="surface-panel p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Sem dados no período.</p> : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="numeric-tabular font-medium">{formatBRL(v)}</span></li>)}
        </ul>
      )}
    </section>
  );
}

const ACT: Record<string, string> = { approved: "Aprovada", submitted: "Enviada", under_review: "Em análise", not_started: "Não iniciada", rejected: "Recusada" };

export function AdminUsers() {
  const fn = useServerFn(listAdminUsers);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const rows = data.filter((u) => `${u.email} ${u.name ?? ""} ${u.company ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <Input placeholder="Buscar por nome, e-mail ou empresa" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <Table>
        <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Empresa</TableHead><TableHead>Ativação</TableHead><TableHead>2FA</TableHead><TableHead>Último acesso</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5}>Carregando…</TableCell></TableRow> : rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell><p className="font-medium">{u.name ?? "—"}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
              <TableCell>{u.company ?? "—"}</TableCell>
              <TableCell>{u.activation ? <StatusBadge tone={u.activation === "approved" ? "success" : "neutral"}>{ACT[u.activation] ?? u.activation}</StatusBadge> : "—"}</TableCell>
              <TableCell><StatusBadge tone={u.has2fa ? "success" : "warning"}>{u.has2fa ? "Ativa" : "Inativa"}</StatusBadge></TableCell>
              <TableCell>{u.lastSignInAt ? formatDate(u.lastSignInAt) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AdminRecoveries() {
  const qc = useQueryClient();
  const fn = useServerFn(listRecoveryRequests);
  const review = useServerFn(reviewRecoveryRequest);
  const { data = [] } = useQuery({ queryKey: ["admin-recoveries"], queryFn: () => fn() });
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function act(id: string, approve: boolean) {
    try {
      await review({ data: { id, approve, note: notes[id] ?? "" } });
      toast.success(approve ? "Autenticador do usuário removido." : "Pedido recusado.");
      void qc.invalidateQueries({ queryKey: ["admin-recoveries"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  if (data.length === 0) return <p className="p-4 text-sm text-muted-foreground">Nenhum pedido de recuperação.</p>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Motivo</TableHead><TableHead>Situação</TableHead><TableHead>Análise</TableHead></TableRow></TableHeader>
      <TableBody>
        {data.map((r) => (
          <TableRow key={r.id}>
            <TableCell><p className="font-medium">{r.email}</p><p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p></TableCell>
            <TableCell className="max-w-xs text-sm">{r.reason}</TableCell>
            <TableCell><StatusBadge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status === "pending" ? "Pendente" : r.status === "approved" ? "Aprovado" : "Recusado"}</StatusBadge></TableCell>
            <TableCell>
              {r.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <Input className="w-48" placeholder="Motivo da decisão" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <Button size="sm" disabled={(notes[r.id] ?? "").length < 5} onClick={() => act(r.id, true)}>Aprovar</Button>
                  <Button size="sm" variant="outline" disabled={(notes[r.id] ?? "").length < 5} onClick={() => act(r.id, false)}>Recusar</Button>
                </div>
              ) : <span className="text-xs text-muted-foreground">{r.review_note}</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AdminAudit() {
  const [q, setQ] = useState("");
  const fn = useServerFn(listAuditLogs);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-audit", q], queryFn: () => fn({ data: q ? { q } : {} }) });
  return (
    <div className="space-y-3">
      <Input placeholder="Filtrar por ação (ex.: withdrawal, mfa)" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <p className="text-xs text-muted-foreground">Registros somente leitura: não podem ser editados nem apagados.</p>
      <Table>
        <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Quem</TableHead><TableHead>Ação</TableHead><TableHead>Resultado</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5}>Carregando…</TableCell></TableRow> : data.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
              <TableCell className="text-xs">{r.email}</TableCell>
              <TableCell className="font-mono text-xs">{r.action}</TableCell>
              <TableCell><StatusBadge tone={r.result === "success" ? "success" : "danger"}>{r.result}</StatusBadge></TableCell>
              <TableCell className="text-xs">{r.ip_address ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
