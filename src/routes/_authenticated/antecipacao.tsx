import { Link, createFileRoute } from "@tanstack/react-router";
import { TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { SummaryStrip, StatusBadge } from "@/components/ds";
import { listReceivables, requestAnticipation, simulateReceivable } from "@/lib/anticipation.functions";
import { ensureTwoFactor } from "@/lib/mfa-step-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDate } from "@/lib/format";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/antecipacao")({
  head: () => ({
    meta: [
      { title: "Receba mais rápido — WiizePay" },
      { name: "description", content: "Antecipe recebíveis já pagos e elegíveis e acompanhe o histórico de antecipações." },
      { property: "og:title", content: "Receba mais rápido — WiizePay" },
      { property: "og:description", content: "Antecipe recebíveis já pagos e elegíveis e acompanhe o histórico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Antecipacao,
});

const methodLabel: Record<string, string> = { credit_card: "Cartão", boleto: "Boleto", pix: "Pix", debit_card: "Débito" };
const statusLabel: Record<string, string> = {
  paid: "Pago", awaiting_payment: "Pendente", overdue: "Vencido", in_analysis: "Em análise",
  pending: "Solicitada", processing: "Processando", completed: "Concluída", failed: "Não realizada", cancelled: "Cancelada",
};

type Sim = { paymentId: string; receivableNet: number; grossAmount: number; fee: number; netAmount: number; days: number };

function Antecipacao() {
  const { t: ui } = useTranslation("ui");
  const list = useServerFn(listReceivables);
  const simulate = useServerFn(simulateReceivable);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["receivables"], queryFn: () => list() });
  const [sim, setSim] = useState<Sim | null>(null);
  const check = useMutation({
    mutationFn: (v: { id: string; net: number }) => simulate({ data: { paymentId: v.id } }).then((r) => ({ ...r, paymentId: v.id, receivableNet: v.net })),
    onSuccess: (r) => (r.eligible ? setSim(r as Sim) : toast.info(r.reason ?? "Este recebível ainda não está disponível para antecipação.")),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Receba mais rápido")} description="Antecipe valores elegíveis e receba antes da data normal de disponibilização." />
      <SummaryStrip
        items={[
          { label: "Líquido disponível para antecipar", value: data ? formatBRL(data.candidateTotal ?? 0) : null, accent: true, hint: "Já descontadas as taxas da cobrança" },
          { label: "Recebíveis em aberto", value: data ? String(data.receivables.length) : null },
          { label: "Liberados para antecipar", value: data ? String(data.receivables.filter((r) => r.canCheck).length) : null },
        ]}
      />
      <section className="surface-panel p-5 text-xs text-muted-foreground sm:p-6">
        <div>
          <p className="font-display text-sm font-semibold text-foreground">{ui("Como funciona")}</p>
          <p className="mt-1">Cada pagamento tem uma <b>previsão de liberação</b> (Pix até 1 dia útil, boleto no próximo dia útil após a compensação, débito até 3 dias úteis, crédito até 32 dias corridos). O saldo só fica disponível quando o dinheiro é confirmado. Só aparece "Receber mais rápido" quando o provedor libera aquele recebível para antecipação. A antecipação está sujeita à análise: até 2 dias úteis no cartão e até 3 dias úteis no boleto e no Pix. <Link to="/prazos" className="text-primary underline">Ver todos os prazos</Link>.</p>
        </div>
      </section>
      <Tabs defaultValue="recebiveis">
        <TabsList className="ds-tabs"><TabsTrigger value="recebiveis">{ui("Recebíveis")}</TabsTrigger><TabsTrigger value="historico">Histórico de antecipações</TabsTrigger></TabsList>
        <TabsContent value="recebiveis" className="surface-panel mt-4 overflow-x-auto p-2">
          <Table>
            <TableHeader><TableRow><TableHead>{ui("Cliente")}</TableHead><TableHead>Método</TableHead><TableHead className="text-right">Valor bruto</TableHead><TableHead className="text-right">Líquido</TableHead><TableHead>Status</TableHead><TableHead>Previsão de liberação</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRowsSkeleton cols={7} />}
              {isError && <TableStateRow cols={7}><ErrorState onRetry={() => refetch()} /></TableStateRow>}
              {data?.receivables.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nenhum recebível aguardando liberação.</TableCell></TableRow>}
              {data?.receivables.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.customer}<div className="text-xs text-muted-foreground">{r.description}{r.installment ? ` · parcela ${r.installment}` : ""}</div></TableCell>
                  <TableCell>{methodLabel[r.method ?? ""] ?? "—"}</TableCell>
                  <TableCell className="numeric-tabular text-right text-muted-foreground">{formatBRL(r.grossAmount)}</TableCell>
                  <TableCell className="numeric-tabular text-right font-medium">{formatBRL(r.netAmount)}</TableCell>
                  <TableCell><StatusBadge tone={r.status === "paid" ? "success" : "neutral"}>{statusLabel[r.status] ?? r.status}</StatusBadge></TableCell>
                  <TableCell>{r.availableOn ? formatDate(r.availableOn) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.canCheck ? (
                      <Button size="sm" disabled={check.isPending} onClick={() => check.mutate({ id: r.id, net: r.netAmount })}>Receber mais rápido</Button>
                    ) : (<span className="text-xs text-muted-foreground">{r.reason}</span>)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="historico" className="surface-panel mt-4 overflow-x-auto p-2">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Recebível</TableHead><TableHead>Método</TableHead><TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Líquido</TableHead><TableHead>Status</TableHead><TableHead>IDs</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.history.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nenhuma antecipação ainda.</TableCell></TableRow>}
              {data?.history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{formatDate(h.createdAt)}</TableCell>
                  <TableCell>{h.receivable}<div className="text-xs text-muted-foreground">{h.customer}</div></TableCell>
                  <TableCell>{methodLabel[h.method ?? ""] ?? "—"}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(h.grossAmount)}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(h.wiizeFee)}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(h.netAmount)}</TableCell>
                  <TableCell><StatusBadge>{statusLabel[h.status] ?? h.status}</StatusBadge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{h.providerPaymentId ?? "—"}<br />{h.anticipationId ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
      {sim && <ConfirmDialog sim={sim} onClose={() => setSim(null)} />}
    </div>
  );
}

function ConfirmDialog({ sim, onClose }: { sim: Sim; onClose: () => void }) {
  const request = useServerFn(requestAnticipation);
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const confirm = useMutation({
    mutationFn: async () => {
      await ensureTwoFactor(code);
      return request({ data: { paymentId: sim.paymentId, expectedNet: sim.netAmount, financialPassword: password, idempotencyKey: key } });
    },
    onSuccess: () => { toast.success("Antecipação enviada ao Asaas. Avisaremos quando o crédito for confirmado."); qc.invalidateQueries({ queryKey: ["receivables"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Antecipar recebível</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Confira os valores antes de confirmar. A antecipação é feita diretamente com o Asaas, sem aprovação da WiizePay.</p>
        <dl className="numeric-tabular space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between text-muted-foreground"><dt>Valor da cobrança</dt><dd>{formatBRL(sim.grossAmount)}</dd></div>
          <div className="flex justify-between"><dt>Líquido do recebível</dt><dd>{formatBRL(sim.receivableNet)}</dd></div>
          <div className="flex justify-between text-destructive"><dt>Taxa de antecipação ({sim.days} dias)</dt><dd>- {formatBRL(sim.fee)}</dd></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Vai sobrar para você</dt><dd className="text-primary">{formatBRL(Math.max(0, sim.receivableNet - sim.fee))}</dd></div>
          <div className="flex justify-between text-xs text-muted-foreground"><dt>Crédito</dt><dd>após confirmação do Asaas</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">Valores simulados pelo Asaas; o crédito final é o confirmado por ele.</p>
        <div className="space-y-2"><Label>Senha financeira</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="space-y-2"><Label>Código do autenticador (se solicitado)</Label><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <Button disabled={!password || confirm.isPending} onClick={() => confirm.mutate()}>Confirmar antecipação</Button>
      </DialogContent>
    </Dialog>
  );
}
